use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_IMPORT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxImportResult {
    pub workspace_root: String,
    pub markdown_path: String,
    pub assets_path: String,
}

fn normalize_imported_media_paths(
    markdown: &str,
    workspace_root: &Path,
    assets_root: &Path,
) -> String {
    let link_pattern = regex::Regex::new(
        r"(?P<prefix>!?\[[^\]]*\]\()(?P<destination><[^>\n]+>|[^)\s]+)(?P<suffix>(?:\s+[^)]*)?\))",
    )
    .expect("valid Markdown link pattern");

    link_pattern
        .replace_all(markdown, |captures: &regex::Captures| {
            let destination = &captures["destination"];
            format!(
                "{}{}{}",
                &captures["prefix"],
                normalize_imported_media_destination(destination, workspace_root, assets_root),
                &captures["suffix"]
            )
        })
        .into_owned()
}

fn cleanup_failed_import_with_snapshot(
    assets_path: &Path,
    assets_created: bool,
    existing_asset_entries: &BTreeSet<PathBuf>,
) {
    if assets_created {
        let _ = fs::remove_dir_all(assets_path);
        return;
    }

    let Ok(current_asset_entries) = snapshot_asset_entries(assets_path) else {
        return;
    };
    let mut new_entries: Vec<PathBuf> = current_asset_entries
        .difference(existing_asset_entries)
        .cloned()
        .collect();
    new_entries.sort_by_key(|path| std::cmp::Reverse(path.components().count()));

    for entry in new_entries {
        let path = assets_path.join(entry);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_dir() => {
                let _ = fs::remove_dir(&path);
            }
            Ok(_) => {
                let _ = fs::remove_file(&path);
            }
            Err(_) => {}
        }
    }
}

fn snapshot_asset_entries(assets_path: &Path) -> Result<BTreeSet<PathBuf>, String> {
    let mut entries = BTreeSet::new();
    collect_asset_entries(assets_path, assets_path, &mut entries)?;
    Ok(entries)
}

fn collect_asset_entries(
    assets_path: &Path,
    directory: &Path,
    entries: &mut BTreeSet<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|_| "workspace.createFailed".to_string())? {
        let entry = entry.map_err(|_| "workspace.createFailed".to_string())?;
        let path = entry.path();
        let relative_path = path
            .strip_prefix(assets_path)
            .map_err(|_| "workspace.createFailed".to_string())?
            .to_path_buf();
        let file_type = entry
            .file_type()
            .map_err(|_| "workspace.createFailed".to_string())?;
        entries.insert(relative_path);
        if file_type.is_dir() {
            collect_asset_entries(assets_path, &path, entries)?;
        }
    }
    Ok(())
}

fn normalize_imported_media_destination(
    destination: &str,
    workspace_root: &Path,
    assets_root: &Path,
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

        if source_path.is_absolute() {
            source_path
                .strip_prefix(assets_root)
                .ok()
                .map(|relative| workspace_assets_path.join(relative))
                .and_then(|relative| markdown_path_string(&relative))
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

    if wrapped {
        format!("<{}>", normalized)
    } else {
        normalized
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

#[tauri::command]
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
    let assets_created = !assets_path.exists();
    fs::create_dir_all(&assets_path).map_err(|_| "workspace.createFailed".to_string())?;
    let existing_asset_entries = match snapshot_asset_entries(&assets_path) {
        Ok(entries) => entries,
        Err(error) => {
            if assets_created {
                let _ = fs::remove_dir_all(&assets_path);
            }
            return Err(error);
        }
    };

    let assets_path_string = assets_path.to_string_lossy().into_owned();
    let args = crate::pandoc::args::docx_import_args(input_path, &assets_path_string);
    let markdown_path = workspace_path.join("document.md");
    let output = match runner(&args) {
        Ok(output) => output,
        Err(()) => {
            cleanup_failed_import_with_snapshot(
                &assets_path,
                assets_created,
                &existing_asset_entries,
            );
            return Err("import.docxFailed".to_string());
        }
    };

    let markdown = normalize_imported_media_paths(
        &String::from_utf8_lossy(&output),
        &workspace_path,
        &assets_path,
    );
    if let Err(error) = write_imported_markdown(&markdown_path, &markdown) {
        cleanup_failed_import_with_snapshot(&assets_path, assets_created, &existing_asset_entries);
        return Err(error);
    }

    Ok(DocxImportResult {
        workspace_root,
        markdown_path: markdown_path.to_string_lossy().into_owned(),
        assets_path: assets_path_string,
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

        let normalized = normalize_imported_media_paths(markdown, workspace_root, &assets_root);

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
            normalize_imported_media_paths(markdown, workspace_root, &assets_root),
            "![Chart](assets/media/chart.png)"
        );
    }

    #[test]
    fn preserves_existing_workspace_asset_and_external_links() {
        let workspace_root = Path::new("/tmp/workspace");
        let assets_root = workspace_root.join("assets");
        let markdown = "![Existing](assets/logo.png)\n![External](/tmp/other.png)";

        assert_eq!(
            normalize_imported_media_paths(markdown, workspace_root, &assets_root),
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
            |_| {
                fs::create_dir_all(assets_path.join("media")).unwrap();
                fs::write(assets_path.join("media/chart.png"), "partial media").unwrap();
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
            |_| {
                fs::create_dir_all(assets_path.join("media")).unwrap();
                fs::write(assets_path.join("media/chart.png"), "partial media").unwrap();
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
        let assets_path = workspace_root.join("assets");

        let result = import_docx_to_workspace_with_runner(
            "input.docx",
            workspace_root.to_string_lossy().into_owned(),
            |_| {
                fs::create_dir_all(assets_path.join("media")).unwrap();
                fs::write(assets_path.join("media/chart.png"), "chart data").unwrap();
                Ok(b"![Chart](media/chart.png)".to_vec())
            },
        )
        .unwrap();

        let markdown = fs::read_to_string(&result.markdown_path).unwrap();
        assert_eq!(markdown, "![Chart](assets/media/chart.png)");
        assert!(workspace_root.join("assets/media/chart.png").exists());
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
}
