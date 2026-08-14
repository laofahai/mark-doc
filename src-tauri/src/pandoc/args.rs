pub fn docx_import_args(input_path: &str, media_root: &str) -> Vec<String> {
    vec![
        input_path.to_string(),
        "-t".to_string(),
        "markdown-simple_tables-multiline_tables-grid_tables+pipe_tables-link_attributes-raw_attribute"
            .to_string(),
        "--extract-media".to_string(),
        media_root.to_string(),
        "--wrap=none".to_string(),
    ]
}

pub fn docx_export_args(
    input_md: &str,
    output_docx: &str,
    reference_docx: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        input_md.to_string(),
        "-o".to_string(),
        output_docx.to_string(),
        "--wrap=none".to_string(),
        "--from".to_string(),
        "markdown-implicit_figures+hard_line_breaks".to_string(),
    ];
    if let Some(reference) = reference_docx {
        args.push("--reference-doc".to_string());
        args.push(reference.to_string());
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_args_extract_media_under_the_supplied_assets_root_without_base64_embedding() {
        let args = docx_import_args("/docs/a.docx", "/tmp/workspace/assets");

        assert!(args.contains(&"--extract-media".to_string()));
        assert!(args.contains(&"/tmp/workspace/assets".to_string()));
        assert!(!args.iter().any(|arg| arg.contains("base64")));
    }

    #[test]
    fn export_args_include_reference_docx_when_explicitly_supplied() {
        let args = docx_export_args(
            "/tmp/document.md",
            "/docs/out.docx",
            Some("/tmp/reference.docx"),
        );

        assert!(args.contains(&"--reference-doc".to_string()));
        assert!(args.contains(&"/tmp/reference.docx".to_string()));
    }

    #[test]
    fn export_args_omit_reference_docx_when_not_explicitly_supplied() {
        let args = docx_export_args("/tmp/document.md", "/docs/out.docx", None);

        assert!(!args.iter().any(|arg| arg == "--reference-doc"));
    }
}
