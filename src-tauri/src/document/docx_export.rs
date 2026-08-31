use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWorkspaceToDocxInput {
    pub markdown_path: String,
    pub output_path: String,
    pub reference_docx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxResult {
    pub output_path: String,
}

struct ExportPaths {
    markdown_path: PathBuf,
    output_path: PathBuf,
    working_directory: PathBuf,
}

fn absolutize_export_paths(
    markdown_path: &str,
    output_path: &str,
    current_directory: &Path,
) -> Result<ExportPaths, String> {
    let markdown_path = absolutize_path(markdown_path, current_directory)?;
    let output_path = absolutize_path(output_path, current_directory)?;
    Ok(ExportPaths {
        working_directory: markdown_parent(&markdown_path)?,
        output_path,
        markdown_path,
    })
}

pub fn export_workspace_to_docx(
    input: ExportWorkspaceToDocxInput,
) -> Result<ExportWorkspaceToDocxResult, String> {
    let current_directory = env::current_dir().map_err(|_| "export.docxFailed".to_string())?;
    let paths =
        absolutize_export_paths(&input.markdown_path, &input.output_path, &current_directory)?;
    if !fs::metadata(&paths.markdown_path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
    {
        return Err("export.docxFailed".to_string());
    }
    let reference_docx = input
        .reference_docx
        .as_deref()
        .map(|path| absolutize_path(path, &current_directory))
        .transpose()?;
    let markdown_path = path_string(&paths.markdown_path)?;
    let output_path = path_string(&paths.output_path)?;
    let reference_docx = reference_docx.as_deref().map(path_string).transpose()?;
    let args = crate::pandoc::args::docx_export_args(
        &markdown_path,
        &output_path,
        reference_docx.as_deref(),
    );
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .current_dir(paths.working_directory)
        .args(args)
        .output()
        .map_err(|_| "export.docxFailed".to_string())?;

    if !output.status.success() {
        return Err("export.docxFailed".to_string());
    }

    Ok(ExportWorkspaceToDocxResult { output_path })
}

fn absolutize_path(path: &str, current_directory: &Path) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("export.docxFailed".to_string());
    }

    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(current_directory.join(path))
    }
}

fn markdown_parent(markdown_path: &Path) -> Result<PathBuf, String> {
    markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| "export.docxFailed".to_string())
}

fn path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|path| path.to_string())
        .ok_or_else(|| "export.docxFailed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_frontend_camel_case_export_input() {
        let input: ExportWorkspaceToDocxInput = serde_json::from_value(serde_json::json!({
            "markdownPath": "/tmp/workspace/document.md",
            "outputPath": "/tmp/workspace/report.docx",
            "referenceDocx": "/tmp/workspace/reference.docx"
        }))
        .unwrap();

        assert_eq!(input.markdown_path, "/tmp/workspace/document.md");
        assert_eq!(input.output_path, "/tmp/workspace/report.docx");
        assert_eq!(
            input.reference_docx.as_deref(),
            Some("/tmp/workspace/reference.docx")
        );
    }

    #[test]
    fn resolves_export_working_directory_from_markdown_parent() {
        assert_eq!(
            markdown_parent(Path::new("/tmp/workspace/document.md")).unwrap(),
            PathBuf::from("/tmp/workspace")
        );
    }

    #[test]
    fn resolves_relative_export_paths_before_building_pandoc_arguments() {
        let current_directory = Path::new("/tmp/workspace");
        let paths =
            absolutize_export_paths("document.md", "out/report.docx", current_directory).unwrap();

        assert_eq!(
            paths.markdown_path,
            PathBuf::from("/tmp/workspace/document.md")
        );
        assert_eq!(
            paths.output_path,
            PathBuf::from("/tmp/workspace/out/report.docx")
        );
        assert_eq!(paths.working_directory, PathBuf::from("/tmp/workspace"));

        let args = crate::pandoc::args::docx_export_args(
            paths.markdown_path.to_str().unwrap(),
            paths.output_path.to_str().unwrap(),
            None,
        );
        assert_eq!(args[0], "/tmp/workspace/document.md");
        assert_eq!(args[2], "/tmp/workspace/out/report.docx");
    }
}
