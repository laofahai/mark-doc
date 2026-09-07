# Document Screen And Print Styles

## Status And Scope

This is the target design for document-level custom CSS, not an implementation
report. The verified baseline below describes the inspected source; every
requirement after it describes work still needed. This is one complete design,
with no staged delivery or reduced interim feature contract.

The document owns two independent optional style resources: `screen` for the
editable document page and `print` for desktop printing. Markdown remains the
canonical semantic source. Removing both resources must leave it readable.
Styles never customize the application shell, toolbar, sidebar, or source view.

The scope includes importing, replacing, deleting, authorizing, revoking,
validating, rendering, saving, reopening, and printing these resources. It does
not include remote theme management, a CSS authoring IDE, downloaded fonts,
global user themes, or CSS-to-DOCX conversion. DOCX presentation continues to
use `reference.docx`.

Related contracts:

- [Document workspace architecture](document-workspace.md)
- [Refactor ownership boundaries](refactor-design.md)
- [Editor core architecture](editor-core.md)
- [Package v1 specification](../spec/markdoc-package-v1.md)
- [Actual package v1 schema](../../schemas/markdoc-package-v1.schema.json)

## Verified Baseline And Gaps

| Area | Existing capability | Missing behavior |
| --- | --- | --- |
| Schema and model | The schema declares `presentation.screen/print` as CSS paths; `PresentationConfig` has corresponding optional strings. | No complete runtime style resource or load-state model. |
| Package import | `PackageImporter` keeps the original manifest and quarantine diagnostics. | It only populates page layout and DOCX presentation in `document.presentation`; screen/print declarations are not mapped into that model. |
| Package extraction | Rust `should_quarantine` quarantines every `.css`; normal extraction leaves those bytes in the original archive. | No authorized local CSS read path into the presentation renderer. A quarantine pathname is not an extracted file. |
| Package save | `sourcePackagePath/preservedFiles` can copy safe quarantined entries into the next package. Rust and frontend tests describe this preservation. | No style import/replacement/deletion transaction, resource enumeration, or screen/print manifest synchronization. |
| Security UI | `PackageSecurityPanel` lists local quarantined files; HTTP(S) entries receive remote trust controls. | Local screen/print resources have no enable/revoke controls or active/error status. |
| Security policy | `PackageSecurityPolicy` supports document/type/domain/URL decisions for `canLoadRemote`; Context stores policies per document ID in memory. | These methods do not authorize local package CSS, track content revisions, or revoke a style grant. |
| Editor and print | Tiptap has a DOM remote-resource guard; page layout generates built-in screen/print rules. | No custom style parser, selector confinement, or screen/print loading lifecycle. Printing currently receives page layout only. |
| Dependencies | `package.json` has no directly declared dedicated CSS parser. | A maintained AST parser and selector/value parsing capability must be explicitly selected and declared for implementation. Transitive tooling dependencies are not an application API. |

Evidence is in [model.ts](../../src/services/document/model.ts),
[PackageImporter.ts](../../src/services/importers/PackageImporter.ts),
[reader.rs](../../src-tauri/src/package/reader.rs),
[writer.rs](../../src-tauri/src/package/writer.rs),
[document-service.ts](../../src/services/document/document-service.ts),
[PackageSecurityPanel.tsx](../../src/components/PackageSecurityPanel.tsx),
[PackageSecurityPolicy.ts](../../src/services/security/PackageSecurityPolicy.ts),
[DocumentContext.tsx](../../src/contexts/DocumentContext.tsx),
[resource-security.ts](../../src/editor-core/resource-security.ts), and
[page-layout.ts](../../src/services/document/page-layout.ts).
These observations came from static inspection, not a desktop execution or a
claim that existing tests passed.

## Persisted Contract

Use the existing v1 schema without adding a format version or changing either
style field into an object. A complete example is:

```json
{
  "format": "markdoc-package",
  "version": 1,
  "entry": "document.md",
  "schema": "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json",
  "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md",
  "presentation": {
    "screen": "presentation/screen.css",
    "print": "presentation/print.css",
    "page": {
      "size": "a4",
      "orientation": "portrait",
      "margins": {
        "top": "18mm",
        "right": "18mm",
        "bottom": "18mm",
        "left": "18mm"
      }
    }
  }
}
```

