use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarkDocManifest {
    pub format: String,
    pub version: u32,
    pub entry: String,
    #[serde(default)]
    pub presentation: Option<ManifestPresentation>,
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
        Ok(())
    }
}
