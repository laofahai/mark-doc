use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxImportResult {
    pub workspace_root: String,
    pub markdown_path: String,
    pub assets_path: String,
}

#[tauri::command]
pub fn import_docx_to_workspace(
    input_path: String,
    workspace_root: String,
) -> Result<DocxImportResult, String> {
    let workspace_path = PathBuf::from(&workspace_root);
    let assets_path = workspace_path.join("assets");
    fs::create_dir_all(&assets_path).map_err(|_| "workspace.createFailed".to_string())?;

    let assets_path_string = assets_path.to_string_lossy().into_owned();
    let args = crate::pandoc::args::docx_import_args(&input_path, &assets_path_string);
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .args(args)
        .output()
        .map_err(|_| "import.docxFailed".to_string())?;

    if !output.status.success() {
        return Err("import.docxFailed".to_string());
    }

    let markdown_path = workspace_path.join("document.md");
    fs::write(&markdown_path, output.stdout).map_err(|_| "workspace.writeFailed".to_string())?;

    Ok(DocxImportResult {
        workspace_root,
        markdown_path: markdown_path.to_string_lossy().into_owned(),
        assets_path: assets_path_string,
    })
}
