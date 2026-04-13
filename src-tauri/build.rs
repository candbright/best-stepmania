fn main() {
    #[cfg(windows)]
    sync_webview2_loader_for_nsis();
    tauri_build::build();
}

/// NSIS 默认只保证打入配置过的资源；GNU 目标还需要 `WebView2Loader.dll` 与 exe 同目录。
/// 从 `webview2-com-sys` 构建产物拷到 `bundle-extra/`，由 `tauri.conf.json > bundle.resources` 打进安装包。
#[cfg(windows)]
fn sync_webview2_loader_for_nsis() {
    use std::path::{Path, PathBuf};

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let Some(target_dir) = out_dir.ancestors().nth(3).map(Path::to_path_buf) else {
        return;
    };

    let subdir = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x64",
        Ok("x86") => "x86",
        Ok("aarch64") => "arm64",
        _ => "x64",
    };

    let Some(loader_src) = find_webview2_loader_dll(&target_dir, subdir) else {
        println!(
            "cargo:warning=WebView2Loader.dll not found under {}; NSIS bundle may be incomplete",
            target_dir.join("build").display()
        );
        return;
    };

    let extra_dir = manifest_dir.join("bundle-extra");
    if let Err(e) = std::fs::create_dir_all(&extra_dir) {
        println!(
            "cargo:warning=failed to create {}: {}",
            extra_dir.display(),
            e
        );
        return;
    }
    let bundle_dest = extra_dir.join("WebView2Loader.dll");
    if let Err(e) = std::fs::copy(&loader_src, &bundle_dest) {
        println!(
            "cargo:warning=failed to copy WebView2Loader.dll to {}: {}",
            bundle_dest.display(),
            e
        );
        return;
    }

    #[cfg(target_env = "gnu")]
    {
        let dest = target_dir.join("WebView2Loader.dll");
        if let Err(e) = std::fs::copy(&loader_src, &dest) {
            println!(
                "cargo:warning=failed to copy WebView2Loader.dll next to exe: {}",
                e
            );
        }
    }
}

#[cfg(windows)]
fn find_webview2_loader_dll(
    target_dir: &std::path::Path,
    subdir: &str,
) -> Option<std::path::PathBuf> {
    let build_root = target_dir.join("build");
    let entries = std::fs::read_dir(&build_root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.starts_with("webview2-com-sys-") {
            continue;
        }
        let loader = path.join("out").join(subdir).join("WebView2Loader.dll");
        if loader.is_file() {
            return Some(loader);
        }
    }
    None
}
