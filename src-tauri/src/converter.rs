use std::process::Command;
use tauri::Manager;

/// 查找可执行文件的绝对路径，解决 macOS GUI 启动时 PATH 不完整问题
fn find_bin(name: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        // macOS GUI 应用的 PATH 极其有限，直接检查常见安装路径
        let candidates = [
            format!("/opt/homebrew/bin/{}", name),   // Apple Silicon Homebrew
            format!("/usr/local/bin/{}", name),       // Intel Homebrew
            format!("/usr/bin/{}", name),             // 系统自带
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
        // 再尝试通过 shell 展开完整 PATH 来查找
        if let Ok(output) = Command::new("/bin/sh")
            .arg("-l")
            .arg("-c")
            .arg(format!("which {}", name))
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(output) = Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    name.to_string()
}

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

/// 后处理 docx：将 styles.xml 中的固定行距 (exact) 改为最小行距 (atLeast)
/// 防止图片被固定行高裁剪
fn fix_docx_line_spacing(docx_path: &str) -> Result<(), String> {
    use std::fs;
    use std::path::Path;

    let tmp_dir = format!("{}.fixtemp", docx_path);
    let tmp_path = Path::new(&tmp_dir);

    // 解压
    let unzip_out = Command::new("unzip")
        .arg("-o").arg(docx_path)
        .arg("-d").arg(&tmp_dir)
        .output()
        .map_err(|e| format!("unzip failed: {}", e))?;
    if !unzip_out.status.success() {
        return Err("unzip failed".to_string());
    }

    // 修改 styles.xml
    let styles_path = tmp_path.join("word").join("styles.xml");
    if styles_path.exists() {
        let content = fs::read_to_string(&styles_path)
            .map_err(|e| format!("read styles.xml: {}", e))?;
        let fixed = content.replace("w:lineRule=\"exact\"", "w:lineRule=\"atLeast\"");
        fs::write(&styles_path, fixed)
            .map_err(|e| format!("write styles.xml: {}", e))?;
    }

    // 删除原文件后重新打包
    let _ = fs::remove_file(docx_path);
    let zip_out = Command::new("sh")
        .arg("-c")
        .arg(format!(
            "cd '{}' && zip -r '{}' . > /dev/null 2>&1",
            tmp_dir, docx_path
        ))
        .output()
        .map_err(|e| format!("zip failed: {}", e))?;

    // 清理临时目录
    let _ = fs::remove_dir_all(&tmp_dir);

    if zip_out.status.success() {
        Ok(())
    } else {
        Err("zip repack failed".to_string())
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

    let mut cmd = Command::new(find_bin("pandoc"));
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
    let mut cmd = Command::new(find_bin("pandoc"));
    cmd.arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("--wrap=none");

    // 先检查 extra_args 里是否已有 --reference-doc
    let has_custom_ref = extra_args.as_ref().map_or(false, |args| {
        args.iter().any(|a| a == "--reference-doc")
    });

    // 输出 docx 时的特殊处理
    if output_path.to_lowercase().ends_with(".docx") {
        // 禁用 implicit_figures，防止图片变成浮动 figure 导致裁剪/错位
        cmd.arg("--from").arg("markdown-implicit_figures");

        // 没有自定义 reference 时，使用内置默认模板
        if !has_custom_ref {
            if let Some(ref_path) = get_reference_docx(&app_handle) {
                cmd.arg("--reference-doc").arg(ref_path);
            }
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
                // 后处理：修复 pandoc 生成的固定行距（exact → atLeast），防止图片被裁剪
                if output_path.to_lowercase().ends_with(".docx") {
                    let _ = fix_docx_line_spacing(&output_path);
                }
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
/// 图片提取到临时目录后转为 base64 内嵌
#[tauri::command]
pub async fn pandoc_docx_to_markdown(
    input_path: String,
) -> Result<ConversionResult, String> {
    use std::fs;

    // 创建临时目录提取图片
    let tmp_media = format!("/tmp/.markdoc-import-{}", std::process::id());

    let output = Command::new(find_bin("pandoc"))
        .arg(&input_path)
        .arg("-t").arg("markdown-simple_tables-multiline_tables-grid_tables+pipe_tables-link_attributes-raw_attribute")
        .arg("--extract-media").arg(&tmp_media)
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Failed to execute pandoc: {}", e))?;

    if output.status.success() {
        let mut md = String::from_utf8_lossy(&output.stdout).to_string();

        // 将提取的图片转为 base64 内嵌到 markdown
        md = embed_images_as_base64(&md, &tmp_media);

        // 清理 pandoc 残留的属性语法 {width=... height=...}
        let attr_re = regex::Regex::new(r"\{[^}]*width=[^}]*\}").unwrap_or_else(|_| regex::Regex::new(r"$^").unwrap());
        md = attr_re.replace_all(&md, "").to_string();

        // 清理临时目录
        let _ = fs::remove_dir_all(&tmp_media);

        Ok(ConversionResult {
            success: true,
            content: Some(md),
            output_path: None,
            error: None,
        })
    } else {
        let _ = fs::remove_dir_all(&tmp_media);
        Ok(ConversionResult {
            success: false,
            content: None,
            output_path: None,
            error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        })
    }
}

/// 根据文件扩展名返回 MIME 类型
fn mime_from_ext(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("png").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

/// 读取本地图片文件，返回 base64 data URI
fn file_to_base64_uri(path: &str) -> Option<String> {
    use base64::Engine;
    let bytes = std::fs::read(path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{};base64,{}", mime_from_ext(path), b64))
}

/// 将 markdown 中引用的本地图片文件转为 base64 data URI
/// 同时处理 markdown 语法 ![alt](path) 和 HTML <img src="path"> 标签
fn embed_images_as_base64(md: &str, _base_dir: &str) -> String {
    // 1. 处理 HTML <img> 标签 → 转为 markdown ![alt](base64)
    let html_img_re = regex::Regex::new(r#"<img\s[^>]*src="([^"]+)"[^>]*>"#).unwrap();
    let result = html_img_re.replace_all(md, |caps: &regex::Captures| {
        let src = &caps[1];
        if src.starts_with("data:") || src.starts_with("http") {
            return caps[0].to_string();
        }
        // 提取 alt
        let alt = regex::Regex::new(r#"alt="([^"]*)""#).ok()
            .and_then(|re| re.captures(&caps[0]))
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        match file_to_base64_uri(src) {
            Some(uri) => format!("![{}]({})", alt, uri),
            None => caps[0].to_string(),
        }
    });

    // 2. 处理 markdown ![alt](path)
    let md_img_re = regex::Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").unwrap();
    let result = md_img_re.replace_all(&result, |caps: &regex::Captures| {
        let alt = &caps[1];
        let path = &caps[2];

        if path.starts_with("data:") || path.starts_with("http://") || path.starts_with("https://") {
            return caps[0].to_string();
        }

        match file_to_base64_uri(path) {
            Some(uri) => format!("![{}]({})", alt, uri),
            None => caps[0].to_string(),
        }
    });

    result.to_string()
}

/// docx 转 HTML（兼容保留）
#[tauri::command]
pub async fn pandoc_docx_to_html(
    input_path: String,
) -> Result<ConversionResult, String> {
    let output = Command::new(find_bin("pandoc"))
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
    match Command::new(find_bin("pandoc")).arg("--version").output() {
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
        let brew_check = Command::new(find_bin("brew")).arg("--version").output();
        if brew_check.is_ok() && brew_check.unwrap().status.success() {
            let output = Command::new(find_bin("brew"))
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
