use crate::document::docx_export::{ExportWorkspaceToDocxInput, ExportWorkspaceToDocxResult};
use crate::document::docx_import::DocxImportResult;
use crate::package::reader::{PackageExtractResult, PackageReadResult, PackageValidationResult};
use crate::package::writer::{PackageWriteInput, PackageWriteResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

const DENIED: &str = "fileAccess.denied";

#[derive(Debug, Clone)]
struct PathGrant {
    root: PathBuf,
    recursive: bool,
    read: bool,
    write: bool,
}

#[derive(Debug, Default)]
struct PathGrantRegistry {
    grants: Vec<PathGrant>,
}

#[derive(Debug, Default)]
pub(crate) struct PathGrantState(Mutex<PathGrantRegistry>);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogFilter {
    name: String,
    #[serde(default)]
    extensions: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDialogOptions {
    #[serde(default)]
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<DialogFilter>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDialogOptions {
    #[serde(default)]
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<DialogFilter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDirEntry {
    name: String,
    path: String,
    is_directory: bool,
    is_file: bool,
}

impl PathGrantRegistry {
    fn grant_open_file(&mut self, path: &Path) -> Result<(), String> {
        let path = normalize_host_path(path)?;
        self.allow(path.clone(), false, true, true);
        if should_grant_resource_directory(&path) {
            if let Some(parent) = path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
            {
                self.allow(parent.to_path_buf(), true, true, false);
            }
        }
        Ok(())
    }

    fn grant_save_file(&mut self, path: &Path) -> Result<(), String> {
        let path = normalize_host_path(path)?;
        self.allow(path.clone(), false, true, true);
        if path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("mdoc"))
        {
            self.allow(path.with_extension("mdoc.tmp"), false, false, true);
            self.allow(path.with_extension("mdoc.bak"), false, false, true);
        }
        Ok(())
    }

    fn grant_folder(&mut self, path: &Path) -> Result<(), String> {
        let path = normalize_host_path(path)?;
        self.allow(path.clone(), true, true, true);
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            self.allow(parent.to_path_buf(), false, true, false);
        }
        Ok(())
    }

    fn ensure_read(&self, path: &Path) -> Result<(), String> {
        self.ensure(path, AccessMode::Read)
    }

    fn ensure_write(&self, path: &Path) -> Result<(), String> {
        self.ensure(path, AccessMode::Write)
    }

    fn ensure(&self, path: &Path, mode: AccessMode) -> Result<(), String> {
        let path = normalize_host_path(path)?;
        if is_markdoc_temp_path(&path) {
            return Ok(());
        }
        let allowed = self.grants.iter().any(|grant| {
            let permission = match mode {
                AccessMode::Read => grant.read,
                AccessMode::Write => grant.write,
            };
            permission && grant.matches(&path)
        });
        if allowed {
            Ok(())
        } else {
            Err(DENIED.to_string())
        }
    }

    fn allow(&mut self, root: PathBuf, recursive: bool, read: bool, write: bool) {
        if self.grants.iter().any(|grant| {
            grant.root == root
                && grant.recursive == recursive
                && (!read || grant.read)
                && (!write || grant.write)
        }) {
            return;
        }
        self.grants.push(PathGrant {
            root,
            recursive,
            read,
            write,
        });
    }
}

fn is_supported_document_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdoc" | "txt" | "docx" | "doc"
            )
        })
}

fn validate_supported_document_file(path: &Path) -> Result<PathBuf, String> {
    let path = normalize_host_path(path)?;
    if !is_supported_document_path(&path)
        || !fs::metadata(&path)
            .map(|metadata| metadata.is_file())
            .unwrap_or(false)
    {
        return Err(DENIED.to_string());
    }
    Ok(path)
}

fn should_grant_resource_directory(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

impl PathGrant {
    fn matches(&self, path: &Path) -> bool {
        if self.recursive {
            path == self.root || path.starts_with(&self.root)
        } else {
            path == self.root
        }
    }
}

impl PathGrantState {
    fn grant_open_file(&self, path: &Path) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| DENIED.to_string())?
            .grant_open_file(path)
    }

    fn grant_save_file(&self, path: &Path) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| DENIED.to_string())?
            .grant_save_file(path)
    }

    fn grant_folder(&self, path: &Path) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| DENIED.to_string())?
            .grant_folder(path)
    }

    fn ensure_read(&self, path: &Path) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| DENIED.to_string())?
            .ensure_read(path)
    }

    fn ensure_write(&self, path: &Path) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| DENIED.to_string())?
            .ensure_write(path)
    }
}

