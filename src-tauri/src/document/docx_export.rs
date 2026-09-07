use quick_xml::{
    events::{BytesStart, Event},
    name::{QName, ResolveResult},
    reader::NsReader,
    Writer,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

const DAILY_REFERENCE: &[u8] = include_bytes!("../../resources/reference-daily.docx");
const FORMAL_REFERENCE: &[u8] = include_bytes!("../../resources/reference.docx");
const WORD_NS: &[u8] = b"http://schemas.openxmlformats.org/wordprocessingml/2006/main";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuiltinTemplate {
    Daily,
    Formal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageLayout {
    pub size: String,
    pub orientation: String,
    pub margins: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWorkspaceToDocxInput {
    pub markdown_path: String,
    pub output_path: String,
    pub reference_docx: Option<String>,
    pub builtin_template: Option<BuiltinTemplate>,
    pub page_layout: Option<PageLayout>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportWorkspaceToDocxResult {
    pub output_path: String,
}

struct ExportPaths {
    markdown_path: PathBuf,
    output_path: PathBuf,
    working_directory: PathBuf,
}

fn absolutize_export_paths(
    markdown_path: &str,
    output_path: &str,
    current_directory: &Path,
) -> Result<ExportPaths, String> {
    let markdown_path = absolutize_path(markdown_path, current_directory)?;
    let output_path = absolutize_path(output_path, current_directory)?;
    Ok(ExportPaths {
        working_directory: markdown_parent(&markdown_path)?,
        output_path,
        markdown_path,
    })
}

pub fn export_workspace_to_docx(
    input: ExportWorkspaceToDocxInput,
) -> Result<ExportWorkspaceToDocxResult, String> {
    let current_directory = env::current_dir().map_err(|_| "export.docxFailed".to_string())?;
    let paths =
        absolutize_export_paths(&input.markdown_path, &input.output_path, &current_directory)?;
    if !fs::metadata(&paths.markdown_path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
    {
        return Err("export.docxFailed".to_string());
    }
    let reference_bytes = if let Some(path) = input.reference_docx.as_deref() {
        if input.builtin_template.is_some() {
            return Err("export.docxFailed".into());
        }
        let reference = absolutize_path(path, &current_directory)?;
        if fs::canonicalize(&reference)
            .ok()
            .zip(fs::canonicalize(&paths.output_path).ok())
            .is_some_and(|(reference, output)| reference == output)
        {
            return Err("export.docxFailed".into());
        }
        fs::read(reference).map_err(|_| "export.docxFailed")?
    } else {
        match input.builtin_template.unwrap_or(BuiltinTemplate::Daily) {
            BuiltinTemplate::Daily => DAILY_REFERENCE.to_vec(),
            BuiltinTemplate::Formal => FORMAL_REFERENCE.to_vec(),
        }
    };
    let reference_bytes = if let Some(layout) = input.page_layout.as_ref() {
        reference_with_layout(&reference_bytes, layout).map_err(|_| "export.docxFailed")?
    } else {
        reference_bytes
    };
    let temporary = TemporaryReference::create(&reference_bytes)?;
    let markdown_path = path_string(&paths.markdown_path)?;
    let output_path = path_string(&paths.output_path)?;
    let reference_docx = path_string(&temporary.0.join("reference.docx"))?;
    let args =
        crate::pandoc::args::docx_export_args(&markdown_path, &output_path, Some(&reference_docx));
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .current_dir(paths.working_directory)
        .args(args)
        .output()
        .map_err(|_| "export.docxFailed".to_string())?;

    if !output.status.success() {
        #[cfg(test)]
        eprintln!(
            "Pandoc export failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        return Err("export.docxFailed".to_string());
    }

    Ok(ExportWorkspaceToDocxResult { output_path })
}

struct TemporaryReference(PathBuf);

impl TemporaryReference {
    fn create(bytes: &[u8]) -> Result<Self, String> {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "export.docxFailed")?
            .as_nanos();
        let path = env::temp_dir().join(format!(
            "markdoc-docx-{}-{timestamp}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&path).map_err(|_| "export.docxFailed")?;
        let result = Self(path);
        fs::write(result.0.join("reference.docx"), bytes).map_err(|_| "export.docxFailed")?;
        Ok(result)
    }
}

impl Drop for TemporaryReference {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn margin_twips(value: &str) -> Result<String, String> {
    let (number, factor) = [
        ("mm", 1440.0 / 25.4),
        ("cm", 1440.0 / 2.54),
        ("in", 1440.0),
        ("pt", 20.0),
    ]
    .iter()
    .find_map(|(unit, factor)| value.trim().strip_suffix(unit).map(|n| (n, *factor)))
    .ok_or("invalid margin")?;
    let number: f64 = number.parse().map_err(|_| "invalid margin")?;
    if !number.is_finite() || !(0.0..=100.0).contains(&number) {
        return Err("invalid margin".into());
    }
    Ok((number * factor).round().to_string())
}

fn reference_with_layout(bytes: &[u8], layout: &PageLayout) -> Result<Vec<u8>, String> {
    let (mut width, mut height) = match layout.size.as_str() {
        "a4" => (11906, 16838),
        "letter" => (12240, 15840),
        _ => return Err("invalid size".into()),
    };
    match layout.orientation.as_str() {
        "landscape" => std::mem::swap(&mut width, &mut height),
        "portrait" => (),
        _ => return Err("invalid orientation".into()),
    }
    let size = vec![
        ("w", width.to_string()),
        ("h", height.to_string()),
        ("orient", layout.orientation.clone()),
    ];
    let margins = ["top", "right", "bottom", "left"]
        .into_iter()
        .map(|key| {
            Ok((
                key,
                margin_twips(layout.margins.get(key).ok_or("missing margin")?)?,
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut source = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut output = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let mut found_document = false;
    for index in 0..source.len() {
        let mut entry = source.by_index(index).map_err(|e| e.to_string())?;
        if entry.name() != "word/document.xml" {
            output.raw_copy_file(entry).map_err(|e| e.to_string())?;
            continue;
        }
        found_document = true;
        let mut xml = Vec::new();
        entry.read_to_end(&mut xml).map_err(|e| e.to_string())?;
        let xml = document_with_layout(&xml, &size, &margins)?;
        output
            .start_file(
                "word/document.xml",
                zip::write::SimpleFileOptions::default().compression_method(entry.compression()),
            )
            .map_err(|e| e.to_string())?;
        output.write_all(&xml).map_err(|e| e.to_string())?;
    }
    if !found_document {
        return Err("missing document".into());
    }
    Ok(output.finish().map_err(|e| e.to_string())?.into_inner())
}

fn new_page_element(name: &str, attrs: &[(&str, String)]) -> Event<'static> {
    let mut element = BytesStart::new(format!("mdpage:{name}"));
    element.push_attribute(("xmlns:mdpage", std::str::from_utf8(WORD_NS).unwrap()));
    for (key, value) in attrs {
        element.push_attribute((format!("mdpage:{key}").as_str(), value.as_str()));
    }
    Event::Empty(element)
}

fn update_page_element(
    reader: &NsReader<&[u8]>,
    element: &BytesStart<'_>,
    attrs: &[(&str, String)],
) -> Result<BytesStart<'static>, String> {
    let mut changed = element.to_owned();
    changed.clear_attributes();
    for attr in element.attributes() {
        let attr = attr.map_err(|e| e.to_string())?;
        let (namespace, local) = reader.resolve_attribute(attr.key);
        if matches!(namespace, ResolveResult::Bound(ns) if ns.as_ref() == WORD_NS)
            && attrs
                .iter()
                .any(|(key, _)| local.as_ref() == key.as_bytes())
        {
            continue;
        }
        changed.push_attribute(attr);
    }
    // Attributes cannot use the default namespace. Reuse a Word binding or declare
    // an unused prefix, preserving any local or inherited non-Word bindings.
    let name = std::str::from_utf8(element.name().as_ref())
        .map_err(|e| e.to_string())?
        .to_string();
    let prefix = if let Some((prefix, _)) = name.rsplit_once(':') {
        prefix.to_string()
    } else {
        let mut index = 0;
        loop {
            let prefix = if index == 0 {
                "w".to_string()
            } else {
                format!("mdpage{index}")
            };
            let qualified = format!("{prefix}:value");
            match reader.resolve_attribute(QName(qualified.as_bytes())).0 {
                ResolveResult::Bound(ns) if ns.as_ref() == WORD_NS => break prefix,
                ResolveResult::Unknown(_) | ResolveResult::Unbound => {
                    changed.push_attribute((
                        format!("xmlns:{prefix}").as_str(),
                        std::str::from_utf8(WORD_NS).unwrap(),
                    ));
                    break prefix;
                }
                _ => index += 1,
            }
        }
    };
    for (key, value) in attrs {
        changed.push_attribute((format!("{prefix}:{key}").as_str(), value.as_str()));
    }
    Ok(changed)
}

fn document_with_layout(
    xml: &[u8],
    size: &[(&str, String)],
    margins: &[(&str, String)],
) -> Result<Vec<u8>, String> {
    struct Section {
        depth: usize,
        children: Vec<(usize, Vec<u8>)>,
    }
    let mut reader = NsReader::from_reader(xml);
    let mut events = Vec::new();
    let mut sections: Vec<Section> = Vec::new();
    let mut insertions: std::collections::BTreeMap<usize, Vec<Event<'static>>> =
        std::collections::BTreeMap::new();
    let mut depth = 0;
    let mut found_section = false;
    loop {
        let event = reader.read_event().map_err(|e| e.to_string())?;
        let event = match event {
            Event::Start(ref element) | Event::Empty(ref element) => {
                let is_word = matches!(reader.resolve_element(element.name()).0, ResolveResult::Bound(ns) if ns.as_ref() == WORD_NS);
                let local = element.local_name().as_ref().to_vec();
                let direct_child = sections
                    .last()
                    .is_some_and(|section| section.depth == depth);
                if direct_child {
                    sections.last_mut().unwrap().children.push((
                        events.len(),
                        if is_word { local.clone() } else { Vec::new() },
                    ));
                }
                if is_word && local == b"sectPr" {
                    found_section = true;
                    if matches!(event, Event::Empty(_)) {
                        events.push(Event::Start(element.to_owned()));
                        events.push(new_page_element("pgSz", size));
                        events.push(new_page_element("pgMar", margins));
                        events.push(Event::End(element.to_end().into_owned()));
                        continue;
                    }
                    sections.push(Section {
                        depth: depth + 1,
                        children: Vec::new(),
                    });
                }
                let changed =
                    if direct_child && is_word && matches!(local.as_slice(), b"pgSz" | b"pgMar") {
                        update_page_element(
                            &reader,
                            element,
                            if local == b"pgSz" { size } else { margins },
                        )?
                    } else {
                        element.to_owned()
                    };
                if matches!(event, Event::Start(_)) {
                    depth += 1;
                    Event::Start(changed)
                } else {
                    Event::Empty(changed)
                }
            }
            Event::End(element) => {
                if sections
                    .last()
                    .is_some_and(|section| section.depth == depth)
                {
                    let section = sections.pop().unwrap();
                    // Insert at section-property schema positions, after header/footer,
                    // footnote/endnote and type, but before columns and later properties.
                    for (name, attrs) in
                        [(b"pgSz".as_slice(), size), (b"pgMar".as_slice(), margins)]
                    {
                        if section.children.iter().any(|(_, local)| local == name) {
                            continue;
                        }
                        let index = section
                            .children
                            .iter()
                            .find(|(_, local)| {
                                !matches!(
                                    local.as_slice(),
                                    b"headerReference"
                                        | b"footerReference"
                                        | b"footnotePr"
                                        | b"endnotePr"
                                        | b"type"
                                ) && !(name == b"pgMar" && local == b"pgSz")
                            })
                            .map(|(index, _)| *index)
                            .unwrap_or(events.len());
                        insertions
                            .entry(index)
                            .or_default()
                            .push(new_page_element(std::str::from_utf8(name).unwrap(), attrs));
                    }
                }
                depth = depth.checked_sub(1).ok_or("invalid XML depth")?;
                Event::End(element.into_owned())
            }
            Event::Eof => break,
            other => other.into_owned(),
        };
        events.push(event);
    }
    if !found_section || !sections.is_empty() || depth != 0 {
        return Err("missing or incomplete section properties".into());
    }
    let mut writer = Writer::new(Vec::new());
    for (index, event) in events.into_iter().enumerate() {
        if let Some(additions) = insertions.remove(&index) {
            for addition in additions {
                writer.write_event(addition).map_err(|e| e.to_string())?;
            }
        }
        writer.write_event(event).map_err(|e| e.to_string())?;
    }
    Ok(writer.into_inner())
}

fn absolutize_path(path: &str, current_directory: &Path) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("export.docxFailed".to_string());
    }

    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(current_directory.join(path))
    }
}

fn markdown_parent(markdown_path: &Path) -> Result<PathBuf, String> {
    markdown_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| "export.docxFailed".to_string())
}

fn path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|path| path.to_string())
        .ok_or_else(|| "export.docxFailed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zip_part(bytes: &[u8], name: &str) -> Vec<u8> {
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut result = Vec::new();
        zip.by_name(name).unwrap().read_to_end(&mut result).unwrap();
        result
    }

    fn attribute(xml: &[u8], element: &[u8], attribute: &[u8]) -> Option<String> {
        let mut reader = NsReader::from_reader(xml);
        loop {
            match reader.read_event().unwrap() {
                Event::Empty(e) | Event::Start(e) if e.local_name().as_ref() == element => {
                    return e
                        .attributes()
                        .map(Result::unwrap)
                        .find(|a| a.key.local_name().as_ref() == attribute)
                        .map(|a| a.unescape_value().unwrap().into_owned());
                }
                Event::Eof => return None,
                _ => (),
            }
        }
    }

    fn landscape() -> PageLayout {
        serde_json::from_value(serde_json::json!({
            "size": "letter", "orientation": "landscape",
            "margins": { "top": "1in", "right": "2cm", "bottom": "18mm", "left": "12pt" }
        }))
        .unwrap()
    }

    fn reference_xml(xml: &str) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(xml.as_bytes()).unwrap();
        zip.finish().unwrap().into_inner()
    }

    fn section_page_nodes(xml: &[u8]) -> Vec<Vec<String>> {
        let mut reader = NsReader::from_reader(xml);
        let mut sections = Vec::new();
        loop {
            match reader.read_event().unwrap() {
                Event::Start(e) | Event::Empty(e) => {
                    // Attribute iteration checks duplicate declarations as well as normal attributes.
                    for attr in e.attributes() {
                        attr.unwrap();
                    }
                    match e.local_name().as_ref() {
                        b"sectPr" => sections.push(Vec::new()),
                        b"pgSz" | b"pgMar" => {
                            assert!(
                                matches!(reader.resolve_element(e.name()).0, ResolveResult::Bound(ns) if ns.as_ref() == WORD_NS)
                            );
                            let key = if e.local_name().as_ref() == b"pgSz" {
                                b"w".as_slice()
                            } else {
                                b"top".as_slice()
                            };
                            let expected = if key == b"w" { "15840" } else { "1440" };
                            let attr = e.attributes().map(Result::unwrap).find(|a| {
                                let (namespace, local) = reader.resolve_attribute(a.key);
                                matches!(namespace, ResolveResult::Bound(ns) if ns.as_ref() == WORD_NS) && local.as_ref() == key
                            }).unwrap();
                            assert_eq!(attr.unescape_value().unwrap(), expected);
                            sections
                                .last_mut()
                                .unwrap()
                                .push(String::from_utf8(e.local_name().as_ref().to_vec()).unwrap());
                        }
                        _ => (),
                    }
                }
                Event::Eof => break,
                _ => (),
            }
        }
        sections
    }

    #[test]
    fn fills_page_geometry_in_every_section_including_empty_sections() {
        let xml = r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
            <w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/><w:pgMar w:top="1"/></w:sectPr></w:pPr></w:p>
            <w:p><w:pPr><w:sectPr><w:pgMar w:top="1"/><w:cols/></w:sectPr></w:pPr></w:p>
            <w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/><w:cols/></w:sectPr></w:pPr></w:p>
            <w:p><w:pPr><w:sectPr><w:headerReference/><w:type/><w:cols/></w:sectPr></w:pPr></w:p>
            <w:sectPr/>
        </w:body></w:document>"#;
        let output = reference_with_layout(&reference_xml(xml), &landscape()).unwrap();
        let xml = zip_part(&output, "word/document.xml");
        assert_eq!(section_page_nodes(&xml), vec![vec!["pgSz", "pgMar"]; 5]);
    }

    #[test]
    fn fills_geometry_when_no_section_has_page_nodes() {
        let xml = r#"<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body><sectPr></sectPr></body></document>"#;
        let output = reference_with_layout(&reference_xml(xml), &landscape()).unwrap();
        assert_eq!(
            section_page_nodes(&zip_part(&output, "word/document.xml")),
            vec![vec!["pgSz", "pgMar"]]
        );
    }

    #[test]
    fn inserts_page_nodes_after_section_headers_and_before_columns() {
        let xml = r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr><w:headerReference/><w:footerReference/><w:footnotePr><w:numRestart/></w:footnotePr><w:endnotePr/><w:type/><w:cols/><w:docGrid/></w:sectPr></w:body></w:document>"#;
        let output = reference_with_layout(&reference_xml(xml), &landscape()).unwrap();
        let xml = zip_part(&output, "word/document.xml");
        let mut reader = NsReader::from_reader(xml.as_slice());
        let mut names = Vec::new();
        loop {
            match reader.read_event().unwrap() {
                Event::Start(e) | Event::Empty(e) => {
                    names.push(String::from_utf8(e.local_name().as_ref().to_vec()).unwrap())
                }
                Event::Eof => break,
                _ => (),
            }
        }
        assert_eq!(
            names,
            [
                "document",
                "body",
                "sectPr",
                "headerReference",
                "footerReference",
                "footnotePr",
                "numRestart",
                "endnotePr",
                "type",
                "pgSz",
                "pgMar",
                "cols",
                "docGrid"
            ]
        );
    }

    #[test]
    fn unprefixed_page_nodes_do_not_duplicate_or_rebind_namespace_declarations() {
        for declaration in [
            "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"",
            "xmlns:w=\"urn:custom\" w:custom=\"preserved\"",
            "xmlns:w=\"urn:custom\" xmlns:mdpage1=\"urn:other\" w:custom=\"preserved\"",
        ] {
            let xml = format!(
                r#"<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body><sectPr><pgSz {declaration}/><pgMar {declaration}/></sectPr></body></document>"#
            );
            let output = reference_with_layout(&reference_xml(&xml), &landscape()).unwrap();
            assert_eq!(
                section_page_nodes(&zip_part(&output, "word/document.xml")),
                vec![vec!["pgSz", "pgMar"]]
            );
            if declaration.contains("urn:custom") {
                let xml = zip_part(&output, "word/document.xml");
                let mut reader = NsReader::from_reader(xml.as_slice());
                let mut preserved = 0;
                loop {
                    match reader.read_event().unwrap() {
                        Event::Start(e) | Event::Empty(e) => {
                            for attr in e.attributes().map(Result::unwrap) {
                                if attr.key.as_ref() == b"w:custom" {
                                    assert!(
                                        matches!(reader.resolve_attribute(attr.key).0, ResolveResult::Bound(ns) if ns.as_ref() == b"urn:custom")
                                    );
                                    assert_eq!(attr.unescape_value().unwrap(), "preserved");
                                    preserved += 1;
                                }
                            }
                        }
                        Event::Eof => break,
                        _ => (),
                    }
                }
                assert_eq!(preserved, 2);
            }
        }
    }

    #[test]
    fn page_geometry_is_applied_without_changing_template_styles() {
        for source in [DAILY_REFERENCE, FORMAL_REFERENCE] {
            let result = reference_with_layout(source, &landscape()).unwrap();
            assert_eq!(
                zip_part(source, "word/styles.xml"),
                zip_part(&result, "word/styles.xml")
            );
            let xml = zip_part(&result, "word/document.xml");
            for (element, key, expected) in [
                (b"pgSz".as_slice(), b"w".as_slice(), "15840"),
                (b"pgSz", b"h", "12240"),
                (b"pgSz", b"orient", "landscape"),
                (b"pgMar", b"top", "1440"),
                (b"pgMar", b"right", "1134"),
                (b"pgMar", b"bottom", "1020"),
                (b"pgMar", b"left", "240"),
            ] {
                assert_eq!(attribute(&xml, element, key).as_deref(), Some(expected));
            }
        }
    }

    #[test]
    fn rejects_invalid_page_layout_and_cleans_temporary_reference() {
        for value in ["NaNmm", "-1cm", "1px", "in", "101mm"] {
            assert!(margin_twips(value).is_err());
        }
        let mut layout = landscape();
        layout.size = "unknown".into();
        assert!(reference_with_layout(DAILY_REFERENCE, &layout).is_err());
        let temporary = TemporaryReference::create(DAILY_REFERENCE).unwrap();
        let directory = temporary.0.clone();
        assert!(directory.join("reference.docx").exists());
        drop(temporary);
        assert!(!directory.exists());
    }

    #[test]
    #[ignore = "requires installed Pandoc; run explicitly for DOCX acceptance"]
    fn actual_pandoc_exports_daily_formal_and_custom_with_page_geometry() {
        let directory = tempfile::tempdir().unwrap();
        let markdown = directory.path().join("document.md");
        fs::write(&markdown, "# Heading\n\nBody text\n\nSecond paragraph").unwrap();
        let custom = directory.path().join("custom.docx");
        fs::write(&custom, FORMAL_REFERENCE).unwrap();
        for (name, builtin, reference) in [
            ("daily", None, None),
            ("formal", Some(BuiltinTemplate::Formal), None),
            ("custom", None, Some(custom.to_str().unwrap().to_string())),
        ] {
            let output = directory.path().join(format!("export-{name}.docx"));
            export_workspace_to_docx(ExportWorkspaceToDocxInput {
                markdown_path: markdown.to_str().unwrap().into(),
                output_path: output.to_str().unwrap().into(),
                reference_docx: reference,
                builtin_template: builtin,
                page_layout: Some(landscape()),
            })
            .unwrap();
            let bytes = fs::read(output).unwrap();
            let xml = zip_part(&bytes, "word/document.xml");
            assert_eq!(attribute(&xml, b"pgSz", b"w").as_deref(), Some("15840"));
            assert_eq!(attribute(&xml, b"pgMar", b"top").as_deref(), Some("1440"));
            let styles = zip_part(&bytes, "word/styles.xml");
            let source = if name == "daily" {
                DAILY_REFERENCE
            } else {
                FORMAL_REFERENCE
            };
            assert_eq!(
                attribute(&styles, b"sz", b"val"),
                attribute(&zip_part(source, "word/styles.xml"), b"sz", b"val")
            );
        }
        assert_eq!(fs::read(custom).unwrap(), FORMAL_REFERENCE);
    }

    #[test]
    fn deserializes_frontend_camel_case_export_input() {
        let input: ExportWorkspaceToDocxInput = serde_json::from_value(serde_json::json!({
            "markdownPath": "/tmp/workspace/document.md",
            "outputPath": "/tmp/workspace/report.docx",
            "referenceDocx": "/tmp/workspace/reference.docx"
        }))
        .unwrap();

        assert_eq!(input.markdown_path, "/tmp/workspace/document.md");
        assert_eq!(input.output_path, "/tmp/workspace/report.docx");
        assert_eq!(
            input.reference_docx.as_deref(),
            Some("/tmp/workspace/reference.docx")
        );
    }

    #[test]
    fn resolves_export_working_directory_from_markdown_parent() {
        assert_eq!(
            markdown_parent(Path::new("/tmp/workspace/document.md")).unwrap(),
            PathBuf::from("/tmp/workspace")
        );
    }

    #[test]
    fn resolves_relative_export_paths_before_building_pandoc_arguments() {
        let current_directory = Path::new("/tmp/workspace");
        let paths =
            absolutize_export_paths("document.md", "out/report.docx", current_directory).unwrap();

        assert_eq!(
            paths.markdown_path,
            PathBuf::from("/tmp/workspace/document.md")
        );
        assert_eq!(
            paths.output_path,
            PathBuf::from("/tmp/workspace/out/report.docx")
        );
        assert_eq!(paths.working_directory, PathBuf::from("/tmp/workspace"));

        let args = crate::pandoc::args::docx_export_args(
            paths.markdown_path.to_str().unwrap(),
            paths.output_path.to_str().unwrap(),
            None,
        );
        assert_eq!(args[0], "/tmp/workspace/document.md");
        assert_eq!(args[2], "/tmp/workspace/out/report.docx");
    }
}
