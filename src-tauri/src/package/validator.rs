use std::path::{Component, Path};

pub fn is_safe_package_path(path: &str) -> bool {
    if path.trim().is_empty() || path.contains('\\') {
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
        assert!(!is_safe_package_path("C:\\\\secret.txt"));
        assert!(!is_safe_package_path("assets/../../secret.txt"));
    }
}
