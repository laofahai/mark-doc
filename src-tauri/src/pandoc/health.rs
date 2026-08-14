use std::process::Command;

pub fn pandoc_version() -> Option<String> {
    let output = Command::new(crate::pandoc::binary::find_bin("pandoc"))
        .arg("--version")
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string(),
    )
}
