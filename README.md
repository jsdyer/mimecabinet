# MIME Cabinet

A local file-reference desk at **https://coolcode.ca/mimecabinet/**. Search media types and extensions, interpret a Content-Type header, or compare a file's extension, browser-reported type, optional HTTP declaration and recognized header pattern.

<!-- coolcode:guide -->
Look up **report.docx**, **image/jpeg** or any extension. Shared extensions can return several media types. Paste a Content-Type value to inspect its parameters. For a local file, **Inspect file header** reads at most 64 KiB and keeps extension, browser type and signature as separate observations. A ZIP header can be compatible with an Office file without proving that subtype. Unknown signatures remain unknown; no file is uploaded or executed. **Save inspection JSON** includes the filename and first 64 bytes, so review it before sharing.
<!-- /coolcode:guide -->

## What it does

- Searches the complete bundled **mime-db 1.54.0** by exact media type, extension, filename or a broader type/extension fragment. It includes every matching record rather than selecting an arbitrary winner for a shared extension.
- Displays known extensions, provenance, typical charset and compressibility. A missing value stays unknown. Compressibility describes typical data; it does not establish whether a response was compressed.
- Interprets a single `Content-Type` value: type, subtype, structured suffix, quoted parameters, duplicate-parameter notes and missing multipart boundary. A header is a declaration, not proof of a file's format.
- Reads a bounded file prefix, checks known header patterns and shows the first 64 bytes as hex. Compares its observations without renaming or altering the original.
- Exports one dated JSON inspection. Nothing is saved automatically.

No account, API key, backend or runtime source API is required. Reference data is packaged with the static application.

## File inspection scope

The default prefix limit is **65,536 bytes**. Even a large file is read through `file.slice(0, limit)`, never entirely for this inspection. It is not previewed, extracted or executed.

Recognized patterns cover PNG, JPEG, GIF, PDF, ZIP, gzip, 7-Zip, RAR, TIFF, ICO, Ogg, FLAC, ID3-tagged audio, WOFF/WOFF2, SQLite, ELF, DOS MZ, WebAssembly, RIFF/WebP/WAVE/AVI, and selected AVIF/HEIC/HEIF ISO-container brands. UTF byte-order marks are reported as encoding evidence only. Generic ISO media brands are reported as containers without guessing a specific MIME type.

These are **header patterns**, not complete validators. A matching short header can be forged or belong to a truncated, damaged or polyglot file. A DOS MZ header alone does not prove a valid Windows PE executable; ID3 alone does not validate audio frames. ZIP covers many formats, including Office documents, EPUB and packages, so compatible declarations remain unverified. Unsupported signatures are not treated as invalid. This is not a malware scanner or a replacement for validating an uploaded file on a server.

## Sources and licensing

- **mime-db 1.54.0**, maintained by jshttp, is bundled at `web/data/mime-db.json` under its MIT licence. Its records draw on IANA, Apache and nginx. The original licence and edition/count metadata are published beside it. [Pinned source](https://github.com/jshttp/mime-db/tree/v1.54.0) · [IANA media types](https://www.iana.org/assignments/media-types/media-types.xhtml).
- Header interpretation follows the type/parameter syntax described by [RFC 9110 §8.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-content-type). This focused parser is not an implementation of every browser recovery rule. JSON guidance follows [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259.html).
- The signature collection is authored for this tool, informed by the [WHATWG MIME Sniffing Standard](https://mimesniff.spec.whatwg.org/) and documented format headers. It deliberately does not claim to reproduce a browser's context-dependent MIME sniffing decisions.

The displayed capture date is when the reference was fetched, not a date when all types were introduced. The app does not automatically update the reference. An ordinary push builds offline from the committed edition.

## Privacy

Queries, Content-Type values, filenames and file bytes stay in this browser tab. Static reference/config files load from this site; the standard CoolCode usage script records tool usage, not these inputs. No inputs are written to browser storage. Reloading closes the workspace.

Inspection JSON contains the supplied filename, size, browser type, optional declared header, recognized pattern, comparisons and **first 64 file bytes** in hexadecimal. It does not contain the remainder of the file. The download is explicit; inspect the report before sharing it.

## Expand or customize

Edit **`web/config.json`**, then push to `main`. **MIME Cabinet · Check and publish** runs the tests and publishes the static app. There is no scheduled refresh and no fixed list of permissible visitor queries.

```json
{
  "label": "My receipt format",
  "query": ".ccreceipt"
}
```

Append this to `presets`; additional shortcuts are rendered automatically. Settings:

| Field | Meaning |
| --- | --- |
| `defaultQuery` | Initial lookup; any valid query. |
| `pageSize` | Results per page, 1–100. |
| `maximumHeaderCharacters` | Pasted header/query length, 100–65,536. |
| `maximumFileHeaderBytes` | Local prefix read, 512–1,048,576 bytes. Increasing this does not add validators. |
| `presets` | Any number of `{ "label": "…", "query": "…" }` shortcuts. |
| `customTypes` | Optional media-type records merged into the bundled reference. |

For a private/custom type, add this under `customTypes`:

```json
"application/vnd.coolcode.receipt": {
  "extensions": ["ccreceipt"],
  "source": "Local convention",
  "compressible": true
}
```

A custom entry does not constitute IANA registration. It overrides a bundled record with the same media type; keep its provenance explicit. Extensions are lowercase without a leading dot. For a new byte pattern, update the documented signature table or structured checks in `web/model.mjs` and add positive, truncated and misleading-file tests.

To update the upstream reference to a deliberately chosen release, replace `web/data/mime-db.json` and its MIT licence from that jshttp release, update `web/data/provenance.json` with the exact version, source URL, retrieval date and actual entry count, then run the checks below. Review new aliases and definitions before publishing. Keep local additions in `customTypes` so an upstream replacement does not erase them. Do not fetch the database during the app build.

## Develop and verify

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

The build writes only static browser assets to `dist/`; do not commit it. GitHub Actions also runs `tests/browser_smoke.py` in Chromium under `/mimecabinet/`, checks real database queries, quoted/header injection handling, a misleadingly named file with a 64 KiB read limit, JSON export and a narrow layout. A failed check prevents deployment.

The app is already initialized. `scripts/init.py` belongs to its original starter and is not needed for ordinary development.
