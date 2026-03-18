use std::process::Command;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ConversionResult {
    pub success: bool,
    pub content: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

/// 获取 resources 目录下的 reference.docx 路径
fn get_reference_docx(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let resource_path = app_handle
        .path()
        .resource_dir()
        .ok()?
        .join("resources")
        .join("reference.docx");
    if resource_path.exists() {
        Some(resource_path)
    } else {
        None
    }
}

/// 通用 Pandoc 转换：从 stdin 读入内容，输出到 stdout
#[tauri::command]
pub async fn pandoc_convert(
    input: String,
    from: String,
    to: String,
) -> Result<ConversionResult, String> {
    use std::io::Write;

    let mut cmd = Command::new("pandoc");
    cmd.arg("-f").arg(&from)
        .arg("-t").arg(&to)
        .arg("--wrap=none")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start pandoc: {}", e))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin.write_all(input.as_bytes()).map_err(|e| format!("Failed to write stdin: {}", e))?;
    }

    let output = child.wait_with_output().map_err(|e| format!("Failed to wait pandoc: {}", e))?;

    if output.status.success() {
        Ok(ConversionResult {
            success: true,
            content: Some(String::from_utf8_lossy(&output.stdout).to_string()),
            output_path: None,
            error: None,
        })
    } else {
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        })
    }
}

/// 文件到文件的 Pandoc 转换
/// 输出 docx 时自动附加 --reference-doc
#[tauri::command]
pub async fn pandoc_convert_file(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    extra_args: Option<Vec<String>>,
) -> Result<ConversionResult, String> {
    let mut cmd = Command::new("pandoc");
    cmd.arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("--wrap=none");

    // 先检查 extra_args 里是否已有 --reference-doc
    let has_custom_ref = extra_args.as_ref().map_or(false, |args| {
        args.iter().any(|a| a == "--reference-doc")
    });

    // 输出 docx 且没有自定义 reference 时，使用内置默认模板
    if output_path.to_lowercase().ends_with(".docx") && !has_custom_ref {
        if let Some(ref_path) = get_reference_docx(&app_handle) {
            cmd.arg("--reference-doc").arg(ref_path);
        }
    }

    if let Some(args) = extra_args {
        for arg in args {
            cmd.arg(arg);
        }
    }

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(ConversionResult {
                    success: true,
                    content: None,
                    output_path: Some(output_path),
                    error: None,
                })
            } else {
                Ok(ConversionResult {
                    success: false,
                    content: None,
                    output_path: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                })
            }
        }
        Err(e) => Err(format!("Failed to execute pandoc: {}", e)),
    }
}

/// docx 直接转 markdown（一步到位）
/// 使用 pipe_tables 格式（Vditor 兼容），禁用 simple/multiline/grid tables
#[tauri::command]
pub async fn pandoc_docx_to_markdown(
    input_path: String,
) -> Result<ConversionResult, String> {
    let output = Command::new("pandoc")
        .arg(&input_path)
        .arg("-t").arg("markdown-simple_tables-multiline_tables-grid_tables+pipe_tables")
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Failed to execute pandoc: {}", e))?;

    if output.status.success() {
        Ok(ConversionResult {
            success: true,
            content: Some(String::from_utf8_lossy(&output.stdout).to_string()),
            output_path: None,
            error: None,
        })
    } else {
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        })
    }
}

/// docx 转 HTML（兼容保留）
#[tauri::command]
pub async fn pandoc_docx_to_html(
    input_path: String,
) -> Result<ConversionResult, String> {
    let output = Command::new("pandoc")
        .arg(&input_path)
        .arg("-t").arg("html")
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Failed to execute pandoc: {}", e))?;

    if output.status.success() {
        Ok(ConversionResult {
            success: true,
            content: Some(String::from_utf8_lossy(&output.stdout).to_string()),
            output_path: None,
            error: None,
        })
    } else {
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        })
    }
}

/// 检测 pandoc 是否可用，返回版本号
#[tauri::command]
pub fn check_pandoc_available() -> Result<Option<String>, String> {
    match Command::new("pandoc").arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout);
                // 第一行格式: "pandoc 3.6.4"
                let version = version_str.lines().next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                Ok(Some(version))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

/// 安装 pandoc（macOS 用 brew/pkg，Windows 用 winget）
#[tauri::command]
pub async fn install_pandoc() -> Result<ConversionResult, String> {
    #[cfg(target_os = "macos")]
    {
        // 先尝试 brew
        let brew_check = Command::new("brew").arg("--version").output();
        if brew_check.is_ok() && brew_check.unwrap().status.success() {
            let output = Command::new("brew")
                .arg("install")
                .arg("pandoc")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to run brew: {}", e))?;

            return if output.status.success() {
                Ok(ConversionResult {
                    success: true,
                    content: Some("Pandoc installed via Homebrew".to_string()),
                    output_path: None,
                    error: None,
                })
            } else {
                Ok(ConversionResult {
                    success: false,
                    content: None,
                    output_path: None,
                    error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                })
            };
        }

        // 没有 brew，返回手动安装提示
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some("NO_BREW".to_string()),
        })
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("winget")
            .args(["install", "-e", "--id", "JohnMacFarlane.Pandoc",
                   "--silent", "--accept-source-agreements", "--accept-package-agreements"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to run winget: {}", e))?;

        if output.status.success() {
            Ok(ConversionResult {
                success: true,
                content: Some("Pandoc installed via winget".to_string()),
                output_path: None,
                error: None,
            })
        } else {
            Ok(ConversionResult {
                success: false,
                content: None,
                output_path: None,
                error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            })
        }
    }

    #[cfg(target_os = "linux")]
    {
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some("LINUX_MANUAL".to_string()),
        })
    }
}
