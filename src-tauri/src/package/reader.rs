use super::manifest::MarkDocManifest;
use super::validator::{is_safe_package_path, is_url_like};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{copy, Read};
use std::path::Path;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageReadResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageExtractResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
    pub workspace_root: String,
    pub entry_path: String,
}

#[tauri::command]
pub fn read_mdoc_package(package_path: String) -> Result<PackageReadResult, String> {
    let file = File::open(package_path).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;

    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| "package.invalidManifest".to_string())?
        .read_to_string(&mut manifest_json)
        .map_err(|_| "package.invalidManifest".to_string())?;

    let manifest: MarkDocManifest =
        serde_json::from_str(&manifest_json).map_err(|_| "package.invalidManifest".to_string())?;
    manifest.validate()?;

    let mut entries = Vec::new();
    let mut quarantined = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|_| "package.corrupted".to_string())?;
        let name = entry.name().to_string();
        if name == "manifest.json" {
            continue;
        }
        if is_url_like(&name) || !is_safe_package_path(&name) || should_quarantine(&name) {
            quarantined.push(name);
        } else {
            entries.push(name);
        }
    }

    if let Some(docx_reference) = manifest
        .presentation
        .as_ref()
        .and_then(|presentation| presentation.docx_reference.as_ref())
    {
        if is_url_like(docx_reference)
            || !is_safe_package_path(docx_reference)
            || should_quarantine(docx_reference)
        {
            quarantined.push(docx_reference.clone());
        }
    }

    if !entries.iter().any(|name| name == &manifest.entry) {
        return Err("package.missingEntry".to_string());
    }

    Ok(PackageReadResult {
        manifest,
        entries,
        quarantined,
    })
}

#[tauri::command]
pub fn extract_mdoc_package(
    package_path: String,
    workspace_root: String,
) -> Result<PackageExtractResult, String> {
    let inspected = read_mdoc_package(package_path.clone())?;
    let workspace = Path::new(&workspace_root);
    fs::create_dir_all(workspace).map_err(|_| "workspace.createFailed".to_string())?;

    let file = File::open(package_path).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;

    fs::write(
        workspace.join("manifest.json"),
        serde_json::to_vec(&inspected.manifest).map_err(|_| "package.invalidManifest".to_string())?,
    )
    .map_err(|_| "workspace.createFailed".to_string())?;

    for entry_name in &inspected.entries {
        // Entries originate from read_mdoc_package, but validate again at the write boundary.
        if is_url_like(entry_name) || !is_safe_package_path(entry_name) || should_quarantine(entry_name) {
            return Err("package.unsafePath".to_string());
        }
        let output_path = workspace.join(entry_name);
        let mut entry = archive
            .by_name(entry_name)
            .map_err(|_| "package.corrupted".to_string())?;
        if entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|_| "workspace.createFailed".to_string())?;
            continue;
        }
        let parent = output_path.parent().ok_or_else(|| "package.unsafePath".to_string())?;
        fs::create_dir_all(parent).map_err(|_| "workspace.createFailed".to_string())?;
        let mut output = File::create(output_path).map_err(|_| "workspace.createFailed".to_string())?;
        copy(&mut entry, &mut output).map_err(|_| "package.corrupted".to_string())?;
    }

    let entry_path = workspace.join(&inspected.manifest.entry);
    if !entry_path.is_file() {
        return Err("package.missingEntry".to_string());
    }

    Ok(PackageExtractResult {
        manifest: inspected.manifest,
        entries: inspected.entries,
        quarantined: inspected.quarantined,
        workspace_root,
        entry_path: entry_path.to_string_lossy().to_string(),
    })
}

fn should_quarantine(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".css") || lower.ends_with(".svg") || lower.ends_with(".docx")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::package::manifest::{ManifestPresentation, MarkDocManifest};
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::Path;
    use zip::write::SimpleFileOptions;

    fn write_package(path: &Path, manifest: &MarkDocManifest, entries: &[(&str, &str)]) {
        let file = File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(&serde_json::to_vec(manifest).unwrap())
            .unwrap();
        for (name, content) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(content.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn rejects_corrupt_archives() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("corrupt.mdoc");
        fs::write(&path, "not a zip archive").unwrap();

        assert_eq!(
            read_mdoc_package(path.to_string_lossy().to_string()).unwrap_err(),
            "package.corrupted"
        );
    }

    #[test]
    fn quarantines_unsafe_url_and_active_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("resources.mdoc");
        let manifest = MarkDocManifest::new("document.md");
        write_package(
            &path,
            &manifest,
            &[
                ("document.md", "# Hello"),
                ("../secret.txt", "secret"),
                ("https://example.com/image.png", "remote"),
                ("assets/style.css", "body {}"),
                ("assets/icon.svg", "<svg />"),
                ("presentation/reference.docx", "docx"),
            ],
        );

        let result = read_mdoc_package(path.to_string_lossy().to_string()).unwrap();

        assert_eq!(result.entries, vec!["document.md"]);
        assert_eq!(
            result.quarantined,
            vec![
                "../secret.txt",
                "https://example.com/image.png",
                "assets/style.css",
                "assets/icon.svg",
                "presentation/reference.docx",
            ]
        );
    }

    #[test]
    fn quarantines_remote_docx_reference() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reference.mdoc");
        let mut manifest = MarkDocManifest::new("document.md");
        manifest.presentation = Some(ManifestPresentation {
            print: None,
            docx_reference: Some("https://example.com/reference.docx".to_string()),
        });
        write_package(&path, &manifest, &[("document.md", "# Hello")]);

        let result = read_mdoc_package(path.to_string_lossy().to_string()).unwrap();

        assert_eq!(
            result.quarantined,
            vec!["https://example.com/reference.docx"]
        );
    }

    #[test]
    fn rejects_packages_with_missing_or_quarantined_entry() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing.mdoc");
        write_package(&missing, &MarkDocManifest::new("document.md"), &[]);
        assert_eq!(
            read_mdoc_package(missing.to_string_lossy().to_string()).unwrap_err(),
            "package.missingEntry"
        );

        let quarantined = dir.path().join("quarantined.mdoc");
        write_package(
            &quarantined,
            &MarkDocManifest::new("document.css"),
            &[("document.css", "body {}")],
        );
        assert_eq!(
            read_mdoc_package(quarantined.to_string_lossy().to_string()).unwrap_err(),
            "package.missingEntry"
        );
    }

    #[test]
    fn extracts_only_safe_entries_and_writes_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("report.mdoc");
        let workspace_path = dir.path().join("workspace");
        let manifest = MarkDocManifest::new("document.md");
        write_package(
            &package_path,
            &manifest,
            &[
                ("document.md", "# Extracted"),
                ("assets/image.png", "image-data"),
                ("presentation/style.css", "body {}"),
                ("../outside.txt", "unsafe"),
            ],
        );

        let result = extract_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result.entry_path, workspace_path.join("document.md").to_string_lossy());
        assert_eq!(fs::read_to_string(&result.entry_path).unwrap(), "# Extracted");
        assert_eq!(fs::read_to_string(workspace_path.join("assets/image.png")).unwrap(), "image-data");
        assert!(workspace_path.join("manifest.json").exists());
        assert!(!workspace_path.join("presentation/style.css").exists());
        assert!(!dir.path().join("outside.txt").exists());
        assert_eq!(result.quarantined, vec!["presentation/style.css", "../outside.txt"]);
    }
}
