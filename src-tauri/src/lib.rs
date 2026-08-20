use linch_tech_desktop_core::{LinchDesktopExt, LinchConfig};
use tauri::{Manager, Emitter};
use std::sync::Mutex;

mod converter;
mod document;
mod package;
mod pandoc;

/// 缓存冷启动时通过文件关联传入的路径（前端尚未就绪时暂存）
struct PendingFiles(Mutex<Vec<String>>);

/// 前端就绪后调用，取出冷启动时缓存的文件路径
#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
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
        .setup(|app| {
            // 生产环境禁用右键菜单
            #[cfg(not(debug_assertions))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval(r#"
                        document.addEventListener('contextmenu', function(e) {
                            if (!e.target.closest('.vditor')) e.preventDefault();
                        }, true);
                    "#);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Legacy FileContext compatibility commands. Document workspace flows use document::*.
            converter::pandoc_convert,
            converter::pandoc_convert_file,
            converter::pandoc_docx_to_html,
            converter::pandoc_docx_to_markdown,
            converter::check_pandoc_available,
            converter::install_pandoc,
            document::docx_import::import_docx_to_workspace,
            document::docx_export::export_workspace_to_docx,
            package::reader::read_mdoc_package,
            package::reader::extract_mdoc_package,
            package::writer::write_mdoc_package,
            take_pending_files,
        ])
        .with_linch_desktop(config)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls.iter()
                    .filter_map(|u| {
                        if u.scheme() == "file" {
                            u.to_file_path().ok().map(|p| p.to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                if paths.is_empty() { return; }

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
