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

Commit the synchronized version files before tagging. The release workflow
validates the committed version and does not mutate source files while
publishing.

## Required Checks

```bash
pnpm run ci
pnpm test:e2e
```

## GitHub Release Flow

Push a SemVer tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

`.github/workflows/release.yml` builds platform installers with
`tauri-apps/tauri-action`, uploads installers and updater metadata to a draft
GitHub Release. It never publishes the release automatically. The final job
checks that all four updater targets have nonempty binaries, signature files,
and manifest entries pointing to this repository and version. This is a
completeness check, not cryptographic verification or native acceptance.

Manual workflow dispatch accepts an **existing tag**, checks out that tag,
and pins every subsequent build to its resolved commit SHA. Missing tags or
version mismatches fail before packaging. Do not move release tags. Retries
may update a draft but must never overwrite a published release.

Before tagging, commit and push the implementation and these workflows. A local
successful test run is not evidence that GitHub has built the installers.

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, if the signing key has a password

The updater endpoint configured in Tauri is:

```text
https://github.com/laofahai/mark-doc/releases/latest/download/latest.json
```

The release must contain signed updater artifacts and a valid `latest.json`.
The signing private key must match the public key in `src-tauri/tauri.conf.json`.
Keep it in GitHub Actions secrets, never source control, release attachments,
or chat. The workflow fails early when the private key is absent. Do not generate
a replacement key without planning compatibility with installed applications.

## Free Distribution Policy

Do not require a paid Apple Developer membership or Windows signing certificate
for the MVP. macOS builds use `APPLE_SIGNING_IDENTITY: '-'` (ad-hoc signing),
without Apple notarization. Windows builds do not use a publisher certificate.
First-launch security prompts are an expected distribution limitation and must
be documented for testers, not presented as a verified-publisher experience.

The owner approved making `laofahai/mark-doc` public on 2026-09-05, and its
visibility was verified through GitHub. Source, Actions builds and Releases all
use this single repository; no separate release repository or cross-repository
token is needed. Public repositories have free standard runner execution.
Use only standard runners, keep paid overage disabled, and keep artifact/cache
storage within the included allowances.

Published release downloads and the configured updater endpoint are publicly
accessible; draft releases still require maintainer authentication. Never embed
a GitHub token in the desktop app.

## Creating the Free Updater Key

Reuse the existing private key if it exists. Only for initial setup with no
installed users depending on the existing public key, run locally:

```bash
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/markdoc.key
```

Do not use `--force` to replace an existing key. Back up the private key securely.
In the GitHub repository, open **Settings > Secrets and variables > Actions >
New repository secret**. Store the private key file contents as
`TAURI_SIGNING_PRIVATE_KEY`, and its chosen password as
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (omit for an unencrypted key). Copy only the
public `.pub` file content into `plugins.updater.pubkey` in
`src-tauri/tauri.conf.json`. Never send the private key through chat or commit it.
`GITHUB_TOKEN` is supplied by Actions automatically; no personal access token is
needed for releases in the same repository.

## Platform Signing

Updater signatures are not operating-system code signatures. The current
workflow configures updater signing and macOS ad-hoc signing; it does not
configure Developer ID signing/notarization or Windows certificate signing.

- macOS public distribution: configure Apple Developer ID signing and
  notarization before claiming normal first-launch installation. An unsigned
  test build is not equivalent to a notarized installer.
- Windows test distribution: unsigned installers may trigger security warnings.
  Configure Windows signing before claiming a verified publisher.
- Linux: test the actual packages on supported distributions, not just the build.

See the official [Tauri GitHub pipeline guide](https://v2.tauri.app/distribute/pipelines/github/)
and its platform-signing links. No separate update server is needed for the
configured GitHub Releases endpoint.

## MVP Acceptance Gate

Record platform, version, commit SHA and result for each candidate. All items
below are pending until tested on packaged desktop apps, not the dev server:

- Install, launch, close and reopen on each advertised platform/architecture.
- Create and edit plain Markdown; save and reopen without losing content or
  unnecessarily requiring conversion to `.mdoc`.
- Paste an image, save as `.mdoc`, quit, reopen and verify text and image content.
- Resize table columns; save, quit and reopen with widths and content intact.
- Recover an unsaved draft and handle an external file edit without overwriting
  either version silently.
- Import a DOCX with images and check its supported export behavior.
- Open a large document, edit and save from source mode without freezing.
- Print portrait and landscape; verify page content and absence of editor UI.
- Upgrade from an older signed installation: verify download, signature check,
  restart and document preservation. A draft is excluded from the stable
  `releases/latest` endpoint, so test with an explicitly configured candidate
  endpoint/test build. Also verify the production endpoint after publication.

Custom CSS is not an MVP prerequisite and must not be advertised as implemented.
Any content-loss bug blocks publication.

## Publish After Acceptance

After every platform build and the `Verify candidate assets` job succeeds,
finish native acceptance and edit the draft's release notes to describe user
changes and known limitations. Only then publish it from GitHub Releases, or:

```bash
gh release edit v0.1.2 --repo laofahai/mark-doc --draft=false --prerelease=false
```

This is an explicit maintainer action, not part of CI. Publishing makes this
version eligible for the stable updater endpoint. Do not replace published
binaries; fixes receive a new version and tag.
