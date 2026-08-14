pub fn find_bin(name: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            format!("/opt/homebrew/bin/{}", name),
            format!("/usr/local/bin/{}", name),
            format!("/usr/bin/{}", name),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
        if let Ok(output) = std::process::Command::new("/bin/sh")
            .arg("-l")
            .arg("-c")
            .arg(format!("which {}", name))
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(output) = std::process::Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return path;
                }
            }
        }
    }
    name.to_string()
}
