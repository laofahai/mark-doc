use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_IMPORT_TEMP_ID: AtomicU64 = AtomicU64::new(0);
static NEXT_IMPORT_STAGING_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxImportResult {
    pub workspace_root: String,
    pub markdown_path: String,
    pub assets_path: String,
}

fn normalize_imported_media_paths(
    markdown: &str,
    workspace_root: &Path,
    media_root: &Path,
    assets_root: &Path,
    relocated_media: &BTreeMap<PathBuf, PathBuf>,
) -> String {
    let link_pattern = regex::Regex::new(
        r"(?P<prefix>!?\[[^\]]*\]\()(?P<destination><[^>\n]+>|[^)\s]+)(?P<suffix>(?:\s+[^)]*)?\))",
    )
    .expect("valid Markdown link pattern");

    let normalized_markdown_links = link_pattern
        .replace_all(markdown, |captures: &regex::Captures| {
            let destination = &captures["destination"];
            format!(
                "{}{}{}",
                &captures["prefix"],
                normalize_imported_media_destination(
                    destination,
                    workspace_root,
                    media_root,
                    assets_root,
                    relocated_media,
                ),
                &captures["suffix"]
            )
        })
        .into_owned();
    normalize_imported_media_html_attributes(
        &normalized_markdown_links,
        workspace_root,
        media_root,
        assets_root,
        relocated_media,
    )
}

