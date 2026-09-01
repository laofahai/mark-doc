use super::manifest::{MarkDocManifest, MARKDOC_MANIFEST_PATH, MARKDOC_README_PATH};
use super::validator::{
    is_safe_package_path, is_url_like, validate_existing_package_path, validate_workspace_root,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{copy, Read};
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageReadResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
    pub missing_resources: Vec<String>,
    pub has_readme_hint: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageExtractResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
    pub missing_resources: Vec<String>,
    pub has_readme_hint: bool,
    pub workspace_root: String,
    pub entry_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageValidationResult {
    pub manifest: MarkDocManifest,
    pub entries: Vec<String>,
    pub quarantined: Vec<String>,
    pub missing_resources: Vec<String>,
    pub has_readme_hint: bool,
    pub warnings: Vec<String>,
}

pub fn read_mdoc_package(package_path: String) -> Result<PackageReadResult, String> {
    let package_path_buf = PathBuf::from(&package_path);
    validate_existing_package_path(&package_path_buf)?;
    let file = File::open(package_path_buf).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;

    let mut manifest_json = String::new();
    archive
        .by_name(MARKDOC_MANIFEST_PATH)
        .map_err(|_| "package.invalidManifest".to_string())?
        .read_to_string(&mut manifest_json)
        .map_err(|_| "package.invalidManifest".to_string())?;

    let manifest: MarkDocManifest =
        serde_json::from_str(&manifest_json).map_err(|_| "package.invalidManifest".to_string())?;
    manifest.validate()?;

    let mut entries = Vec::new();
    let mut quarantined = Vec::new();
    let mut package_names = BTreeSet::new();
    let mut has_readme_hint = false;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|_| "package.corrupted".to_string())?;
        let name = entry.name().to_string();
        package_names.insert(name.clone());
        if name == MARKDOC_MANIFEST_PATH {
            continue;
        }
        if name == MARKDOC_README_PATH && manifest.entry != MARKDOC_README_PATH {
            has_readme_hint = true;
            continue;
        }
        if is_url_like(&name) || !is_safe_package_path(&name) || should_quarantine(&name, &manifest)
        {
            quarantined.push(name);
        } else {
            entries.push(name);
        }
    }

    for resource in unsafe_manifest_resources(&manifest) {
        push_unique(&mut quarantined, resource);
    }
    let missing_resources = missing_manifest_resources(&manifest, &package_names);

    if !entries.iter().any(|name| name == &manifest.entry) {
        return Err("package.missingEntry".to_string());
    }

    Ok(PackageReadResult {
        manifest,
        entries,
        quarantined,
        missing_resources,
        has_readme_hint,
    })
}

pub fn validate_mdoc_package(package_path: String) -> Result<PackageValidationResult, String> {
    let inspected = read_mdoc_package(package_path)?;
    let mut warnings = Vec::new();
    if !inspected.has_readme_hint && inspected.manifest.entry != MARKDOC_README_PATH {
        warnings.push("package.missingReadmeHint".to_string());
    }
    if !inspected.quarantined.is_empty() {
        warnings.push("package.quarantinedEntries".to_string());
    }
    if !inspected.missing_resources.is_empty() {
        warnings.push("package.missingManifestResources".to_string());
    }

    Ok(PackageValidationResult {
        manifest: inspected.manifest,
        entries: inspected.entries,
        quarantined: inspected.quarantined,
        missing_resources: inspected.missing_resources,
        has_readme_hint: inspected.has_readme_hint,
        warnings,
    })
}

pub fn extract_mdoc_package(
    package_path: String,
    workspace_root: String,
) -> Result<PackageExtractResult, String> {
    let inspected = read_mdoc_package(package_path.clone())?;
    extract_inspected_package(&package_path, workspace_root, inspected)
}

pub fn recover_mdoc_package(
    package_path: String,
    workspace_root: String,
) -> Result<PackageExtractResult, String> {
    let package_path_buf = PathBuf::from(&package_path);
    validate_existing_package_path(&package_path_buf)?;
    let file = File::open(&package_path_buf).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;
    let inspected = recover_package_index(&mut archive)?;
    extract_inspected_package(&package_path, workspace_root, inspected)
}

