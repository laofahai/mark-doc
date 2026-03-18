use linch_tech_desktop_core::{LinchDesktopExt, LinchConfig};

mod converter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = LinchConfig::from_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            converter::pandoc_convert,
            converter::pandoc_convert_file,
            converter::pandoc_docx_to_html,
            converter::pandoc_docx_to_markdown,
            converter::check_pandoc_available,
            converter::install_pandoc,
        ])
        .with_linch_desktop(config)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
