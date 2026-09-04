use linch_tech_desktop_core::{LinchConfig, LinchDesktopExt};
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod converter;
mod document;
mod file_access;
mod package;
mod pandoc;

/// 缓存冷启动时通过文件关联传入的路径（前端尚未就绪时暂存）
struct PendingFiles(Mutex<Vec<String>>);

/// 前端就绪后调用，取出冷启动时缓存的文件路径
#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn debug_log(message: String) {
    println!("[mark-doc debug] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = LinchConfig::from_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(PendingFiles(Mutex::new(Vec::new())))
        .manage(file_access::PathGrantState::default())
        .invoke_handler(tauri::generate_handler![
            converter::check_pandoc_available,
            converter::install_pandoc,
            file_access::select_document_file,
            file_access::select_document_folder,
            file_access::select_save_path,
            file_access::authorize_document_path,
            file_access::read_text_file,
            file_access::write_text_file,
            file_access::copy_file,
            file_access::remove_file,
            file_access::read_dir,
            file_access::read_mdoc_package,
            file_access::extract_mdoc_package,
            file_access::recover_mdoc_package,
            file_access::validate_mdoc_package,
            file_access::write_mdoc_package,
            file_access::import_docx_to_workspace,
            file_access::export_workspace_to_docx,
            file_access::write_pasted_asset,
            take_pending_files,
            debug_log,
        ])
        .with_linch_desktop(config)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| {
                        if u.scheme() == "file" {
                            u.to_file_path()
                                .ok()
                                .map(|p| p.to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                if paths.is_empty() {
                    return;
                }
                if let Some(state) = app.try_state::<file_access::PathGrantState>() {
                    for path in &paths {
                        let _ = file_access::grant_open_path(app, &state, Path::new(path));
                    }
                }

                // 尝试发送给前端；发送成功则不缓存，否则存起来等前端查询
                let mut sent = false;
                if let Some(window) = app.get_webview_window("main") {
                    if window.emit("open-files", paths.clone()).is_ok() {
                        sent = true;
                    }
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }
                if !sent {
                    if let Some(state) = app.try_state::<PendingFiles>() {
                        state.0.lock().unwrap().extend(paths);
                    }
                }
            }
        });
}