Both style fields are optional strings, not inline CSS, absolute paths, URLs,
or `{ path, enabled }` objects. Omit a field to remove its association; never
write `null` or an empty string. New managed paths use the lowercase `.css`
suffix required by the schema. Readers honor other safe package-relative CSS
paths and the actual `manifest.entry`, including nested Markdown entries.
CSS paths are relative to the package root, not the entry Markdown directory.

Preserve unrelated manifest, presentation, and page extension fields. Preserve
`docxReference` under its existing serialized name; the internal
`presentation.docx.referenceDocx` shape does not change that wire contract.
The schema allows extension properties, but this feature does not use that
allowance to persist trust, digests, runtime IDs, compiled CSS, or enabled flags.

Package import maps declared screen/print paths into `document.presentation`
even when missing, quarantined, or invalid for rendering. Declaration is not
authorization. The original manifest provides unknown-field preservation;
the editable presentation model becomes authoritative for these two fields.

## Ownership And State

Presentation services own CSS resources, parsing, compilation, and serialized
presentation changes. Document commands and Context coordinate transactions,
dirty state, active-document changes, and save snapshots. The native package
layer validates archive access and returns bytes. The editor adapter owns only
mounting and removing already validated styles on its document surface.
Content `AssetManager` does not become the owner of presentation files.

Keep the existing `PresentationConfig.screen/print` path strings. Introduce
separate runtime state per document instance and style slot with:

- Resource identity: slot, package-relative path, immutable content digest,
  and a resource revision used to reject stale asynchronous results.
- Availability: absent, quarantined, available, missing, or read failure.
- Validation: unchecked, checking, valid, or rejected with structured diagnostics.
- Authorization: not granted or granted for that exact slot/path/digest.
- Application: inactive, loading, active, or failed.

These are separate dimensions: a quarantined file can be preserved without
being valid, and a valid resource can remain unauthorized. A missing file
cannot become active by granting trust. Security diagnostics retain provenance;
do not erase the quarantine record merely because rendering was authorized.

Dirty state concerns persisted content only. A runtime grant, revoke, validation
result, or mounted stylesheet never dirties the document. Import, replacement,
or deletion that changes a persisted association or its bytes sets
`dirty.presentation`. Markdown and asset flags retain their own meanings.

## User Commands And Transactions

Expose a document styles surface through the shell/document command layer. It
always has separate Screen and Print rows, including when neither resource
exists. Each row shows its path, status, validation failure when relevant, and
commands appropriate to that state. The security panel links to this surface
for quarantined styles. All user-visible labels and error messages use matching
Chinese and English i18n keys; services return stable codes and parameters.

| Command | Required result |
| --- | --- |
| Import | Select a local CSS file for one empty slot, read a bounded byte snapshot, validate it, then commit the managed resource and association. Display an explicit apply choice; selecting a file alone is not a trust grant. The valid resource may be stored inactive. |
| Replace | Stage and validate new bytes before changing the slot. Validation/read failure or cancellation retains the old bytes, grant, rendering, and dirty state. A successful content change invalidates the old grant and requires an explicit apply choice for the new bytes. |
| Delete | Remove that slot association, cancel pending loads, revoke its grant, and remove its mounted stylesheet immediately. Track resource deletion for the next save; do not delete the selected external source file. |
| Enable | Read and validate the declared resource without rendering, show the local style authorization decision, then grant only the inspected slot/path/digest and mount its compiled result. A failure leaves the resource inactive with a retryable diagnostic. |
| Revoke | Remove the grant and mounted style immediately, cancel in-flight work, and retain the association and original bytes for saving. Re-enabling requires a new decision. |

App-created imports use `presentation/screen.css` or `presentation/print.css`
when free. Resolve collisions deterministically with a filename suffix; never
overwrite an unrelated entry. Two slots may legally reference the same path.
Replacing one shared slot uses a new path so the other keeps its bytes; deleting
one keeps the resource while the other references it.

