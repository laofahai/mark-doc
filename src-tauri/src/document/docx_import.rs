use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn cleanup_failed_import(assets_path: &Path, assets_created: bool, temporary_markdown_path: &Path) {
    let _ = fs::remove_file(temporary_markdown_path);
    if assets_created {
        let _ = fs::remove_dir_all(assets_path);
    }
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

fn write_imported_markdown(
    markdown_path: &Path,
    temporary_markdown_path: &Path,
    markdown: &str,
) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary_markdown_path)
        .map_err(|_| "workspace.writeFailed".to_string())?;
    file.write_all(markdown.as_bytes())
        .map_err(|_| "workspace.writeFailed".to_string())?;
    file.sync_all()
        .map_err(|_| "workspace.writeFailed".to_string())?;
    drop(file);
    fs::rename(temporary_markdown_path, markdown_path)
        .map_err(|_| "workspace.writeFailed".to_string())
}

#[tauri::command]
pub fn import_docx_to_workspace(
    input_path: String,
    workspace_root: String,
) -> Result<DocxImportResult, String> {
    let workspace_path = PathBuf::from(&workspace_root);
    let assets_path = workspace_path.join("assets");
    let assets_created = !assets_path.exists();
    fs::create_dir_all(&assets_path).map_err(|_| "workspace.createFailed".to_string())?;

    let assets_path_string = assets_path.to_string_lossy().into_owned();
    let args = crate::pandoc::args::docx_import_args(&input_path, &assets_path_string);
    let markdown_path = workspace_path.join("document.md");
    let temporary_markdown_path =
        workspace_path.join(format!(".document.md.importing-{}", std::process::id()));
    let output = match Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .args(args)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => {
            cleanup_failed_import(&assets_path, assets_created, &temporary_markdown_path);
            return Err("import.docxFailed".to_string());
        }
    };

    let markdown = normalize_imported_media_paths(
        &String::from_utf8_lossy(&output.stdout),
        &workspace_path,
        &assets_path,
    );
    if let Err(error) = write_imported_markdown(&markdown_path, &temporary_markdown_path, &markdown)
    {
        cleanup_failed_import(&assets_path, assets_created, &temporary_markdown_path);
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
    fn cleanup_removes_created_assets_and_partial_markdown_without_touching_existing_document() {
        let directory = tempfile::tempdir().unwrap();
        let workspace_root = directory.path();
        let assets_path = workspace_root.join("assets");
        let markdown_path = workspace_root.join("document.md");
        let temporary_markdown_path = workspace_root.join(".document.md.importing");
        fs::create_dir_all(assets_path.join("media")).unwrap();
        fs::write(assets_path.join("media/chart.png"), "partial media").unwrap();
        fs::write(&markdown_path, "existing document").unwrap();
        fs::write(&temporary_markdown_path, "partial markdown").unwrap();

        cleanup_failed_import(&assets_path, true, &temporary_markdown_path);

        assert!(!assets_path.exists());
        assert!(!temporary_markdown_path.exists());
        assert_eq!(
            fs::read_to_string(markdown_path).unwrap(),
            "existing document"
        );
    }
}
