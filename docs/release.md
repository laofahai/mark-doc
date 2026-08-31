# Release Runbook

This file is for MarkDoc maintainers. The user-facing README intentionally does
not explain release automation, signing secrets, or CI internals.

## Version Source

Keep these versions aligned:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Sync them with:

```bash
pnpm run version:sync v0.1.2
```

## Required Checks

```bash
pnpm run release:check
pnpm test
pnpm run lint
pnpm run build:check
cd src-tauri
cargo test
```

## GitHub Release Flow

Push a SemVer tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

`.github/workflows/release.yml` builds platform installers with
`tauri-apps/tauri-action`, publishes the GitHub Release, and uploads updater
metadata.

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, if the signing key has a password

The updater endpoint configured in Tauri is:

```text
https://github.com/laofahai/mark-doc/releases/latest/download/latest.json
```

The release must contain signed updater artifacts and a valid `latest.json`.
The signing private key must match the public key in `src-tauri/tauri.conf.json`.