fn normalize_imported_media_html_attributes(
    markdown: &str,
    workspace_root: &Path,
    media_root: &Path,
    assets_root: &Path,
    relocated_media: &BTreeMap<PathBuf, PathBuf>,
) -> String {
    let attribute_pattern =
        regex::Regex::new(r#"(?P<prefix>\b(?:src|href|poster)\s*=\s*)(?P<quote>["'])(?P<destination>[^"']+)(?P<suffix>["'])"#)
            .expect("valid HTML resource attribute pattern");

    attribute_pattern
        .replace_all(markdown, |captures: &regex::Captures| {
            let destination = &captures["destination"];
            format!(
                "{}{}{}{}",
                &captures["prefix"],
                &captures["quote"],
                normalize_imported_media_destination(
                    destination,
                    workspace_root,
                    media_root,
                    assets_root,
                    relocated_media,
                ),
                &captures["suffix"]
            )
        })
        .into_owned()
}

fn normalize_imported_media_destination(
    destination: &str,
    workspace_root: &Path,
    media_root: &Path,
    assets_root: &Path,
    relocated_media: &BTreeMap<PathBuf, PathBuf>,
) -> String {
    let (path, wrapped) = destination
        .strip_prefix('<')
        .and_then(|path| path.strip_suffix('>'))
        .map(|path| (path, true))
        .unwrap_or((destination, false));

    let normalized = if is_external_or_anchor(path) {
        path.to_string()
    } else {
        let source_path = Path::new(path);
        let workspace_assets_path = assets_root
            .strip_prefix(workspace_root)
            .ok()
            .filter(|relative| !relative.as_os_str().is_empty())
            .unwrap_or(Path::new("assets"));

        let staged_relative_path = if source_path.is_absolute() {
            source_path.strip_prefix(media_root).ok()
        } else if source_path.starts_with("media") {
            Some(source_path)
        } else {
            None
        };

        if let Some(final_relative_path) =
            staged_relative_path.and_then(|relative_path| relocated_media.get(relative_path))
        {
            return wrap_markdown_destination(
                markdown_path_string(&workspace_assets_path.join(final_relative_path))
                    .unwrap_or_else(|| path.to_string()),
                wrapped,
            );
        }

        if source_path.is_absolute() {
            source_path
                .strip_prefix(media_root)
                .ok()
                .map(|relative| workspace_assets_path.join(relative))
                .and_then(|relative| markdown_path_string(&relative))
                .or_else(|| {
                    source_path
                        .strip_prefix(assets_root)
                        .ok()
                        .map(|relative| workspace_assets_path.join(relative))
                        .and_then(|relative| markdown_path_string(&relative))
                })
                .unwrap_or_else(|| path.to_string())
        } else if source_path.starts_with(workspace_assets_path) {
            path.to_string()
        } else if source_path.starts_with("media") {
            markdown_path_string(&workspace_assets_path.join(source_path))
                .unwrap_or_else(|| path.to_string())
        } else {
            path.to_string()
        }
    };

    wrap_markdown_destination(normalized, wrapped)
}

fn wrap_markdown_destination(destination: String, wrapped: bool) -> String {
    if wrapped {
        format!("<{}>", destination)
    } else {
        destination
    }
}

fn is_external_or_anchor(path: &str) -> bool {
    path.starts_with('#')
        || path.starts_with("data:")
        || path.starts_with("mailto:")
        || path.contains("://")
}

fn markdown_path_string(path: &Path) -> Option<String> {
    path.to_str().map(|path| path.replace('\\', "/"))
}

fn write_imported_markdown(markdown_path: &Path, markdown: &str) -> Result<(), String> {
    let workspace_path = markdown_path
        .parent()
        .ok_or_else(|| "workspace.writeFailed".to_string())?;
    let (temporary_markdown_path, mut file) = create_unique_temporary_markdown(workspace_path)?;
    let result = (|| {
        file.write_all(markdown.as_bytes())
            .map_err(|_| "workspace.writeFailed".to_string())?;
        file.sync_all()
            .map_err(|_| "workspace.writeFailed".to_string())?;
        drop(file);
        fs::rename(&temporary_markdown_path, markdown_path)
            .map_err(|_| "workspace.writeFailed".to_string())
    })();

    if result.is_err() {
        let _ = fs::remove_file(temporary_markdown_path);
    }
    result
}

fn create_unique_temporary_markdown(workspace_path: &Path) -> Result<(PathBuf, fs::File), String> {
    for _ in 0..128 {
        let attempt_id = NEXT_IMPORT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let temporary_markdown_path = workspace_path.join(format!(
            ".document.md.importing-{}-{}",
            std::process::id(),
            attempt_id
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_markdown_path)
        {
            Ok(file) => return Ok((temporary_markdown_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("workspace.writeFailed".to_string()),
        }
    }

    Err("workspace.writeFailed".to_string())
}

fn create_unique_import_staging_directory(workspace_path: &Path) -> Result<PathBuf, String> {
    for _ in 0..128 {
        let attempt_id = NEXT_IMPORT_STAGING_ID.fetch_add(1, Ordering::Relaxed);
        let staging_path = workspace_path.join(format!(
            ".markdoc-docx-import-media-{}-{}",
            std::process::id(),
            attempt_id
        ));
        match fs::create_dir(&staging_path) {
            Ok(()) => return Ok(staging_path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("workspace.createFailed".to_string()),
        }
    }

    Err("workspace.createFailed".to_string())
}

fn merge_staged_media(
    staging_path: &Path,
    assets_path: &Path,
) -> Result<BTreeMap<PathBuf, PathBuf>, String> {
    fs::create_dir_all(assets_path).map_err(|_| "workspace.createFailed".to_string())?;
    let mut relocated_media = BTreeMap::new();
    copy_staged_media(
        staging_path,
        staging_path,
        assets_path,
        assets_path,
        &mut relocated_media,
    )?;
    fs::remove_dir_all(staging_path).map_err(|_| "workspace.writeFailed".to_string())?;
    Ok(relocated_media)
}

fn copy_staged_media(
    source_root: &Path,
    source_directory: &Path,
    target_root: &Path,
    target_directory: &Path,
    relocated_media: &mut BTreeMap<PathBuf, PathBuf>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(source_directory)
        .map_err(|_| "workspace.writeFailed".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "workspace.writeFailed".to_string())?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let source_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|_| "workspace.writeFailed".to_string())?;

        if file_type.is_dir() {
            let target_path =
                create_or_select_destination_directory(target_directory, &entry.file_name())?;
            copy_staged_media(
                source_root,
                &source_path,
                target_root,
                &target_path,
                relocated_media,
            )?;
        } else if file_type.is_file() {
            let target_path =
                copy_file_without_overwrite(&source_path, target_directory, &entry.file_name())?;
            relocated_media.insert(
                source_path
                    .strip_prefix(source_root)
                    .map_err(|_| "workspace.writeFailed".to_string())?
                    .to_path_buf(),
                target_path
                    .strip_prefix(target_root)
                    .map_err(|_| "workspace.writeFailed".to_string())?
                    .to_path_buf(),
            );
        } else {
            return Err("workspace.writeFailed".to_string());
        }
    }
    Ok(())
}

fn create_or_select_destination_directory(
    parent: &Path,
    file_name: &OsStr,
) -> Result<PathBuf, String> {
    for collision_index in 0_u64.. {
        let candidate = parent.join(collision_safe_name(file_name, collision_index));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if fs::symlink_metadata(&candidate)
                    .map(|metadata| metadata.file_type().is_dir())
                    .unwrap_or(false)
                {
                    return Ok(candidate);
                }
            }
            Err(_) => return Err("workspace.createFailed".to_string()),
        }
    }
    unreachable!("collision index exhausted")
}

fn copy_file_without_overwrite(
    source_path: &Path,
    target_directory: &Path,
    file_name: &OsStr,
) -> Result<PathBuf, String> {
    for collision_index in 0_u64.. {
        let target_path = target_directory.join(collision_safe_name(file_name, collision_index));
        match install_staged_file(source_path, &target_path) {
            Ok(true) => return Ok(target_path),
            Ok(false) => continue,
            Err(()) => return Err("workspace.writeFailed".to_string()),
        }
    }
    unreachable!("collision index exhausted")
}

fn install_staged_file(source_path: &Path, target_path: &Path) -> Result<bool, ()> {
    match fs::hard_link(source_path, target_path) {
        Ok(()) => return Ok(true),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
        Err(_) => {}
    }

    let mut target_file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
        Err(_) => return Err(()),
    };

    let result = (|| {
        let mut source_file = fs::File::open(source_path).map_err(|_| ())?;
        io::copy(&mut source_file, &mut target_file).map_err(|_| ())?;
        target_file.sync_all().map_err(|_| ())
    })();
    if result.is_err() {
        let _ = fs::remove_file(target_path);
    }
    result.map(|()| true)
}

