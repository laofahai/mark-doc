# MarkDoc Package v1

A `.mdoc` file is an ordinary ZIP package. The package is identified by
`manifest.json`, not by the filename extension alone.

## Required Files

- `manifest.json`: authoritative package manifest
- `document.md`: default Markdown entry written by MarkDoc

The manifest `entry` field may point to another safe relative Markdown path, but
MarkDoc writes `document.md` by default.

## Stable Paths

MarkDoc writes these stable paths:

- `manifest.json`: required manifest
- `document.md`: default Markdown entry
- `README.md`: optional human/AI orientation hint
- `assets/`: MarkDoc-managed asset files
- `presentation/`: MarkDoc-managed presentation resources

Readers must not hard-code `document.md` as the only possible source. Use
`manifest.entry`. Readers may accept safe relative resource paths outside
`assets/` for compatibility, while MarkDoc normalizes newly managed resources
into `assets/` and `presentation/`.

## Manifest

```json
{
  "format": "markdoc-package",
  "version": 1,
  "entry": "document.md",
  "schema": "https://raw.githubusercontent.com/laofahai/mark-doc/main/schemas/markdoc-package-v1.schema.json",
  "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md",
  "presentation": {
    "page": {
      "size": "a4",
      "orientation": "landscape",
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

`format`, `version`, `entry`, `schema`, and `spec` are required. Unknown
manifest fields should be preserved by tools when practical.

`presentation.page` is optional and stores app-level page layout for editing
and printing. It supports `a4` and `letter` page sizes, `portrait` and
`landscape` orientation, and four explicit CSS-like margins using `mm`, `cm`,
`in`, or `pt`. Plain Markdown remains the semantic source; page layout belongs
in the manifest so Markdown content is not polluted with app-only metadata.

`presentation.screen` and `presentation.print` are optional safe package-relative
`.css` resource paths for future custom styling. Readers must treat them as
declared resources, not as permission to load CSS automatically. MarkDoc
quarantines CSS until the user explicitly trusts the document or enables that
style layer. `presentation.docxReference` is an optional safe package-relative
`.docx` template resource for export; remote references and non-DOCX paths are
quarantined.

## Reading Order For Tools And AI

1. Unzip the `.mdoc` file.
2. Read and validate `manifest.json`.
3. Use `manifest.schema` for the machine-readable contract.
4. Use `manifest.spec` for this human-readable format guide.
5. Read `manifest.entry`, normally `document.md`, as the canonical semantic
   source.

A packaged `README.md` may be present to help humans and AI tools orient
themselves. It is explanatory only. The manifest is the source of truth.

## Paths

Package paths are UTF-8 relative paths using `/` separators. Readers must reject
absolute paths, drive-prefix paths, backslashes, and `..` traversal.

## Resources

Assets and presentation resources are referenced from Markdown or manifest
fields with package-relative paths. Remote resources are not trusted by default.
Importers should quarantine active or high-risk resources such as CSS, SVG, and
remote or invalid DOCX references until the user explicitly trusts them.

If `manifest.entry` is missing, the package cannot be opened normally. If a
manifest presentation resource such as `presentation.screen`,
`presentation.print`, or
`presentation.docxReference` is missing, readers should report an integrity
warning and still open the Markdown entry when it is present. Writers must not
create a new package whose manifest points at resources that are not included.
`presentation.page` does not point at a resource and should be ignored by older
readers that do not understand it.

Implementations should enforce resource limits before extracting or writing a
package. A package that exceeds entry-count, single-resource, or total
uncompressed-size limits should be rejected as unsafe to process rather than
treated as a recoverable content error.
