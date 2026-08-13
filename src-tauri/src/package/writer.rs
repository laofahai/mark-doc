use super::manifest::MarkDocManifest;
use super::validator::is_safe_package_path;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWriteInput {
    pub workspace_root: String,
    pub output_path: String,
    pub entry: String,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWriteResult {
    pub output_path: String,
    pub recovery_path: Option<String>,
}

#[tauri::command]
pub fn write_mdoc_package(input: PackageWriteInput) -> Result<PackageWriteResult, String> {
    let workspace_root = PathBuf::from(&input.workspace_root);
    let output_path = PathBuf::from(&input.output_path);
    let tmp_path = output_path.with_extension("mdoc.tmp");
    let recovery_path = output_path.with_extension("mdoc.bak");

    let manifest = MarkDocManifest::new(&input.entry);
    manifest.validate()?;

    let file = File::create(&tmp_path).map_err(|_| "save.failed".to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let manifest_json =
        serde_json::to_vec_pretty(&manifest).map_err(|_| "package.invalidManifest".to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|_| "save.failed".to_string())?;
    zip.write_all(&manifest_json)
        .map_err(|_| "save.failed".to_string())?;

    for package_path in input.files {
        if !is_safe_package_path(&package_path) {
            return Err("package.unsafePath".to_string());
        }
        let absolute_path = workspace_root.join(&package_path);
        let mut bytes = Vec::new();
        File::open(&absolute_path)
            .map_err(|_| "package.missingEntry".to_string())?
            .read_to_end(&mut bytes)
            .map_err(|_| "package.readFailed".to_string())?;
        zip.start_file(package_path, options)
            .map_err(|_| "save.failed".to_string())?;
        zip.write_all(&bytes)
            .map_err(|_| "save.failed".to_string())?;
    }

    zip.finish().map_err(|_| "save.failed".to_string())?;

    if output_path.exists() {
        fs::copy(&output_path, &recovery_path).map_err(|_| "save.recoveryFailed".to_string())?;
    }

    fs::rename(&tmp_path, &output_path).map_err(|_| "save.failed".to_string())?;

    Ok(PackageWriteResult {
        output_path: input.output_path,
        recovery_path: output_path
            .with_extension("mdoc.bak")
            .to_str()
            .map(|s| s.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn writes_manifest_and_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.md"), "# Hello").unwrap();
        let output = dir.path().join("report.mdoc");

        let result = write_mdoc_package(PackageWriteInput {
            workspace_root: root.to_string_lossy().to_string(),
            output_path: output.to_string_lossy().to_string(),
            entry: "document.md".to_string(),
            files: vec!["document.md".to_string()],
        })
        .unwrap();

        assert!(output.exists());
        assert_eq!(result.output_path, output.to_string_lossy());
    }
}
