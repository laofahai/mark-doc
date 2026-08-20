use super::manifest::MarkDocManifest;
use super::validator::is_safe_package_path;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWriteInput {
    pub workspace_root: String,
    pub output_path: String,
    pub entry: String,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub manifest: Option<MarkDocManifest>,
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

    let manifest = input.manifest.unwrap_or_else(|| MarkDocManifest::new(&input.entry));
    manifest.validate()?;
    if manifest.entry != input.entry {
        return Err("package.invalidManifest".to_string());
    }

    if input
        .files
        .iter()
        .filter(|path| *path == &input.entry)
        .count()
        != 1
    {
        return Err("package.missingEntry".to_string());
    }
    if input.files.iter().any(|path| !is_safe_package_path(path)) {
        return Err("package.unsafePath".to_string());
    }

    let file = File::create(&tmp_path).map_err(|_| "save.failed".to_string())?;
    let write_result = (|| {
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let manifest_json = serde_json::to_vec_pretty(&manifest)
            .map_err(|_| "package.invalidManifest".to_string())?;
        zip.start_file("manifest.json", options)
            .map_err(|_| "save.failed".to_string())?;
        zip.write_all(&manifest_json)
            .map_err(|_| "save.failed".to_string())?;

        if !input.files.iter().any(|path| path == "README.md") {
            zip.start_file("README.md", options)
                .map_err(|_| "save.failed".to_string())?;
            zip.write_all(package_readme_hint().as_bytes())
                .map_err(|_| "save.failed".to_string())?;
        }

        for package_path in &input.files {
            let absolute_path = workspace_root.join(package_path);
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

        zip.finish()
            .map_err(|_| "save.failed".to_string())?
            .sync_all()
            .map_err(|_| "save.failed".to_string())?;
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }

    replace_package(&tmp_path, &output_path, &recovery_path)?;

    Ok(PackageWriteResult {
        output_path: input.output_path,
        recovery_path: output_path
            .with_extension("mdoc.bak")
            .to_str()
            .map(|s| s.to_string()),
    })
}

fn replace_package(
    tmp_path: &PathBuf,
    output_path: &PathBuf,
    recovery_path: &PathBuf,
) -> Result<(), String> {
    replace_package_with_operation(tmp_path, output_path, recovery_path, replace_existing)
}

fn replace_package_with_operation<F>(
    tmp_path: &Path,
    output_path: &Path,
    recovery_path: &Path,
    mut replace: F,
) -> Result<(), String>
where
    F: FnMut(&Path, &Path) -> std::io::Result<()>,
{
    if output_path.exists() {
        if fs::copy(output_path, recovery_path).is_err() {
            let _ = fs::remove_file(tmp_path);
            return Err("save.recoveryFailed".to_string());
        }
    }

    if replace(tmp_path, output_path).is_err() {
        let _ = fs::remove_file(tmp_path);
        return Err("save.failed".to_string());
    }

    Ok(())
}

fn package_readme_hint() -> &'static str {
    r#"# MarkDoc Package

This .mdoc file is an ordinary ZIP package.

- manifest.json is the authoritative package contract.
- manifest.entry names the canonical Markdown source, normally document.md.
- Asset and presentation paths are relative to the package root.
- Remote resources are not trusted by default.
- Use manifest.schema for machine validation and manifest.spec for the format guide.
"#
}

#[cfg(not(windows))]
fn replace_existing(tmp_path: &Path, output_path: &Path) -> std::io::Result<()> {
    fs::rename(tmp_path, output_path)
}

#[cfg(windows)]
fn replace_existing(tmp_path: &Path, output_path: &Path) -> std::io::Result<()> {
    use std::iter;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING};

    let tmp_path: Vec<u16> = tmp_path
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let output_path: Vec<u16> = output_path
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();

    if unsafe {
        MoveFileExW(
            tmp_path.as_ptr(),
            output_path.as_ptr(),
            MOVEFILE_REPLACE_EXISTING,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;
    use zip::ZipArchive;

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
            manifest: None,
        })
        .unwrap();

        assert!(output.exists());
        assert_eq!(result.output_path, output.to_string_lossy());

        let file = File::open(&output).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut manifest = String::new();
        archive
            .by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        let mut readme = String::new();
        archive
            .by_name("README.md")
            .unwrap()
            .read_to_string(&mut readme)
            .unwrap();
        let mut document = String::new();
        archive
            .by_name("document.md")
            .unwrap()
            .read_to_string(&mut document)
            .unwrap();
        let manifest = serde_json::from_str::<MarkDocManifest>(&manifest).unwrap();
        assert_eq!(manifest.entry, "document.md");
        assert!(manifest.schema.contains("markdoc-package-v1"));
        assert!(manifest.spec.contains("markdoc-package-v1"));
        assert!(readme.contains("manifest.json is the authoritative"));
        assert!(readme.contains("manifest.entry names the canonical Markdown source"));
        assert_eq!(document, "# Hello");
    }

    #[test]
    fn preserves_manifest_entry_and_safe_resources_when_repacking() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::create_dir_all(root.join("presentation")).unwrap();
        fs::create_dir_all(root.join("content")).unwrap();
        fs::write(root.join("content/main.md"), "# Hello").unwrap();
        fs::write(root.join("assets/chart.png"), "image").unwrap();
        fs::write(root.join("presentation/reference.docx"), "reference").unwrap();
        let output = dir.path().join("report.mdoc");
        let mut manifest = MarkDocManifest::new("content/main.md");
        manifest.presentation = Some(crate::package::manifest::ManifestPresentation {
            print: None,
            docx_reference: Some("presentation/reference.docx".to_string()),
        });

        write_mdoc_package(PackageWriteInput {
            workspace_root: root.to_string_lossy().to_string(),
            output_path: output.to_string_lossy().to_string(),
            entry: "content/main.md".to_string(),
            files: vec!["content/main.md".to_string(), "assets/chart.png".to_string(), "presentation/reference.docx".to_string()],
            manifest: Some(manifest.clone()),
        }).unwrap();

        let mut archive = ZipArchive::new(File::open(output).unwrap()).unwrap();
        let saved_manifest: MarkDocManifest = serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();
        assert_eq!(saved_manifest, manifest);
        assert!(archive.by_name("assets/chart.png").is_ok());
        assert!(archive.by_name("presentation/reference.docx").is_ok());
    }

    #[test]
    fn requires_the_entry_once_in_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.md"), "# Hello").unwrap();
        let output = dir.path().join("report.mdoc");

        for files in [
            vec![],
            vec!["document.md".to_string(), "document.md".to_string()],
        ] {
            assert_eq!(
                write_mdoc_package(PackageWriteInput {
                    workspace_root: root.to_string_lossy().to_string(),
                    output_path: output.to_string_lossy().to_string(),
                    entry: "document.md".to_string(),
                    files,
                    manifest: None,
                })
                .unwrap_err(),
                "package.missingEntry"
            );
        }
    }

    #[test]
    fn replaces_existing_package_and_retains_recovery_copy() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.md"), "# New").unwrap();
        let output = dir.path().join("report.mdoc");
        fs::write(&output, "previous package").unwrap();

        write_mdoc_package(PackageWriteInput {
            workspace_root: root.to_string_lossy().to_string(),
            output_path: output.to_string_lossy().to_string(),
            entry: "document.md".to_string(),
            files: vec!["document.md".to_string()],
            manifest: None,
        })
        .unwrap();

        assert_eq!(
            fs::read(output.with_extension("mdoc.bak")).unwrap(),
            b"previous package"
        );
        let mut document = String::new();
        ZipArchive::new(File::open(&output).unwrap())
            .unwrap()
            .by_name("document.md")
            .unwrap()
            .read_to_string(&mut document)
            .unwrap();
        assert_eq!(document, "# New");
        assert!(!output.with_extension("mdoc.rollback").exists());
    }

    #[test]
    fn replacement_operation_keeps_destination_until_replace_and_preserves_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("report.mdoc");
        let tmp = output.with_extension("mdoc.tmp");
        let recovery = output.with_extension("mdoc.bak");
        let rollback = output.with_extension("mdoc.rollback");
        fs::write(&output, "original package").unwrap();
        fs::write(&tmp, "replacement package").unwrap();

        let mut replacement_calls = Vec::new();
        let mut destination_present_at_replace = false;
        replace_package_with_operation(&tmp, &output, &recovery, |from, to| {
            replacement_calls.push((from.to_path_buf(), to.to_path_buf()));
            if from == tmp && to == output {
                destination_present_at_replace = to.exists();
            }
            fs::rename(from, to)
        })
        .unwrap();

        assert_eq!(replacement_calls, vec![(tmp.clone(), output.clone())]);
        assert!(destination_present_at_replace);
        assert_eq!(fs::read(&output).unwrap(), b"replacement package");
        assert_eq!(fs::read(&recovery).unwrap(), b"original package");
        assert!(!rollback.exists());
    }

    #[test]
    fn cleans_up_partial_temp_file_after_write_failure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("workspace");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("document.md"), "# Hello").unwrap();
        let output = dir.path().join("report.mdoc");

        assert_eq!(
            write_mdoc_package(PackageWriteInput {
                workspace_root: root.to_string_lossy().to_string(),
                output_path: output.to_string_lossy().to_string(),
                entry: "document.md".to_string(),
                files: vec!["document.md".to_string(), "missing.png".to_string()],
                manifest: None,
            })
            .unwrap_err(),
            "package.missingEntry"
        );
        assert!(!output.with_extension("mdoc.tmp").exists());
        assert!(!output.exists());
    }
}
