use super::manifest::MarkDocManifest;
use super::validator::is_safe_package_path;
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
        if !is_safe_package_path(&name) || should_quarantine(&name) {
            quarantined.push(name);
        } else {
            entries.push(name);
        }
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
