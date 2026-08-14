use std::path::{Component, Path};

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
}
