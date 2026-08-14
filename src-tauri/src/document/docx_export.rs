use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxInput {
    pub markdown_path: String,
    pub output_path: String,
    pub reference_docx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxResult {
    pub output_path: String,
}

#[tauri::command]
pub fn export_workspace_to_docx(
    input: ExportWorkspaceToDocxInput,
) -> Result<ExportWorkspaceToDocxResult, String> {
    let args = crate::pandoc::args::docx_export_args(
        &input.markdown_path,
        &input.output_path,
        input.reference_docx.as_deref(),
    );
    let working_directory = markdown_parent(&input.markdown_path)?;
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .current_dir(working_directory)
        .args(args)
        .output()
        .map_err(|_| "export.docxFailed".to_string())?;

    if !output.status.success() {
        return Err("export.docxFailed".to_string());
    }

    Ok(ExportWorkspaceToDocxResult {
        output_path: input.output_path,
    })
}

fn markdown_parent(markdown_path: &str) -> Result<PathBuf, String> {
    Path::new(markdown_path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| "export.docxFailed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_export_working_directory_from_markdown_parent() {
        assert_eq!(
            markdown_parent("/tmp/workspace/document.md").unwrap(),
            PathBuf::from("/tmp/workspace")
        );
    }
}