fn collision_safe_name(file_name: &OsStr, collision_index: u64) -> OsString {
    if collision_index == 0 {
        return file_name.to_os_string();
    }

    let path = Path::new(file_name);
    let mut candidate = path.file_stem().unwrap_or(file_name).to_os_string();
    candidate.push(format!("-{}", collision_index));
    if let Some(extension) = path.extension() {
        candidate.push(".");
        candidate.push(extension);
    }
    candidate
}

pub fn import_docx_to_workspace(
    input_path: String,
    workspace_root: String,
) -> Result<DocxImportResult, String> {
    import_docx_to_workspace_with_runner(&input_path, workspace_root, |args| {
        let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
            .args(args)
            .output()
            .map_err(|_| ())?;
        if output.status.success() {
            Ok(output.stdout)
        } else {
            Err(())
        }
    })
}

fn import_docx_to_workspace_with_runner<F>(
    input_path: &str,
    workspace_root: String,
    runner: F,
) -> Result<DocxImportResult, String>
where
    F: FnOnce(&[String]) -> Result<Vec<u8>, ()>,
{
    let workspace_path = PathBuf::from(&workspace_root);
    let assets_path = workspace_path.join("assets");
    fs::create_dir_all(&workspace_path).map_err(|_| "workspace.createFailed".to_string())?;
    let staging_path = create_unique_import_staging_directory(&workspace_path)?;

    let staging_path_string = staging_path.to_string_lossy().into_owned();
    let args = crate::pandoc::args::docx_import_args(input_path, &staging_path_string);
    let markdown_path = workspace_path.join("document.md");
    let output = match runner(&args) {
        Ok(output) => output,
        Err(()) => {
            let _ = fs::remove_dir_all(&staging_path);
            return Err("import.docxFailed".to_string());
        }
    };

    let relocated_media = match merge_staged_media(&staging_path, &assets_path) {
        Ok(relocated_media) => relocated_media,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging_path);
            return Err(error);
        }
    };
    let markdown = normalize_imported_media_paths(
        &String::from_utf8_lossy(&output),
        &workspace_path,
        &staging_path,
        &assets_path,
        &relocated_media,
    );
    if let Err(error) = write_imported_markdown(&markdown_path, &markdown) {
        return Err(error);
    }

    Ok(DocxImportResult {
        workspace_root,
        markdown_path: markdown_path.to_string_lossy().into_owned(),
        assets_path: assets_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn normalizes_media_root_relative_links_to_workspace_assets() {
        let workspace_root = Path::new("/tmp/workspace");
        let assets_root = workspace_root.join("assets");
        let markdown = "![Chart](media/chart.png)\n[Attachment](media/data.csv)";

        let normalized = normalize_imported_media_paths(
            markdown,
            workspace_root,
            &assets_root,
            &assets_root,
            &BTreeMap::new(),
        );

        assert_eq!(
            normalized,
            "![Chart](assets/media/chart.png)\n[Attachment](assets/media/data.csv)"
        );
        assert_eq!(
            workspace_root.join("assets/media/chart.png"),
            assets_root.join("media/chart.png")
        );
    }

    #[test]
    fn normalizes_absolute_paths_inside_the_workspace_assets_directory() {
        let workspace_root = Path::new("/tmp/workspace");
        let assets_root = workspace_root.join("assets");
        let markdown = "![Chart](/tmp/workspace/assets/media/chart.png)";

        assert_eq!(
            normalize_imported_media_paths(
                markdown,
                workspace_root,
                &assets_root,
                &assets_root,
                &BTreeMap::new(),
            ),
            "![Chart](assets/media/chart.png)"
        );
    }

    #[test]
    fn normalizes_absolute_paths_inside_the_staging_media_directory() {
        let workspace_root = Path::new("/tmp/workspace");
        let staging_root = workspace_root.join(".markdoc-docx-import-media-1-1");
        let assets_root = workspace_root.join("assets");
        let markdown = format!(
            "![Chart]({})",
            staging_root.join("media/chart.png").display()
        );

        assert_eq!(
            normalize_imported_media_paths(
                &markdown,
                workspace_root,
                &staging_root,
                &assets_root,
                &BTreeMap::new(),
            ),
            "![Chart](assets/media/chart.png)"
        );
    }

    #[test]
    fn normalizes_raw_html_image_paths_inside_the_staging_media_directory() {
        let workspace_root = Path::new("/tmp/workspace");
        let staging_root = workspace_root.join(".markdoc-docx-import-media-1-1");
        let assets_root = workspace_root.join("assets");
        let markdown = format!(
            r#"<img src="{}" style="width:6.98333in;height:8.08194in" />"#,
            staging_root.join("media/image1.png").display()
        );

        assert_eq!(
            normalize_imported_media_paths(
                &markdown,
                workspace_root,
                &staging_root,
                &assets_root,
                &BTreeMap::new(),
            ),
            r#"<img src="assets/media/image1.png" style="width:6.98333in;height:8.08194in" />"#
        );
    }

    #[test]
    fn preserves_existing_workspace_asset_and_external_links() {
        let workspace_root = Path::new("/tmp/workspace");
        let assets_root = workspace_root.join("assets");
        let markdown = "![Existing](assets/logo.png)\n![External](/tmp/other.png)";

        assert_eq!(
            normalize_imported_media_paths(
                markdown,
                workspace_root,
                &assets_root,
                &assets_root,
                &BTreeMap::new(),
            ),
            markdown
        );
    }

    #[test]
    fn failed_import_removes_created_assets_without_touching_existing_document() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let assets_path = workspace_root.join("assets");
        let markdown_path = workspace_root.join("document.md");
        fs::write(&markdown_path, "existing document").unwrap();

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/chart.png"), "partial media").unwrap();
                Err(())
            },
        );

        assert_eq!(result.unwrap_err(), "import.docxFailed");
        assert!(!assets_path.exists());
        assert_eq!(
            fs::read_to_string(markdown_path).unwrap(),
            "existing document"
        );
    }

    #[test]
    fn failed_import_removes_only_new_media_from_existing_assets() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let assets_path = workspace_root.join("assets");
        fs::create_dir_all(&assets_path).unwrap();
        fs::write(assets_path.join("old.png"), "existing media").unwrap();

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/chart.png"), "partial media").unwrap();
                Err(())
            },
        );

        assert_eq!(result.unwrap_err(), "import.docxFailed");
        assert_eq!(
            fs::read_to_string(assets_path.join("old.png")).unwrap(),
            "existing media"
        );
        assert!(!assets_path.join("media/chart.png").exists());
        assert!(!assets_path.join("media").exists());
    }

    #[test]
    fn import_pipeline_writes_resolvable_workspace_media_links_from_runner_output() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/chart.png"), "chart data").unwrap();
                Ok(b"![Chart](media/chart.png)".to_vec())
            },
        )
        .unwrap();

        let markdown = fs::read_to_string(&result.markdown_path).unwrap();
        assert_eq!(markdown, "![Chart](assets/media/chart.png)");
        assert!(workspace_root.join("assets/media/chart.png").exists());
    }

    #[test]
    fn import_pipeline_writes_resolvable_html_image_links_from_runner_output() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/image1.png"), "image data").unwrap();
                Ok(format!(
                    r#"<img src="{}" style="width:6.98333in;height:8.08194in" />"#,
                    staging_root.join("media/image1.png").display()
                )
                .into_bytes())
            },
        )
        .unwrap();

        let markdown = fs::read_to_string(&result.markdown_path).unwrap();
        assert_eq!(
            markdown,
            r#"<img src="assets/media/image1.png" style="width:6.98333in;height:8.08194in" />"#
        );
        assert!(workspace_root.join("assets/media/image1.png").exists());
    }

    #[test]
    fn import_collision_preserves_existing_asset_and_rewrites_markdown_to_unique_file() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let media_path = workspace_root.join("assets/media");
        fs::create_dir_all(&media_path).unwrap();
        fs::write(media_path.join("chart.png"), "existing chart").unwrap();
        let mut staging_path = None;

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                staging_path = Some(staging_root.clone());
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/chart.png"), "imported chart").unwrap();
                Ok(b"![Chart](media/chart.png)".to_vec())
            },
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(media_path.join("chart.png")).unwrap(),
            "existing chart"
        );
        assert_eq!(
            fs::read_to_string(media_path.join("chart-1.png")).unwrap(),
            "imported chart"
        );
        assert_eq!(
            fs::read_to_string(result.markdown_path).unwrap(),
            "![Chart](assets/media/chart-1.png)"
        );
        assert!(!staging_path.unwrap().exists());
    }

    #[test]
    fn import_collision_retries_until_a_unique_asset_name_is_available() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let media_path = workspace_root.join("assets/media");
        fs::create_dir_all(&media_path).unwrap();
        fs::write(media_path.join("chart.png"), "original chart").unwrap();
        fs::write(media_path.join("chart-1.png"), "previous import").unwrap();

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/chart.png"), "latest import").unwrap();
                Ok(b"![Chart](media/chart.png)".to_vec())
            },
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(media_path.join("chart.png")).unwrap(),
            "original chart"
        );
        assert_eq!(
            fs::read_to_string(media_path.join("chart-1.png")).unwrap(),
            "previous import"
        );
        assert_eq!(
            fs::read_to_string(media_path.join("chart-2.png")).unwrap(),
            "latest import"
        );
        assert_eq!(
            fs::read_to_string(result.markdown_path).unwrap(),
            "![Chart](assets/media/chart-2.png)"
        );
    }

    #[test]
    fn temporary_markdown_reservations_are_unique_per_import_attempt() {
        let directory = tempfile::tempdir().unwrap();
        let (first_path, first_file) = create_unique_temporary_markdown(directory.path()).unwrap();
        let (second_path, second_file) =
            create_unique_temporary_markdown(directory.path()).unwrap();

        assert_ne!(first_path, second_path);
        drop(first_file);
        drop(second_file);
        fs::remove_file(first_path).unwrap();
        fs::remove_file(second_path).unwrap();
    }

    #[test]
    fn staging_media_directories_are_unique_per_import_attempt() {
        let directory = tempfile::tempdir().unwrap();
        let first_path = create_unique_import_staging_directory(directory.path()).unwrap();
        let second_path = create_unique_import_staging_directory(directory.path()).unwrap();

        assert_ne!(first_path, second_path);
        fs::remove_dir_all(first_path).unwrap();
        fs::remove_dir_all(second_path).unwrap();
    }

    #[test]
    fn failed_attempt_does_not_delete_final_media_created_by_an_overlapping_import() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let final_media = workspace_root.join("assets/media/successful-import.png");
        let mut failed_attempt_staging_path = None;

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |args| {
                let staging_root = PathBuf::from(extract_media_root(args));
                failed_attempt_staging_path = Some(staging_root.clone());
                fs::create_dir_all(staging_root.join("media")).unwrap();
                fs::write(staging_root.join("media/failed-import.png"), "failed media").unwrap();

                fs::create_dir_all(final_media.parent().unwrap()).unwrap();
                fs::write(&final_media, "successful media").unwrap();
                Err(())
            },
        );

        assert_eq!(result.unwrap_err(), "import.docxFailed");
        assert_eq!(fs::read_to_string(final_media).unwrap(), "successful media");
        assert!(!failed_attempt_staging_path.unwrap().exists());
    }

    fn extract_media_root(args: &[String]) -> &str {
        let extract_media_index = args
            .iter()
            .position(|arg| arg == "--extract-media")
            .unwrap();
        &args[extract_media_index + 1]
    }
}
