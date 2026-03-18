#!/usr/bin/env bash
# 下载对应平台的 pandoc 二进制到 src-tauri/binaries/
# 用于 Tauri sidecar 打包
set -euo pipefail

PANDOC_VERSION="${PANDOC_VERSION:-3.6.4}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$PROJECT_DIR/src-tauri/binaries"

mkdir -p "$BINARIES_DIR"

# 获取 Rust target triple
if [ -n "${TARGET_TRIPLE:-}" ]; then
  TARGET="$TARGET_TRIPLE"
else
  TARGET="$(rustc -vV | grep host | cut -d' ' -f2)"
fi

echo "==> Pandoc $PANDOC_VERSION for $TARGET"

# 各平台下载包名和解压后的二进制路径（已逐一验证）
#
# macOS arm64:   pandoc-3.6.4-arm64-macOS.zip   → pandoc-3.6.4-arm64/bin/pandoc
# macOS x86_64:  pandoc-3.6.4-x86_64-macOS.zip  → pandoc-3.6.4-x86_64/bin/pandoc
# Linux amd64:   pandoc-3.6.4-linux-amd64.tar.gz → pandoc-3.6.4/bin/pandoc
# Linux arm64:   pandoc-3.6.4-linux-arm64.tar.gz → pandoc-3.6.4/bin/pandoc
# Windows x64:   pandoc-3.6.4-windows-x86_64.zip → pandoc-3.6.4/pandoc.exe
case "$TARGET" in
  aarch64-apple-darwin)
    DOWNLOAD_NAME="pandoc-${PANDOC_VERSION}-arm64-macOS.zip"
    BINARY_PATH="pandoc-${PANDOC_VERSION}-arm64/bin/pandoc"
    ;;
  x86_64-apple-darwin)
    DOWNLOAD_NAME="pandoc-${PANDOC_VERSION}-x86_64-macOS.zip"
    BINARY_PATH="pandoc-${PANDOC_VERSION}-x86_64/bin/pandoc"
    ;;
  x86_64-unknown-linux-gnu)
    DOWNLOAD_NAME="pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz"
    BINARY_PATH="pandoc-${PANDOC_VERSION}/bin/pandoc"
    ;;
  aarch64-unknown-linux-gnu)
    DOWNLOAD_NAME="pandoc-${PANDOC_VERSION}-linux-arm64.tar.gz"
    BINARY_PATH="pandoc-${PANDOC_VERSION}/bin/pandoc"
    ;;
  x86_64-pc-windows-msvc)
    DOWNLOAD_NAME="pandoc-${PANDOC_VERSION}-windows-x86_64.zip"
    BINARY_PATH="pandoc-${PANDOC_VERSION}/pandoc.exe"
    ;;
  *)
    echo "ERROR: Unsupported target: $TARGET (pandoc 不提供该平台二进制)"
    exit 1
    ;;
esac

# sidecar 输出文件名（Tauri 命名规则：name-target_triple[.exe]）
case "$TARGET" in
  *windows*)
    OUTPUT="$BINARIES_DIR/pandoc-$TARGET.exe"
    ;;
  *)
    OUTPUT="$BINARIES_DIR/pandoc-$TARGET"
    ;;
esac

# 已存在则跳过
if [ -f "$OUTPUT" ]; then
  echo "==> Already exists: $OUTPUT ($(ls -lh "$OUTPUT" | awk '{print $5}'))"
  exit 0
fi

DOWNLOAD_URL="https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/${DOWNLOAD_NAME}"
TEMP_DIR="$(mktemp -d)"

cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

echo "==> Downloading $DOWNLOAD_URL"
curl -fsSL -o "$TEMP_DIR/pandoc-archive" "$DOWNLOAD_URL"

echo "==> Extracting..."
cd "$TEMP_DIR"
case "$DOWNLOAD_NAME" in
  *.zip)
    unzip -q pandoc-archive
    ;;
  *.tar.gz)
    tar xzf pandoc-archive
    ;;
esac

if [ ! -f "$BINARY_PATH" ]; then
  echo "ERROR: Expected binary at '$BINARY_PATH' not found"
  echo "Archive contents:"
  ls -R .
  exit 1
fi

echo "==> Installing to $OUTPUT"
cp "$BINARY_PATH" "$OUTPUT"
chmod +x "$OUTPUT"

echo "==> Done! $(ls -lh "$OUTPUT" | awk '{print $5}')"
