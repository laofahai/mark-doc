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
  "spec": "https://github.com/laofahai/mark-doc/blob/main/docs/spec/markdoc-package-v1.md"
}
```

`format`, `version`, `entry`, `schema`, and `spec` are required. Unknown
manifest fields should be preserved by tools when practical.

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
DOCX references until the user explicitly trusts them.

If `manifest.entry` is missing, the package cannot be opened normally. If a
manifest presentation resource such as `presentation.print` or
`presentation.docxReference` is missing, readers should report an integrity
warning and still open the Markdown entry when it is present. Writers must not
create a new package whose manifest points at resources that are not included.
