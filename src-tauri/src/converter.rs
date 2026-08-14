use std::process::Command;
use std::io::Read as IoRead;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ConversionResult {
    pub success: bool,
    pub content: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

/// 查找 resources 目录下的文件，兼容 dev 模式和 production
fn find_resource(app_handle: &tauri::AppHandle, filename: &str) -> Option<std::path::PathBuf> {
    // 1. 尝试 production 路径（bundle 后的 resource_dir）
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let path = resource_dir.join("resources").join(filename);
        if path.exists() {
            return Some(path);
        }
    }
    // 2. 尝试 dev 模式路径（src-tauri/resources/）
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join(filename);
    if dev_path.exists() {
        return Some(dev_path);
    }
    None
}

/// 获取 resources 目录下的 reference.docx 路径
fn get_reference_docx(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    find_resource(app_handle, "reference.docx")
}

/// 后处理 docx：
/// 1. 将 styles.xml 中的固定行距 (exact) 改为最小行距 (atLeast)，防止图片被裁剪
/// 2. 将 document.xml 中的表格布局改为 autofit，让 Word 根据内容自动分配列宽
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

    // 修改 styles.xml — 固定行距 → 最小行距
    let styles_path = tmp_path.join("word").join("styles.xml");
    if styles_path.exists() {
        let content = fs::read_to_string(&styles_path)
            .map_err(|e| format!("read styles.xml: {}", e))?;
        let fixed = content.replace("w:lineRule=\"exact\"", "w:lineRule=\"atLeast\"");
        fs::write(&styles_path, fixed)
            .map_err(|e| format!("write styles.xml: {}", e))?;
    }

    // 修改 document.xml — 表格布局改为 autofit
    let doc_path = tmp_path.join("word").join("document.xml");
    if doc_path.exists() {
        let content = fs::read_to_string(&doc_path)
            .map_err(|e| format!("read document.xml: {}", e))?;

        // 先移除所有已有的 tblLayout 元素
        let tbl_layout_re = regex::Regex::new(r#"<w:tblLayout[^/]*/>"#)
            .unwrap_or_else(|_| regex::Regex::new(r"$^").unwrap());
        let cleaned = tbl_layout_re.replace_all(&content, "").to_string();

        // 在每个 </w:tblPr> 前插入 autofit
        let fixed = cleaned.replace(
            "</w:tblPr>",
            "<w:tblLayout w:type=\"autofit\"/></w:tblPr>"
        );

        fs::write(&doc_path, fixed)
            .map_err(|e| format!("write document.xml: {}", e))?;
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

    let mut cmd = Command::new(crate::pandoc::binary::find_bin("pandoc"));
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
    let mut cmd = Command::new(crate::pandoc::binary::find_bin("pandoc"));
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
        // 禁用 implicit_figures，防止图片变成浮动 figure；+hard_line_breaks 保留单行换行
        cmd.arg("--from").arg("markdown-implicit_figures+hard_line_breaks");

        // 加载颜色导出 Lua filter（将 <span style="color:..."> 转为 docx 原生颜色）
        let color_filter = find_resource(&app_handle, "color-to-docx.lua");
        if let Some(filter_path) = color_filter {
            cmd.arg("--lua-filter").arg(filter_path);
        }

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

    // 在 Pandoc 转换前，提取 docx 中的颜色信息
    let colored_runs = extract_colored_runs(&input_path);

    // 创建临时目录提取图片
    let tmp_media = format!("/tmp/.markdoc-import-{}", std::process::id());

    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
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

        // 后处理：修复引用块中被合并到一行的列表项
        md = fix_blockquote_lists(&md);

        // 后处理：注入颜色信息为 HTML span
        md = inject_colors_into_markdown(&md, &colored_runs);

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

/// 修复引用块中被 --wrap=none 合并到一行的列表项
/// 例如 "> text - item1 - item2" → "> text\n> - item1\n> - item2"
fn fix_blockquote_lists(md: &str) -> String {
    let list_marker = regex::Regex::new(r" - ").unwrap();
    let mut result = Vec::new();

    for line in md.lines() {
        // 检测引用块行：以 "> " 开头且包含 " - " 模式
        if line.starts_with("> ") && list_marker.is_match(line) {
            let content = &line[2..]; // 去掉 "> "
            // 按 " - " 分割，第一段是前缀文本，后面是列表项
            let parts: Vec<&str> = content.splitn(2, " - ").collect();
            if parts.len() == 2 {
                let prefix = parts[0].trim();
                // 进一步拆分剩余列表项
                let items: Vec<&str> = parts[1].split(" - ").collect();
                if !prefix.is_empty() {
                    result.push(format!("> {}", prefix));
                    result.push(">".to_string());
                }
                for item in &items {
                    let trimmed = item.trim();
                    if !trimmed.is_empty() {
                        result.push(format!("> - {}", trimmed));
                    }
                }
            } else {
                result.push(line.to_string());
            }
        } else {
            result.push(line.to_string());
        }
    }
    result.join("\n")
}

/// 从 docx 的 word/document.xml 中提取带颜色的文字 run
/// 返回 Vec<(text, color_hex)>，只包含有颜色的 run
fn extract_colored_runs(docx_path: &str) -> Vec<(String, String)> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let file = match std::fs::File::open(docx_path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return vec![],
    };
    let mut xml_content = String::new();
    if let Ok(mut entry) = archive.by_name("word/document.xml") {
        let _ = entry.read_to_string(&mut xml_content);
    } else {
        return vec![];
    }

    let mut reader = Reader::from_str(&xml_content);
    let mut runs: Vec<(String, String)> = Vec::new();
    let mut current_color: Option<String> = None;
    let mut current_highlight: Option<String> = None;
    let mut in_rpr = false;
    let mut in_run = false;
    let mut run_text = String::new();

    let highlight_color_map = |name: &str| -> Option<&str> {
        match name {
            "yellow" => Some("#FFFF00"),
            "green" => Some("#00FF00"),
            "cyan" => Some("#00FFFF"),
            "magenta" => Some("#FF00FF"),
            "blue" => Some("#0000FF"),
            "red" => Some("#FF0000"),
            "darkBlue" => Some("#00008B"),
            "darkCyan" => Some("#008B8B"),
            "darkGreen" => Some("#006400"),
            "darkMagenta" => Some("#8B008B"),
            "darkRed" => Some("#8B0000"),
            "darkYellow" => Some("#808000"),
            "darkGray" | "darkGrey" => Some("#A9A9A9"),
            "lightGray" | "lightGrey" => Some("#D3D3D3"),
            "black" => Some("#000000"),
            _ => None,
        }
    };

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                match local.as_str() {
                    "r" => {
                        in_run = true;
                        current_color = None;
                        current_highlight = None;
                        run_text.clear();
                    }
                    "rPr" if in_run => { in_rpr = true; }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                if in_rpr {
                    if local == "color" {
                        for attr in e.attributes().flatten() {
                            let attr_local = String::from_utf8_lossy(attr.key.local_name().as_ref()).to_string();
                            if attr_local == "val" {
                                let val = String::from_utf8_lossy(&attr.value).to_string();
                                // 跳过自动颜色和黑色（默认）
                                if val != "auto" && val != "000000" {
                                    current_color = Some(val);
                                }
                            }
                        }
                    } else if local == "highlight" {
                        for attr in e.attributes().flatten() {
                            let attr_local = String::from_utf8_lossy(attr.key.local_name().as_ref()).to_string();
                            if attr_local == "val" {
                                let val = String::from_utf8_lossy(&attr.value).to_string();
                                if val != "none" {
                                    current_highlight = highlight_color_map(&val).map(|s| s.to_string());
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_run {
                    if let Ok(text) = e.unescape() {
                        run_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let local = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                match local.as_str() {
                    "r" => {
                        if !run_text.is_empty() && (current_color.is_some() || current_highlight.is_some()) {
                            // 优先用文字颜色，其次用高亮色
                            if let Some(color) = &current_color {
                                runs.push((run_text.clone(), color.clone()));
                            } else if let Some(hl) = &current_highlight {
                                // 高亮用 background-color 标记，前缀 bg: 区分
                                runs.push((run_text.clone(), format!("bg:{}", hl)));
                            }
                        }
                        in_run = false;
                        run_text.clear();
                    }
                    "rPr" => { in_rpr = false; }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    runs
}

/// 将颜色信息注入到 markdown 中
/// 查找匹配的纯文本，包裹为 HTML span
fn inject_colors_into_markdown(md: &str, colored_runs: &[(String, String)]) -> String {
    if colored_runs.is_empty() {
        return md.to_string();
    }

    let mut result = md.to_string();

    for (text, color) in colored_runs {
        let trimmed = text.trim();
        if trimmed.is_empty() || trimmed.len() < 2 {
            continue;
        }

        // 构建 HTML span
        let style = if let Some(bg) = color.strip_prefix("bg:") {
            format!("background-color:{}", bg)
        } else {
            format!("color:#{}", color)
        };
        let span = format!("<span style=\"{}\">{}</span>", style, trimmed);

        // 在 markdown 中查找纯文本并替换（只替换第一次出现）
        // 需要避免替换掉已经在 HTML 标签内的文本
        // 也要处理 markdown 加粗/斜体包裹的情况
        if let Some(pos) = result.find(trimmed) {
            // 检查是否已经在 <span> 标签内
            let before = &result[..pos];
            if !before.ends_with("style=\"\">") && !before.ends_with("\">") {
                result = format!("{}{}{}", &result[..pos], span, &result[pos + trimmed.len()..]);
            }
        }
    }

    result
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
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
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
    Ok(crate::pandoc::health::pandoc_version())
}

/// 安装 pandoc（macOS 用 brew/pkg，Windows 用 winget）
#[tauri::command]
pub async fn install_pandoc() -> Result<ConversionResult, String> {
    #[cfg(target_os = "macos")]
    {
        // 先尝试 brew
        let brew_check = Command::new(crate::pandoc::binary::find_bin("brew")).arg("--version").output();
        if brew_check.is_ok() && brew_check.unwrap().status.success() {
            let output = Command::new(crate::pandoc::binary::find_bin("brew"))
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
