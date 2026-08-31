use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ConversionResult {
    pub success: bool,
    pub content: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

/// 检测 pandoc 是否可用，返回版本号
#[tauri::command]
pub fn check_pandoc_available() -> Result<Option<String>, String> {
    Ok(crate::pandoc::health::pandoc_version())
}

/// 安装 pandoc（macOS 用 brew，Windows 用 winget）
#[tauri::command]
pub async fn install_pandoc() -> Result<ConversionResult, String> {
    #[cfg(target_os = "macos")]
    {
        let brew_check = Command::new(crate::pandoc::binary::find_bin("brew"))
            .arg("--version")
            .output();
        if brew_check.is_ok() && brew_check.unwrap().status.success() {
            let output = Command::new(crate::pandoc::binary::find_bin("brew"))
                .arg("install")
                .arg("pandoc")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .map_err(|error| format!("Failed to run brew: {error}"))?;

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
            .args([
                "install",
                "-e",
                "--id",
                "JohnMacFarlane.Pandoc",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|error| format!("Failed to run winget: {error}"))?;

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