Delete a managed or explicitly removed style resource from package output only
when no remaining document reference requires it. Retain unrelated entries and
unknown extension data; do not infer unreferenced status for opaque extension
references. Explain retained shared bytes in the UI when needed. Deletion is
not a general orphan-resource cleanup operation.

Importing CSS into a new, Markdown, or imported-DOCX document creates managed
workspace presentation storage and makes `.mdoc` the save target requiring an
explicit path choice. An existing `.md` must not silently receive a manifest or
lose its style change through an in-place Markdown save. An explicit Markdown
export remains content-only, explains that presentation is excluded, and does
not mark the styled workspace saved or discard its CSS.

## Trust And Resource Reading

Local presentation authorization is independent of the existing remote policy.
`trustDocument()`, `allowResourceType('style')`, and remote domain/URL exceptions
must not silently authorize package styles or their dependencies. A document
styles action may authorize both displayed slots, but must enumerate the exact
resources and grants; it is not permission for future or changed bytes.

Grants last for the current open document instance only. Reopen, recovery,
external reload, changed resource bytes, and replacement require fresh grants.
Switching tabs may retain an unchanged instance's grants but must remove its
styles from the active surface. Save As of the same instance may retain grants
for unchanged digests; no grant travels with the resulting package.

Add a bounded native presentation-read operation that resolves a declared slot
from an identified package or its managed workspace. It must validate the
manifest path, archive identity, entry uniqueness, regular-file status, existing
package limits, and canonical workspace containment, including symlink checks.
It must not accept an arbitrary filesystem path from a renderer style request.
It can return quarantined bytes as inert data for inspection; this does not
make them normal assets or permit a webview URL to the original archive.

Validate and render the same byte snapshot, identified by its digest. If the
archive changes while reading or preserving entries, report an external change
instead of combining revisions. A package entry missing from the original
archive is not equivalent to an empty stylesheet. Missing or rejected declared
resources remain visible and may be replaced or deleted.

## CSS Parsing, Isolation, And Network Policy

The supported format is a documented, deliberately bounded CSS subset for
document typography and flow. Arbitrary browser CSS is not promised. Use a
maintained CSS AST parser with selector and value parsing; regex URL scanning,
string prefixing, and post-insertion DOM mutation are not the security boundary.
No unvalidated source is ever attached to a `<style>`, `<link>`, CSSOM, or DOM.

Apply the following policy before emitting any CSS:

1. Decode UTF-8 strictly, allowing a leading BOM. Bound each style to 256 KiB,
   2,000 rules, 20,000 declarations, and nesting depth 8, in addition to existing
   package limits. Reject syntax errors and unknown AST nodes rather than
   partially applying a file. Empty CSS is a valid no-op resource.
2. Accept ordinary style rules only. Reject all at-rules, including `@import`,
   `@font-face`, `@page`, `@property`, `@keyframes`, `@namespace`, `@layer`, and
   source `@media`. Screen/print media wrappers are generated by the application.
3. Parse selector lists and scope every branch to a unique document surface.
   Accept document semantic tag selectors, descendant/child combinators, and
   structural pseudo-classes (`first-child`, `last-child`, `nth-child` with a
   parsed An+B argument). Support `.document` solely as the author-facing alias
   for the content root. Reject other classes, IDs, attributes, sibling
   combinators, pseudo-elements, and other pseudo-classes, including `:has`,
   `:is`, `:not`, `:root`, and `:visited`. Reject `html`, `body`, and application
   chrome targets. Do not expose Tiptap or app class names as a styling API.
4. Allow only document presentation properties: `color`, `background-color`,
   `font-family`, `font-size`, `font-weight`, `font-style`, `line-height`,
   `letter-spacing`, `word-spacing`, `text-align`, `text-indent`,
   `text-decoration-line`, `text-decoration-color`, `text-decoration-style`,
   `text-transform`, `white-space`, `overflow-wrap`, `word-break`, `hyphens`,
   `margin` and its four physical longhands, `padding` and its four physical
   longhands, `border-width`, `border-style`, `border-color`, `border-collapse`,
   `border-spacing`, `vertical-align`, `list-style-type`, `list-style-position`,
   `break-before`, `break-after`, `break-inside`, `orphans`, and `widows`.
   Root rules are restricted to typography and colors; page geometry remains
   application-owned. Validate values against each property's grammar.
