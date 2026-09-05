use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const MARKDOC_PACKAGE_SCHEMA: &str =
    "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json";
pub const MARKDOC_PACKAGE_SPEC: &str =
    "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md";
pub const MARKDOC_MANIFEST_PATH: &str = "manifest.json";
pub const MARKDOC_README_PATH: &str = "README.md";

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
    #[serde(flatten, default)]
    pub extensions: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestCreatedBy {
    pub name: String,
    #[serde(flatten, default)]
    pub extensions: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestPresentation {
    #[serde(default)]
    pub print: Option<String>,
    #[serde(rename = "docxReference", default)]
    pub docx_reference: Option<String>,
    #[serde(flatten, default)]
    pub extensions: Map<String, Value>,
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
                extensions: Map::new(),
            }),
            presentation: None,
            extensions: Map::new(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_manifest_extension_fields_when_round_tripping() {
        let manifest_json = r#"{
          "format": "markdoc-package",
          "version": 1,
          "entry": "document.md",
          "schema": "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json",
          "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md",
          "createdBy": { "name": "MarkDoc", "agent": "codex" },
          "presentation": {
            "docxReference": "presentation/reference.docx",
            "theme": "board",
            "page": {
              "size": "a4",
              "orientation": "landscape",
              "margins": { "top": "18mm", "right": "18mm", "bottom": "18mm", "left": "18mm" }
            }
          },
          "x-ai": { "summary": "custom" }
        }"#;

        let manifest: MarkDocManifest = serde_json::from_str(manifest_json).unwrap();

        let serialized = serde_json::to_value(&manifest).unwrap();
        assert_eq!(serialized["x-ai"]["summary"], "custom");
        assert_eq!(serialized["createdBy"]["agent"], "codex");
        assert_eq!(serialized["presentation"]["theme"], "board");
        assert_eq!(
            serialized["presentation"]["page"]["orientation"],
            "landscape"
        );
    }
}