#[derive(Copy, Clone)]
enum AccessMode {
    Read,
    Write,
}

fn normalize_host_path(path: &Path) -> Result<PathBuf, String> {
    if !is_safe_absolute_path(path) {
        return Err(DENIED.to_string());
    }
    Ok(path.to_path_buf())
}

fn is_safe_absolute_path(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {}
            Component::CurDir | Component::ParentDir => return false,
        }
    }
    true
}

fn is_markdoc_temp_path(path: &Path) -> bool {
    if !is_safe_absolute_path(path) {
        return false;
    }
    markdoc_temp_roots()
        .iter()
        .any(|root| path == root || path.starts_with(root))
}

fn markdoc_temp_roots() -> Vec<PathBuf> {
    let mut roots = vec![
        PathBuf::from("/tmp/markdoc"),
        PathBuf::from("/private/tmp/markdoc"),
        std::env::temp_dir().join("markdoc"),
    ];
    roots.sort();
    roots.dedup();
    roots
}

fn path_string(path: PathBuf) -> Result<String, String> {
    path.to_str()
        .map(|path| path.to_string())
        .ok_or_else(|| "fileAccess.invalidPath".to_string())
}

fn dialog_path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    path.into_path()
        .map_err(|_| "fileAccess.invalidPath".to_string())
        .and_then(path_string)
}

fn apply_dialog_options<R: Runtime>(
    mut builder: tauri_plugin_dialog::FileDialogBuilder<R>,
    default_path: Option<String>,
    filters: &[DialogFilter],
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    if let Some(default_path) = default_path.filter(|path| !path.trim().is_empty()) {
        let path = PathBuf::from(default_path);
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            builder = builder.set_directory(parent);
        }
        if let Some(file_name) = path.file_name().and_then(|name| name.to_str()) {
            builder = builder.set_file_name(file_name);
        } else if path.parent().is_none() {
            if let Some(name) = path.to_str() {
                builder = builder.set_file_name(name);
            }
        }
    }

    for filter in filters {
        if filter.extensions.is_empty() {
            continue;
        }
        let extensions = filter
            .extensions
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        builder = builder.add_filter(&filter.name, &extensions);
    }
    builder
}

fn default_document_filters() -> Vec<DialogFilter> {
    vec![
        DialogFilter {
            name: "MarkDoc".to_string(),
            extensions: vec!["mdoc".to_string()],
        },
        DialogFilter {
            name: "Markdown".to_string(),
            extensions: vec!["md".to_string(), "markdown".to_string()],
        },
        DialogFilter {
            name: "Text".to_string(),
            extensions: vec!["txt".to_string()],
        },
        DialogFilter {
            name: "Word".to_string(),
            extensions: vec!["docx".to_string(), "doc".to_string()],
        },
    ]
}

async fn receive_dialog_path(
    mut receiver: tauri::async_runtime::Receiver<Option<tauri_plugin_dialog::FilePath>>,
) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    receiver
        .recv()
        .await
        .ok_or_else(|| "fileAccess.dialogFailed".to_string())
}

async fn pick_file(
    builder: tauri_plugin_dialog::FileDialogBuilder<impl Runtime>,
) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    let (sender, receiver) = tauri::async_runtime::channel(1);
    builder.pick_file(move |path| {
        let _ = sender.blocking_send(path);
    });
    receive_dialog_path(receiver).await
}

#[cfg(desktop)]
async fn pick_folder(
    builder: tauri_plugin_dialog::FileDialogBuilder<impl Runtime>,
) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    let (sender, receiver) = tauri::async_runtime::channel(1);
    builder.pick_folder(move |path| {
        let _ = sender.blocking_send(path);
    });
    receive_dialog_path(receiver).await
}