5. Reject `!important`, custom properties, `var()`, `env()`, `attr()`, and all
   value functions except parsed `rgb/rgba/hsl/hsla` color functions. Allow
   finite nonnegative lengths using px, pt, em, rem, mm, cm, in, or percent only
   where the property accepts them; reject negative spacing and dimensions.
   Allow unitless numbers only for the property's numeric grammar. Constrain
   oversized values before mounting (font size at most 256px equivalent,
   spacing at most one configured page dimension). Exclude positioning,
   transforms, z-index, display, overflow, opacity, cursor, and generated content.
6. Reject every URL-bearing value or construct after escape decoding, including
   local URLs, fragments, HTTP(S), protocol-relative URLs, data/blob/file URLs,
   `url()` and image functions. Fonts may name locally available font families
   only, with normal system fallback. There is no dependency resolver or network
   exception in this feature, even when remote content is trusted elsewhere.

Validate shorthand expansion and decoded tokens, not just property names.
Emit compiled CSS from the validated AST, never by concatenating source text.
The compiler returns structured diagnostics with source positions and a stable
policy version. Reject the whole file when any rule violates policy; the UI
must not claim that a partially discarded theme was applied successfully.

The content surface excludes editor widgets and chrome from the style target
tree where possible. Its host owns layout, bounds, and screen overflow
containment; source CSS cannot change them. Selector rewriting alone is not
sufficient: the property/value restrictions and host constraints are required
to prevent an element inside the page from covering application controls.

Compile against a unique document instance scope and mount only after validation
and authorization both succeed. Tag every asynchronous operation with document
ID, slot, revision, digest, and policy version. Revoke, replace, delete, tab
switch, close, or unmount invalidates pending mounts and removes owned style
nodes. A stale promise must never restore revoked CSS or affect another tab.
Store original bytes separately from compiled output so package round trips do
not include application-generated scope IDs or media wrappers.

## Screen And Print Priority

`screen` is wrapped in application-generated screen media and never supplies
print defaults. `print` applies only to the active document's print operation.
With no authorized print resource, use built-in print typography and page
layout even if a screen resource is active. Do not silently authorize print
because screen was enabled.

The effective precedence, from strongest to weakest, is:

1. Application safety and page-layout invariants: shell exclusion, print-root
   selection, paper size, orientation, margins, surface containment, and cleanup.
2. Explicit inline semantic formatting from the document, such as marked text
   color or highlighting, for the properties it sets.
3. Authorized CSS for the current medium on permitted content properties.
4. Built-in document typography and defaults for that medium.

The compiler and host restrictions enforce the first boundary; source order
alone cannot do so. Built-in print resets must not blanket-override permitted
custom typography/colors with `!important`. User CSS cannot supply `@page` or
override `presentation.page`. The native print dialog and printer still control
device output, including background printing and physical printable areas;
identical paper output across devices is not promised.

Printing captures the active document, normalized page layout, and authorized
validated print bytes as one snapshot. Wait for an authorized pending style to
finish before opening the dialog. On failure, offer retry or explicit printing
with defaults; never silently omit an expected active style. Unauthorized
styles stay inactive and their status is visible before printing.

Mount print rules for that snapshot, invoke native desktop printing, then remove
them after success, cancellation, exception, or owning surface disposal. Revoke
or document close during preparation cancels preparation. Cleanup is idempotent
and must preserve screen styles and other documents. Test the real Tauri print
lifecycle; browser-only mocks do not establish native cancellation behavior.

## Serialization, Save Safety, And Recovery

Serialize from one document revision containing Markdown, presentation paths,
resource snapshots, and explicit removed-entry tracking. Merge the original
manifest's unknown fields, then set or delete `screen/print` from the current
model; a spread of the original presentation alone would resurrect deletion.
Continue honoring page metadata, DOCX references, and nondefault entry paths.