fn extract_inspected_package(
    package_path: &str,
    workspace_root: String,
    inspected: PackageReadResult,
) -> Result<PackageExtractResult, String> {
    let workspace = Path::new(&workspace_root);
    validate_workspace_root(workspace)?;
    fs::create_dir_all(workspace).map_err(|_| "workspace.createFailed".to_string())?;

    let file = File::open(package_path).map_err(|_| "package.openFailed".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "package.corrupted".to_string())?;

    fs::write(
        workspace.join(MARKDOC_MANIFEST_PATH),
        serde_json::to_vec(&inspected.manifest)
            .map_err(|_| "package.invalidManifest".to_string())?,
    )
    .map_err(|_| "workspace.createFailed".to_string())?;

    for entry_name in &inspected.entries {
        // Entries originate from read_mdoc_package, but validate again at the write boundary.
        if is_url_like(entry_name)
            || !is_safe_package_path(entry_name)
            || should_quarantine(entry_name, &inspected.manifest)
        {
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
        let parent = output_path
            .parent()
            .ok_or_else(|| "package.unsafePath".to_string())?;
        fs::create_dir_all(parent).map_err(|_| "workspace.createFailed".to_string())?;
        let mut output =
            File::create(output_path).map_err(|_| "workspace.createFailed".to_string())?;
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
        missing_resources: inspected.missing_resources,
        has_readme_hint: inspected.has_readme_hint,
        workspace_root,
        entry_path: entry_path.to_string_lossy().to_string(),
    })
}

fn recover_package_index(archive: &mut ZipArchive<File>) -> Result<PackageReadResult, String> {
    let fallback_manifest = MarkDocManifest::new("document.md");
    let mut entries = Vec::new();
    let mut quarantined = Vec::new();

    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|_| "package.corrupted".to_string())?;
        let name = entry.name().to_string();
        if name == MARKDOC_MANIFEST_PATH {
            continue;
        }
        if is_url_like(&name)
            || !is_safe_package_path(&name)
            || should_quarantine(&name, &fallback_manifest)
        {
            quarantined.push(name);
        } else {
            entries.push(name);
        }
    }

    let entry =
        choose_recovery_entry(&entries).ok_or_else(|| "package.missingEntry".to_string())?;
    let has_readme_hint =
        entry != MARKDOC_README_PATH && entries.iter().any(|name| name == MARKDOC_README_PATH);
    let entries = entries
        .into_iter()
        .filter(|name| name != MARKDOC_README_PATH || entry == MARKDOC_README_PATH)
        .collect();

    Ok(PackageReadResult {
        manifest: MarkDocManifest::new(entry),
        entries,
        quarantined,
        missing_resources: Vec::new(),
        has_readme_hint,
    })
}

fn choose_recovery_entry(entries: &[String]) -> Option<String> {
    if entries.iter().any(|name| name == "document.md") {
        return Some("document.md".to_string());
    }
    entries
        .iter()
        .filter(|name| is_markdown_path(name))
        .find(|name| name.as_str() != MARKDOC_README_PATH)
        .or_else(|| entries.iter().find(|name| is_markdown_path(name)))
        .cloned()
}

fn is_markdown_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn should_quarantine(name: &str, manifest: &MarkDocManifest) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".docx") {
        return !is_manifest_docx_reference(name, manifest);
    }
    lower.ends_with(".css") || lower.ends_with(".svg")
}

fn is_manifest_docx_reference(name: &str, manifest: &MarkDocManifest) -> bool {
    let Some(reference) = manifest
        .presentation
        .as_ref()
        .and_then(|presentation| presentation.docx_reference.as_ref())
    else {
        return false;
    };
    reference == name
        && !is_url_like(reference)
        && is_safe_package_path(reference)
        && reference.to_ascii_lowercase().ends_with(".docx")
}

fn manifest_presentation_resources(manifest: &MarkDocManifest) -> Vec<(&str, bool)> {
    let Some(presentation) = manifest.presentation.as_ref() else {
        return Vec::new();
    };
    let mut resources = Vec::new();
    if let Some(print) = presentation.print.as_deref() {
        resources.push((print, false));
    }
    if let Some(docx_reference) = presentation.docx_reference.as_deref() {
        resources.push((docx_reference, true));
    }
    resources
}

fn unsafe_manifest_resources(manifest: &MarkDocManifest) -> Vec<String> {
    manifest_presentation_resources(manifest)
        .into_iter()
        .filter(|(reference, requires_docx)| {
            is_url_like(reference)
                || !is_safe_package_path(reference)
                || (*requires_docx && !reference.to_ascii_lowercase().ends_with(".docx"))
        })
        .map(|(reference, _)| reference.to_string())
        .collect()
}

