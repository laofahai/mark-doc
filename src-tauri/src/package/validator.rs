use std::path::{Component, Path, PathBuf};

pub fn validate_workspace_root(path: &Path) -> Result<(), String> {
    if is_trusted_workspace_root(path) {
        Ok(())
    } else {
        Err("package.unsafePath".to_string())
    }
}

pub fn validate_existing_package_path(path: &Path) -> Result<(), String> {
    validate_host_package_path(path)
}

pub fn validate_package_output_path(path: &Path) -> Result<(), String> {
    validate_host_package_path(path)
}

pub fn is_trusted_workspace_root(path: &Path) -> bool {
    is_safe_host_path(path)
        && trusted_workspace_roots()
            .iter()
            .any(|root| path == root || path.starts_with(root))
}

fn validate_host_package_path(path: &Path) -> Result<(), String> {
    if is_safe_host_path(path) && is_mdoc_host_path(path) {
        Ok(())
    } else {
        Err("package.unsafePath".to_string())
    }
}

fn is_safe_host_path(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {}
            Component::CurDir | Component::ParentDir => return false,
        }
    }

    true
}

fn is_mdoc_host_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("mdoc"))
}

fn trusted_workspace_roots() -> Vec<PathBuf> {
    let roots = vec![
        PathBuf::from("/tmp/markdoc"),
        PathBuf::from("/private/tmp/markdoc"),
        std::env::temp_dir().join("markdoc"),
    ];
    #[cfg(not(test))]
    {
        dedup_roots(roots)
    }
    #[cfg(test)]
    {
        let mut test_roots = roots;
        test_roots.push(std::env::temp_dir());
        dedup_roots(test_roots)
    }
}

fn dedup_roots(mut roots: Vec<PathBuf>) -> Vec<PathBuf> {
    roots.sort();
    roots.dedup();
    roots
}

pub fn is_safe_package_path(path: &str) -> bool {
    if path.trim().is_empty() || path.contains('\\') || is_url_like(path) {
        return false;
    }

    let path = Path::new(path);
    if path.is_absolute() {
        return false;
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
        }
    }

    true
}

pub fn is_url_like(path: &str) -> bool {
    let Some((scheme, _)) = path.split_once(':') else {
        return false;
    };

    !scheme.is_empty()
        && scheme.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphabetic()
                || (index > 0 && matches!(byte, b'0'..=b'9' | b'+' | b'-' | b'.'))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_relative_package_paths() {
        assert!(is_safe_package_path("document.md"));
        assert!(is_safe_package_path("assets/image.png"));
        assert!(is_safe_package_path("presentation/reference.docx"));
    }

    #[test]
    fn rejects_traversal_absolute_and_drive_paths() {
        assert!(!is_safe_package_path("../secret.txt"));
        assert!(!is_safe_package_path("/tmp/secret.txt"));
        assert!(!is_safe_package_path("C:secret.txt"));
        assert!(!is_safe_package_path("C:\\\\secret.txt"));
        assert!(!is_safe_package_path("assets/../../secret.txt"));
    }

    #[test]
    fn identifies_url_like_paths() {
        assert!(is_url_like("https://example.com/image.png"));
        assert!(is_url_like("data:image/png;base64,abc"));
        assert!(!is_url_like("assets/image.png"));
    }

    #[test]
    fn accepts_markdoc_temp_workspace_roots() {
        assert!(is_trusted_workspace_root(Path::new("/tmp/markdoc/save-1")));
        assert!(is_trusted_workspace_root(Path::new(
            "/private/tmp/markdoc/save-1"
        )));
    }

    #[test]
    fn rejects_workspace_roots_outside_markdoc_temp_or_with_traversal() {
        assert!(!is_trusted_workspace_root(Path::new(
            "/Users/alice/Documents"
        )));
        assert!(!is_trusted_workspace_root(Path::new(
            "/tmp/markdoc/../../Users/alice"
        )));
        assert!(!is_trusted_workspace_root(Path::new("markdoc/save-1")));
    }

    #[test]
    fn validates_absolute_mdoc_host_paths() {
        let output = std::env::temp_dir().join("report.mdoc");
        assert!(validate_package_output_path(&output).is_ok());
        assert_eq!(
            validate_package_output_path(Path::new("/Users/alice/report.md")).unwrap_err(),
            "package.unsafePath"
        );
        assert_eq!(
            validate_package_output_path(Path::new("../report.mdoc")).unwrap_err(),
            "package.unsafePath"
        );
    }
}