Build package output as follows:

- New or replaced CSS comes from staged immutable original bytes in managed
  presentation storage and is explicitly included in the workspace file list.
- Unchanged quarantined CSS remains eligible for preservation from the verified
  source archive even if disabled or rejected for rendering. Saving is not trust.
- Exclude deliberately deleted resources from both workspace entries and
  `preservedFiles`, subject to the shared-reference rules above. Workspace bytes
  take precedence over preserved bytes at a replaced path, with no duplicate ZIP
  entry. Do not let the old quarantine list resurrect replaced or deleted CSS.
- Every declared style path must have corresponding output bytes. A missing
  resource blocks a normal save until replaced/deleted; report the error instead
  of silently writing a broken reference or omitting it.

Use the existing temporary-package, validation, backup, and replacement flow.
Do not clear `dirty.presentation` until the save succeeds for the captured
revision. A style edit during saving remains dirty after that save; a save
failure retains the live resources, rendering state, and retryable snapshot.
Advance manifest/file/quarantine baselines only to the revision actually saved.
Save As rebases resource storage and preservation sources after successful
output, without retaining a dependency on the previous source package.

Recovery must retain staged original CSS, associations, and deletion intent
alongside the document draft so that unsaved imported or replaced styles can
be recovered. A recovered draft resets grants and renders only built-in styles
until explicitly enabled. Do not serialize executable/compiled CSS or trust in
the manifest or restore it implicitly from a draft. Recovery integration is a
requirement of this design, not a claim about the current recovery implementation.

## Acceptance Contract

The feature is complete only when the following behaviors are demonstrated:

| Area | Required evidence |
| --- | --- |
| Schema compatibility | Full manifests with screen, print, both, and neither validate against the checked-in v1 schema. Deleted fields are absent, not null. Unknown extensions, page metadata, DOCX references, and nested entries survive save/reopen. |
| Existing package | Declared CSS populates the model but causes no render or network activity on open/recovery. Quarantined and missing resources are distinguishable and actionable. |
| Commands | Import, replace, cancel, failed validation, delete, shared-path replacement/deletion, and filename collisions produce the specified atomic outcomes. External selected files remain unchanged. |
| Trust | Each slot supports enable and revoke; changed digests invalidate grants. Reopen/recovery requires authorization again. Existing remote grants do not bypass local validation or authorize CSS dependencies. |
| Parser | Tests cover syntax errors, escapes, selector lists, unsupported nesting/at-rules, forbidden functions, custom properties, URL variants, important declarations, malformed values, and all resource budgets. Rejected files are never partially mounted. |
| Isolation | Rendered checks show valid typography changes inside the page while shell controls, source mode, widgets, other tabs, and page geometry are unaffected. Stale async completions cannot mount styles after revoke, replace, delete, or close. |
| No implicit network | Observe webview/network requests while importing, inspecting, authorizing, rendering, and printing malicious CSS fixtures. No CSS-triggered request or external file read occurs, including with broader remote trust enabled. |
| Save and dirty state | Style-only edits enable save and close protection. Enable/revoke alone does not dirty. Save failure and concurrent edits retain unsaved state. Original bytes survive round trips; deleted bytes do not reappear via preservation. |
| Portability and recovery | Styled Markdown requires an explicit package save; content-only export does not clear style changes. Saved packages reopen without the original selected CSS file. Unsaved recovered resources return inactive and intact. |
| Print | Independent screen/print styles, built-in fallback, page-layout priority, inline formatting, load errors, cancellation, repeated printing, and cleanup work in the real Tauri desktop application. |
| UX and localization | Both locales cover commands, trust decisions, rejected syntax/policy diagnostics, missing resources, default-print confirmation, and save errors. Keyboard access reaches every operation. |

Implementation verification should include focused frontend service/component
tests, Rust archive/read/write tests, schema validation, lint and build checks,
and actual desktop screen/print acceptance. Browser screenshots and request
checks supplement, but do not replace, desktop evidence. This design document
does not report any of those future implementation checks as passed.
