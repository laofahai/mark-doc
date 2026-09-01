use std::io::{Read, Seek, Write};
use zip::ZipArchive;

pub(crate) const PACKAGE_LIMIT_EXCEEDED: &str = "package.limitExceeded";

#[cfg(not(test))]
pub(crate) const MAX_PACKAGE_ENTRIES: usize = 4096;
#[cfg(test)]
pub(crate) const MAX_PACKAGE_ENTRIES: usize = 16;

#[cfg(not(test))]
pub(crate) const MAX_PACKAGE_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
#[cfg(test)]
pub(crate) const MAX_PACKAGE_ENTRY_BYTES: u64 = 1024;

#[cfg(not(test))]
pub(crate) const MAX_PACKAGE_UNCOMPRESSED_BYTES: u64 = 1024 * 1024 * 1024;
#[cfg(test)]
pub(crate) const MAX_PACKAGE_UNCOMPRESSED_BYTES: u64 = 4096;

pub(crate) fn ensure_package_entry_count(count: usize) -> Result<(), String> {
    if count > MAX_PACKAGE_ENTRIES {
        return Err(PACKAGE_LIMIT_EXCEEDED.to_string());
    }
    Ok(())
}

pub(crate) fn ensure_package_entry_size(bytes: u64) -> Result<(), String> {
    if bytes > MAX_PACKAGE_ENTRY_BYTES {
        return Err(PACKAGE_LIMIT_EXCEEDED.to_string());
    }
    Ok(())
}

pub(crate) fn track_package_bytes(total: &mut u64, bytes: u64) -> Result<(), String> {
    ensure_package_entry_size(bytes)?;
    *total = total
        .checked_add(bytes)
        .ok_or_else(|| PACKAGE_LIMIT_EXCEEDED.to_string())?;
    if *total > MAX_PACKAGE_UNCOMPRESSED_BYTES {
        return Err(PACKAGE_LIMIT_EXCEEDED.to_string());
    }
    Ok(())
}

pub(crate) fn validate_archive_budget<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<(), String> {
    ensure_package_entry_count(archive.len())?;
    let mut total = 0;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| "package.corrupted".to_string())?;
        track_package_bytes(&mut total, entry.size())?;
    }
    Ok(())
}

pub(crate) fn read_to_vec_limited<R: Read>(
    reader: R,
    read_error: &str,
) -> Result<Vec<u8>, String> {
    let mut limited = reader.take(MAX_PACKAGE_ENTRY_BYTES + 1);
    let mut bytes = Vec::new();
    limited
        .read_to_end(&mut bytes)
        .map_err(|_| read_error.to_string())?;
    ensure_package_entry_size(bytes.len() as u64)?;
    Ok(bytes)
}

pub(crate) fn copy_limited<R: Read, W: Write>(
    mut reader: R,
    writer: &mut W,
    read_error: &str,
    write_error: &str,
) -> Result<u64, String> {
    let mut copied = 0;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let remaining = (MAX_PACKAGE_ENTRY_BYTES + 1).saturating_sub(copied);
        if remaining == 0 {
            return Err(PACKAGE_LIMIT_EXCEEDED.to_string());
        }
        let read_len = remaining.min(buffer.len() as u64) as usize;
        let count = reader
            .read(&mut buffer[..read_len])
            .map_err(|_| read_error.to_string())?;
        if count == 0 {
            break;
        }
        copied = copied
            .checked_add(count as u64)
            .ok_or_else(|| PACKAGE_LIMIT_EXCEEDED.to_string())?;
        if copied > MAX_PACKAGE_ENTRY_BYTES {
            return Err(PACKAGE_LIMIT_EXCEEDED.to_string());
        }
        writer
            .write_all(&buffer[..count])
            .map_err(|_| write_error.to_string())?;
    }
    Ok(copied)
}
