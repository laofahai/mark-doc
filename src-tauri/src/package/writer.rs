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
    let rollback_path = output_path.with_extension("mdoc.rollback");
    replace_package_with_rename(
        tmp_path,
        output_path,
        recovery_path,
        &rollback_path,
        |from, to| fs::rename(from, to),
    )
}

// std::fs has no cross-platform atomic replacement for an existing destination.
// Keep the original beside the destination until the replacement rename succeeds.
fn replace_package_with_rename<F>(
    tmp_path: &Path,
    output_path: &Path,
    recovery_path: &Path,
    rollback_path: &Path,
    mut rename: F,
) -> Result<(), String>
where
    F: FnMut(&Path, &Path) -> std::io::Result<()>,
{
    if !output_path.exists() {
        return rename(tmp_path, output_path).map_err(|_| "save.failed".to_string());
    }

    fs::copy(output_path, recovery_path).map_err(|_| "save.recoveryFailed".to_string())?;
    if rollback_path.exists() {
        fs::remove_file(rollback_path).map_err(|_| "save.recoveryFailed".to_string())?;
    }
    rename(output_path, rollback_path).map_err(|_| "save.failed".to_string())?;

    if rename(tmp_path, output_path).is_ok() {
        return fs::remove_file(rollback_path).map_err(|_| "save.recoveryFailed".to_string());
    }

    let restore_result = rename(rollback_path, output_path);
    let _ = fs::remove_file(tmp_path);
    if restore_result.is_err() {
        return Err("save.recoveryFailed".to_string());
    }

    Err("save.failed".to_string())
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
        let mut document = String::new();
        archive
            .by_name("document.md")
            .unwrap()
            .read_to_string(&mut document)
            .unwrap();
        assert_eq!(
            serde_json::from_str::<MarkDocManifest>(&manifest)
                .unwrap()
                .entry,
            "document.md"
        );
        assert_eq!(document, "# Hello");
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
    fn restores_rollback_when_final_replacement_move_fails() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("report.mdoc");
        let tmp = output.with_extension("mdoc.tmp");
        let recovery = output.with_extension("mdoc.bak");
        let rollback = output.with_extension("mdoc.rollback");
        fs::write(&output, "original package").unwrap();
        fs::write(&tmp, "replacement package").unwrap();

        let error = replace_package_with_rename(&tmp, &output, &recovery, &rollback, |from, to| {
            if from == tmp && to == output {
                return Err(std::io::Error::other("replacement failed"));
            }
            fs::rename(from, to)
        })
        .unwrap_err();

        assert_eq!(error, "save.failed");
        assert_eq!(fs::read(&output).unwrap(), b"original package");
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
            })
            .unwrap_err(),
            "package.missingEntry"
        );
        assert!(!output.with_extension("mdoc.tmp").exists());
        assert!(!output.exists());
    }
}
