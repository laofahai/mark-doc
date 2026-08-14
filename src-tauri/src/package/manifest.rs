use serde::{Deserialize, Serialize};

pub const MARKDOC_PACKAGE_SCHEMA: &str =
    "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json";
pub const MARKDOC_PACKAGE_SPEC: &str =
    "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarkDocManifest {
    pub format: String,
    pub version: u32,
    pub entry: String,
    pub schema: String,
    pub spec: String,
    #[serde(rename = "createdBy", default)]
    pub created_by: Option<ManifestCreatedBy>,
    #[serde(default)]
    pub presentation: Option<ManifestPresentation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestCreatedBy {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestPresentation {
    #[serde(default)]
    pub print: Option<String>,
    #[serde(rename = "docxReference", default)]
    pub docx_reference: Option<String>,
}

impl MarkDocManifest {
    pub fn new(entry: impl Into<String>) -> Self {
        Self {
            format: "markdoc-package".to_string(),
            version: 1,
            entry: entry.into(),
            schema: MARKDOC_PACKAGE_SCHEMA.to_string(),
            spec: MARKDOC_PACKAGE_SPEC.to_string(),
            created_by: Some(ManifestCreatedBy {
                name: "MarkDoc".to_string(),
            }),
            presentation: None,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.format != "markdoc-package" {
            return Err("package.invalidManifest".to_string());
        }
        if self.version != 1 {
            return Err("package.unsupportedVersion".to_string());
        }
        if !crate::package::validator::is_safe_package_path(&self.entry) {
            return Err("package.unsafePath".to_string());
        }
        if self.schema != MARKDOC_PACKAGE_SCHEMA || self.spec != MARKDOC_PACKAGE_SPEC {
            return Err("package.invalidManifest".to_string());
        }
        Ok(())
    }
}