async fn save_file(
    builder: tauri_plugin_dialog::FileDialogBuilder<impl Runtime>,
) -> Result<Option<tauri_plugin_dialog::FilePath>, String> {
    let (sender, receiver) = tauri::async_runtime::channel(1);
    builder.save_file(move |path| {
        let _ = sender.blocking_send(path);
    });
    receive_dialog_path(receiver).await
}

fn allow_tauri_file_scope<R: Runtime>(app: &AppHandle<R>, path: &Path) {
    let scope = app.fs_scope();
    let _ = scope.allow_file(path);
}

fn allow_tauri_directory_scope<R: Runtime>(app: &AppHandle<R>, path: &Path, recursive: bool) {
    let scope = app.fs_scope();
    let _ = scope.allow_directory(path, recursive);
}

pub(crate) fn grant_open_path<R: Runtime>(
    app: &AppHandle<R>,
    grants: &PathGrantState,
    path: &Path,
) -> Result<PathBuf, String> {
    let path = validate_supported_document_file(path)?;
    grants.grant_open_file(&path)?;
    allow_tauri_file_scope(app, &path);
    if should_grant_resource_directory(&path) {
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            allow_tauri_directory_scope(app, parent, true);
        }
    }
    Ok(path)
}

#[tauri::command]
pub fn authorize_document_path<R: Runtime>(
    app: AppHandle<R>,
    grants: State<'_, PathGrantState>,
    path: String,
) -> Result<String, String> {
    let path_buf = grant_open_path(&app, &grants, Path::new(&path))?;
    path_string(path_buf)
}

#[tauri::command]
pub async fn select_document_file<R: Runtime>(
    app: AppHandle<R>,
    grants: State<'_, PathGrantState>,
    options: Option<OpenDialogOptions>,
) -> Result<Option<String>, String> {
    let options = options.unwrap_or_default();
    let filters = if options.filters.is_empty() {
        default_document_filters()
    } else {
        options.filters
    };
    let selected = pick_file(apply_dialog_options(
        app.dialog().file(),
        options.default_path,
        &filters,
    ))
    .await?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = dialog_path_to_string(selected)?;
    let path = grant_open_path(&app, &grants, Path::new(&path))?;
    path_string(path).map(Some)
}

#[tauri::command]
#[cfg(desktop)]
pub async fn select_document_folder<R: Runtime>(
    app: AppHandle<R>,
    grants: State<'_, PathGrantState>,
) -> Result<Option<String>, String> {
    let selected = pick_folder(app.dialog().file()).await?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = dialog_path_to_string(selected)?;
    grants.grant_folder(Path::new(&path))?;
    allow_tauri_directory_scope(&app, Path::new(&path), true);
    if let Some(parent) = Path::new(&path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        allow_tauri_directory_scope(&app, parent, false);
    }
    Ok(Some(path))
}

#[tauri::command]
pub async fn select_save_path<R: Runtime>(
    app: AppHandle<R>,
    grants: State<'_, PathGrantState>,
    options: SaveDialogOptions,
) -> Result<Option<String>, String> {
    let selected = save_file(apply_dialog_options(
        app.dialog().file(),
        options.default_path,
        &options.filters,
    ))
    .await?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = dialog_path_to_string(selected)?;
    grants.grant_save_file(Path::new(&path))?;
    allow_tauri_file_scope(&app, Path::new(&path));
    Ok(Some(path))
}

#[tauri::command]
pub fn read_text_file(path: String, grants: State<'_, PathGrantState>) -> Result<String, String> {
    let path = PathBuf::from(path);
    grants.ensure_read(&path)?;
    fs::read_to_string(path).map_err(|_| "fileAccess.readFailed".to_string())
}

#[tauri::command]
pub fn write_text_file(
    path: String,
    contents: String,
    grants: State<'_, PathGrantState>,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    grants.ensure_write(&path)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|_| "fileAccess.writeFailed".to_string())?;
    }
    fs::write(path, contents).map_err(|_| "fileAccess.writeFailed".to_string())
}

#[tauri::command]
pub fn copy_file(
    source_path: String,
    target_path: String,
    grants: State<'_, PathGrantState>,
) -> Result<u64, String> {
    let source_path = PathBuf::from(source_path);
    let target_path = PathBuf::from(target_path);
    grants.ensure_read(&source_path)?;
    grants.ensure_write(&target_path)?;
    if let Some(parent) = target_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|_| "fileAccess.copyFailed".to_string())?;
    }
    fs::copy(source_path, target_path).map_err(|_| "fileAccess.copyFailed".to_string())
}

