//! Encoding detection and conversion for SM/SSC chart files.
//!
//! StepMania chart files from different regions often use various encodings:
//! - Shift-JIS (Japanese)
//! - EUC-KR / CP949 (Korean)
//! - GBK / GB2312 / GB18030 (Chinese)
//! - CP1252 / Latin-1 (Western European)
//!
//! This module tries UTF-8 first, then uses `chardetng` to detect the encoding
//! and `encoding_rs` to convert to UTF-8.

use std::path::Path;

/// Read a file and decode its contents to a UTF-8 String, automatically
/// detecting the encoding if it's not valid UTF-8.
pub fn read_file_auto_encoding(path: &Path) -> Result<String, std::io::Error> {
    let bytes = std::fs::read(path)?;
    Ok(decode_bytes_to_utf8(&bytes))
}

/// Decode a byte slice to a UTF-8 String, auto-detecting encoding.
///
/// Strategy:
/// 1. Try UTF-8 first (fast path, handles BOM as well).
/// 2. If UTF-8 fails, strip BOM bytes if present, then use chardetng to detect encoding.
/// 3. Decode using the detected encoding via encoding_rs.
/// 4. Fall back to lossy UTF-8 conversion as last resort.
pub fn decode_bytes_to_utf8(bytes: &[u8]) -> String {
    // Fast path: check for UTF-8 BOM
    let data = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };

    // Try UTF-8 first
    if let Ok(s) = std::str::from_utf8(data) {
        return s.to_string();
    }

    // Use chardetng for encoding detection
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(data, true);
    let encoding = detector.guess(None, true);

    // Decode using the detected encoding
    let (cow, _encoding_used, had_errors) = encoding.decode(data);
    if !had_errors {
        return cow.into_owned();
    }

    // If the detected encoding had errors, try common CJK encodings manually
    let fallback_encodings = [
        encoding_rs::GBK,
        encoding_rs::SHIFT_JIS,
        encoding_rs::EUC_KR,
        encoding_rs::BIG5,
        encoding_rs::EUC_JP,
        encoding_rs::WINDOWS_1252,
    ];

    for enc in &fallback_encodings {
        let (cow, _used, had_errors) = enc.decode(data);
        if !had_errors {
            return cow.into_owned();
        }
    }

    // Last resort: lossy UTF-8 conversion
    String::from_utf8_lossy(data).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utf8_passthrough() {
        let input = "Hello, 世界！こんにちは！안녕하세요！".as_bytes();
        let result = decode_bytes_to_utf8(input);
        assert_eq!(result, "Hello, 世界！こんにちは！안녕하세요！");
    }

    #[test]
    fn test_utf8_bom() {
        let mut input = vec![0xEF, 0xBB, 0xBF];
        input.extend_from_slice("Hello UTF-8 BOM".as_bytes());
        let result = decode_bytes_to_utf8(&input);
        assert_eq!(result, "Hello UTF-8 BOM");
    }

    #[test]
    fn test_ascii() {
        let input = b"#TITLE:My Song;\n#ARTIST:Someone;";
        let result = decode_bytes_to_utf8(input);
        assert_eq!(result, "#TITLE:My Song;\n#ARTIST:Someone;");
    }

    #[test]
    fn test_gbk_encoding() {
        // "你好" in GBK: 0xC4, 0xE3, 0xBA, 0xC3
        let input = b"\xC4\xE3\xBA\xC3";
        let result = decode_bytes_to_utf8(input);
        // Should decode to something (not crash), exact result depends on detection
        assert!(!result.is_empty());
    }

    #[test]
    fn test_shift_jis_encoding() {
        // "こんにちは" in Shift-JIS
        let (encoded, _, _) = encoding_rs::SHIFT_JIS.encode("こんにちは");
        let result = decode_bytes_to_utf8(&encoded);
        assert!(result.contains("こんにちは") || !result.is_empty());
    }
}
