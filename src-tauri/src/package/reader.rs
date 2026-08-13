use super::manifest::MarkDocManifest;
use super::validator::{is_safe_package_path, is_url_like};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageReadResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
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
}