#[tauri::command]
pub fn remove_file(path: String, grants: State<'_, PathGrantState>) -> Result<(), String> {
    let path = PathBuf::from(path);
    grants.ensure_write(&path)?;
    fs::remove_file(path).map_err(|_| "fileAccess.removeFailed".to_string())
}

#[tauri::command]
pub fn read_dir(
    path: String,
    grants: State<'_, PathGrantState>,
) -> Result<Vec<NativeDirEntry>, String> {
    let path = PathBuf::from(path);
    grants.ensure_read(&path)?;
    let mut entries = fs::read_dir(&path)
        .map_err(|_| "fileAccess.readDirFailed".to_string())?
        .map(|entry| {
            let entry = entry.map_err(|_| "fileAccess.readDirFailed".to_string())?;
            let file_type = entry
                .file_type()
                .map_err(|_| "fileAccess.readDirFailed".to_string())?;
            Ok(NativeDirEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path_string(entry.path())?,
                is_directory: file_type.is_dir(),
                is_file: file_type.is_file(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

#[tauri::command]
pub fn read_mdoc_package(
    package_path: String,
    grants: State<'_, PathGrantState>,
) -> Result<PackageReadResult, String> {
    grants.ensure_read(Path::new(&package_path))?;
    crate::package::reader::read_mdoc_package(package_path)
}

#[tauri::command]
pub fn validate_mdoc_package(
    package_path: String,
    grants: State<'_, PathGrantState>,
) -> Result<PackageValidationResult, String> {
    grants.ensure_read(Path::new(&package_path))?;
    crate::package::reader::validate_mdoc_package(package_path)
}

#[tauri::command]
pub fn extract_mdoc_package(
    package_path: String,
    workspace_root: String,
    grants: State<'_, PathGrantState>,
) -> Result<PackageExtractResult, String> {
    grants.ensure_read(Path::new(&package_path))?;
    grants.ensure_write(Path::new(&workspace_root))?;
    crate::package::reader::extract_mdoc_package(package_path, workspace_root)
}

#[tauri::command]
pub fn recover_mdoc_package(
    package_path: String,
    workspace_root: String,
    grants: State<'_, PathGrantState>,
) -> Result<PackageExtractResult, String> {
    grants.ensure_read(Path::new(&package_path))?;
    grants.ensure_write(Path::new(&workspace_root))?;
    crate::package::reader::recover_mdoc_package(package_path, workspace_root)
}

#[tauri::command]
pub fn write_mdoc_package(
    input: PackageWriteInput,
    grants: State<'_, PathGrantState>,
) -> Result<PackageWriteResult, String> {
    grants.ensure_read(Path::new(&input.workspace_root))?;
    grants.ensure_write(Path::new(&input.output_path))?;
    if let Some(source_package_path) = input.source_package_path.as_ref() {
        grants.ensure_read(Path::new(source_package_path))?;
    }
    crate::package::writer::write_mdoc_package(input)
}

#[tauri::command]
pub fn import_docx_to_workspace(
    input_path: String,
    workspace_root: String,
    grants: State<'_, PathGrantState>,
) -> Result<DocxImportResult, String> {
    grants.ensure_read(Path::new(&input_path))?;
    grants.ensure_write(Path::new(&workspace_root))?;
    crate::document::docx_import::import_docx_to_workspace(input_path, workspace_root)
}

#[tauri::command]
pub fn export_workspace_to_docx(
    input: ExportWorkspaceToDocxInput,
    grants: State<'_, PathGrantState>,
) -> Result<ExportWorkspaceToDocxResult, String> {
    grants.ensure_read(Path::new(&input.markdown_path))?;
    grants.ensure_write(Path::new(&input.output_path))?;
    if let Some(reference_docx) = input.reference_docx.as_ref() {
        grants.ensure_read(Path::new(reference_docx))?;
    }
    crate::document::docx_export::export_workspace_to_docx(input)
}

#[tauri::command]
pub fn write_pasted_asset(
    path: String,
    bytes: Vec<u8>,
    grants: State<'_, PathGrantState>,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    grants.ensure_write(&path)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|_| "pastedAsset.mkdirFailed".to_string())?;
    }
    fs::write(&path, bytes).map_err(|_| "pastedAsset.writeFailed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    #[cfg(not(windows))]
    fn open_file_grant_allows_file_write_and_parent_read_for_assets() {
        let mut grants = PathGrantRegistry::default();

        grants
            .grant_open_file(Path::new("/Users/alice/project/docs/report.md"))
            .unwrap();

        assert!(grants
            .ensure_read(Path::new("/Users/alice/project/docs/report.md"))
            .is_ok());
        assert!(grants
            .ensure_write(Path::new("/Users/alice/project/docs/report.md"))
            .is_ok());
        assert!(grants
            .ensure_read(Path::new("/Users/alice/project/docs/assets/image.png"))
            .is_ok());
        assert_eq!(
            grants
                .ensure_write(Path::new("/Users/alice/project/docs/assets/image.png"))
                .unwrap_err(),
            "fileAccess.denied"
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn package_open_grant_is_limited_to_the_selected_file() {
        let mut grants = PathGrantRegistry::default();

        grants
            .grant_open_file(Path::new("/Users/alice/project/docs/report.mdoc"))
            .unwrap();

        assert!(grants
            .ensure_read(Path::new("/Users/alice/project/docs/report.mdoc"))
            .is_ok());
        assert_eq!(
            grants
                .ensure_read(Path::new("/Users/alice/project/docs/secret.md"))
                .unwrap_err(),
            "fileAccess.denied"
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn save_file_grant_allows_only_the_selected_output_file() {
        let mut grants = PathGrantRegistry::default();

        grants
            .grant_save_file(Path::new("/Users/alice/exports/report.mdoc"))
            .unwrap();

        assert!(grants
            .ensure_write(Path::new("/Users/alice/exports/report.mdoc"))
            .is_ok());
        assert_eq!(
            grants
                .ensure_write(Path::new("/Users/alice/exports/other.mdoc"))
                .unwrap_err(),
            "fileAccess.denied"
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn ungranted_host_paths_are_denied() {
        let grants = PathGrantRegistry::default();

        assert_eq!(
            grants
                .ensure_read(Path::new("/Users/alice/project/docs/report.md"))
                .unwrap_err(),
            "fileAccess.denied"
        );
        assert_eq!(
            grants
                .ensure_write(Path::new("/Users/alice/project/docs/report.md"))
                .unwrap_err(),
            "fileAccess.denied"
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn markdoc_temp_paths_are_allowed_without_an_explicit_grant() {
        let grants = PathGrantRegistry::default();

        assert!(grants
            .ensure_read(Path::new("/tmp/markdoc/save-1/document.md"))
            .is_ok());
        assert!(grants
            .ensure_write(Path::new("/private/tmp/markdoc/recovery/doc.md"))
            .is_ok());
    }

    #[test]
    #[cfg(not(windows))]
    fn rejects_relative_and_traversal_paths_before_granting() {
        let mut grants = PathGrantRegistry::default();

        assert_eq!(
            grants
                .grant_save_file(Path::new("relative/report.mdoc"))
                .unwrap_err(),
            "fileAccess.denied"
        );
        assert_eq!(
            grants
                .grant_open_file(Path::new("/Users/alice/docs/../secret.md"))
                .unwrap_err(),
            "fileAccess.denied"
        );
    }

    #[test]
    #[cfg(not(windows))]
    fn document_path_authorization_is_limited_to_supported_extensions() {
        assert!(is_supported_document_path(Path::new(
            "/Users/alice/report.mdoc"
        )));
        assert!(is_supported_document_path(Path::new(
            "/Users/alice/report.md"
        )));
        assert!(is_supported_document_path(Path::new(
            "/Users/alice/report.txt"
        )));
        assert!(is_supported_document_path(Path::new(
            "/Users/alice/report.docx"
        )));
        assert!(is_supported_document_path(Path::new(
            "/Users/alice/report.doc"
        )));
        assert!(!is_supported_document_path(Path::new(
            "/Users/alice/.ssh/config"
        )));
        assert!(!is_supported_document_path(Path::new(
            "/Users/alice/archive.zip"
        )));
    }
}