fn missing_manifest_resources(
    manifest: &MarkDocManifest,
    package_names: &BTreeSet<String>,
) -> Vec<String> {
    manifest_presentation_resources(manifest)
        .into_iter()
        .filter(|(reference, requires_docx)| {
            !is_url_like(reference)
                && is_safe_package_path(reference)
                && (!*requires_docx || reference.to_ascii_lowercase().ends_with(".docx"))
                && !package_names.contains(*reference)
        })
        .map(|(reference, _)| reference.to_string())
        .collect()
}

fn push_unique(items: &mut Vec<String>, item: String) {
    if !items.contains(&item) {
        items.push(item);
    }
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
    fn rejects_non_mdoc_package_host_paths() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("report.zip");
        write_package(
            &path,
            &MarkDocManifest::new("document.md"),
            &[("document.md", "# Hello")],
        );

        assert_eq!(
            read_mdoc_package(path.to_string_lossy().to_string()).unwrap_err(),
            "package.unsafePath"
        );
    }

    #[test]
    fn rejects_extraction_workspace_roots_outside_markdoc_temp_area() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("report.mdoc");
        write_package(
            &package_path,
            &MarkDocManifest::new("document.md"),
            &[("document.md", "# Hello")],
        );

        assert_eq!(
            extract_mdoc_package(
                package_path.to_string_lossy().to_string(),
                "/Users/alice/Documents/markdoc".to_string(),
            )
            .unwrap_err(),
            "package.unsafePath"
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
            extensions: serde_json::Map::new(),
        });
        write_package(&path, &manifest, &[("document.md", "# Hello")]);

        let result = read_mdoc_package(path.to_string_lossy().to_string()).unwrap();

        assert_eq!(
            result.quarantined,
            vec!["https://example.com/reference.docx"]
        );
    }

    #[test]
    fn extracts_manifest_docx_reference_as_safe_presentation_resource() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("reference.mdoc");
        let workspace_path = dir.path().join("workspace");
        let mut manifest = MarkDocManifest::new("document.md");
        manifest.presentation = Some(ManifestPresentation {
            print: None,
            docx_reference: Some("presentation/reference.docx".to_string()),
            extensions: serde_json::Map::new(),
        });
        write_package(
            &package_path,
            &manifest,
            &[
                ("document.md", "# Hello"),
                ("presentation/reference.docx", "docx"),
            ],
        );

        let result = extract_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result.quarantined, Vec::<String>::new());
        assert_eq!(
            result.entries,
            vec!["document.md", "presentation/reference.docx"]
        );
        assert_eq!(
            fs::read_to_string(workspace_path.join("presentation/reference.docx")).unwrap(),
            "docx"
        );
    }

    #[test]
    fn reports_missing_manifest_presentation_resources_as_validation_warning() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("missing-presentation.mdoc");
        let workspace_path = dir.path().join("workspace");
        let mut manifest = MarkDocManifest::new("document.md");
        manifest.presentation = Some(ManifestPresentation {
            print: Some("presentation/print.css".to_string()),
            docx_reference: Some("presentation/reference.docx".to_string()),
            extensions: serde_json::Map::new(),
        });
        write_package(&package_path, &manifest, &[("document.md", "# Hello")]);

        let inspected = read_mdoc_package(package_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(inspected.entries, vec!["document.md"]);
        assert_eq!(inspected.quarantined, Vec::<String>::new());
        assert_eq!(
            inspected.missing_resources,
            vec!["presentation/print.css", "presentation/reference.docx"]
        );

        let validation = validate_mdoc_package(package_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(
            validation.warnings,
            vec![
                "package.missingReadmeHint",
                "package.missingManifestResources"
            ]
        );

        let extracted = extract_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(
            extracted.missing_resources,
            vec!["presentation/print.css", "presentation/reference.docx"]
        );
    }

    #[test]
    fn treats_root_readme_hint_as_package_metadata_not_user_content() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("readme-hint.mdoc");
        let workspace_path = dir.path().join("workspace");
        let manifest = MarkDocManifest::new("document.md");
        write_package(
            &package_path,
            &manifest,
            &[
                ("README.md", "# MarkDoc Package"),
                ("document.md", "# Hello"),
                ("assets/image.png", "image-data"),
            ],
        );

        let inspected = read_mdoc_package(package_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(inspected.entries, vec!["document.md", "assets/image.png"]);
        assert_eq!(inspected.quarantined, Vec::<String>::new());
        assert!(inspected.has_readme_hint);

        extract_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(!workspace_path.join("README.md").exists());
    }

    #[test]
    fn keeps_readme_when_it_is_the_manifest_entry() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("readme-entry.mdoc");
        let workspace_path = dir.path().join("workspace");
        let manifest = MarkDocManifest::new("README.md");
        write_package(&package_path, &manifest, &[("README.md", "# Hello")]);

        let inspected = read_mdoc_package(package_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(inspected.entries, vec!["README.md"]);
        assert!(!inspected.has_readme_hint);

        extract_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(workspace_path.join("README.md")).unwrap(),
            "# Hello"
        );
    }

    #[test]
    fn validates_legacy_packages_without_readme_as_a_warning_not_a_failure() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("legacy.mdoc");
        let manifest = MarkDocManifest::new("document.md");
        write_package(
            &package_path,
            &manifest,
            &[("document.md", "# Hello"), ("assets/icon.svg", "<svg />")],
        );

        let result = validate_mdoc_package(package_path.to_string_lossy().to_string()).unwrap();

        assert_eq!(result.manifest.entry, "document.md");
        assert_eq!(result.entries, vec!["document.md"]);
        assert_eq!(result.quarantined, vec!["assets/icon.svg"]);
        assert!(!result.has_readme_hint);
        assert_eq!(
            result.warnings,
            vec!["package.missingReadmeHint", "package.quarantinedEntries"]
        );
    }

    #[test]
    fn recovers_safe_markdown_from_zip_package_without_a_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("missing-manifest.mdoc");
        let workspace_path = dir.path().join("workspace");
        {
            let file = File::create(&package_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            for (name, content) in [
                ("README.md", "# MarkDoc Package"),
                ("document.md", "# Recovered"),
                ("assets/image.png", "image-data"),
                ("presentation/print.css", "body {}"),
                ("../outside.txt", "unsafe"),
            ] {
                zip.start_file(name, options).unwrap();
                zip.write_all(content.as_bytes()).unwrap();
            }
            zip.finish().unwrap();
        }

        let result = recover_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result.manifest.entry, "document.md");
        assert_eq!(result.entries, vec!["document.md", "assets/image.png"]);
        assert_eq!(
            result.quarantined,
            vec!["presentation/print.css", "../outside.txt"]
        );
        assert!(result.has_readme_hint);
        assert_eq!(
            fs::read_to_string(&result.entry_path).unwrap(),
            "# Recovered"
        );
        assert_eq!(
            fs::read_to_string(workspace_path.join("assets/image.png")).unwrap(),
            "image-data"
        );
        assert!(!workspace_path.join("README.md").exists());
        assert!(!dir.path().join("outside.txt").exists());
    }

    #[test]
    fn recovers_readme_as_content_when_it_is_the_only_markdown_entry() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("readme-only.mdoc");
        let workspace_path = dir.path().join("workspace");
        {
            let file = File::create(&package_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            zip.start_file("README.md", options).unwrap();
            zip.write_all(b"# Recovered README").unwrap();
            zip.finish().unwrap();
        }

        let result = recover_mdoc_package(
            package_path.to_string_lossy().to_string(),
            workspace_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(result.manifest.entry, "README.md");
        assert_eq!(result.entries, vec!["README.md"]);
        assert!(!result.has_readme_hint);
        assert_eq!(
            fs::read_to_string(&result.entry_path).unwrap(),
            "# Recovered README"
        );
    }

    #[test]
    fn recovery_rejects_archives_that_zip_cannot_open() {
        let dir = tempfile::tempdir().unwrap();
        let package_path = dir.path().join("corrupt.mdoc");
        fs::write(&package_path, "not a zip archive").unwrap();

        assert_eq!(
            recover_mdoc_package(
                package_path.to_string_lossy().to_string(),
                dir.path().join("workspace").to_string_lossy().to_string(),
            )
            .unwrap_err(),
            "package.corrupted"
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

        assert_eq!(
            result.entry_path,
            workspace_path.join("document.md").to_string_lossy()
        );
        assert_eq!(
            fs::read_to_string(&result.entry_path).unwrap(),
            "# Extracted"
        );
        assert_eq!(
            fs::read_to_string(workspace_path.join("assets/image.png")).unwrap(),
            "image-data"
        );
        assert!(workspace_path.join("manifest.json").exists());
        assert!(!workspace_path.join("presentation/style.css").exists());
        assert!(!dir.path().join("outside.txt").exists());
        assert_eq!(
            result.quarantined,
            vec!["presentation/style.css", "../outside.txt"]
        );
    }
}
