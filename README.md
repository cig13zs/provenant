# Provenant

See what AI labels a photo or video carries. Nothing leaves your browser.

[![Ko-fi](https://img.shields.io/badge/Ko--fi-buy_me_a_coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/jju1s)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/cig13zs/provenant/test.yml?style=flat-square&label=tests)](https://github.com/cig13zs/provenant/actions)

Google [opened SynthID Detector to everyone on October 7, 2026](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/synth-id-ai-content/). It checks invisible watermarks through Google's service. Provenant handles the labels we can read locally: Content Credentials, IPTC/XMP and ordinary generator metadata. You can inspect a file without handing it to a server, then choose whether to use an official watermark checker.

Most of the [highest-starred SynthID repositories](https://github.com/search?q=synthid&type=repositories&s=stars&o=desc) focus on removing or bypassing watermarks (checked October 9, 2026). We wanted a reader instead. It reports what the file says, keeps tool hints separate from formal labels, and leaves unknowns as unknowns.

## Use it

Use the [web page](https://cig13zs.github.io/provenant/), or open [`index.html`](index.html) locally. No build step, account or runtime dependencies. Drop in one or more files, or use Compare to check two versions.

With Node 20 or newer:

```bash
node cli.js test/fixtures/C.jpg
node cli.js test/fixtures/C.jpg --json
node cli.js photo.jpg video.mp4 --json
node cli.js compare test/fixtures/C.jpg test/fixtures/stripped.jpg
```

Actual output from the first command:

```text
test/fixtures/C.jpg
Has Content Credentials, no AI claim
  c2pa [found]: Generator: make_test_images/0.33.1 c2pa-rs/0.33.1; signer organization: C2PA Test Signing Cert; signer CN: C2PA Signer; actions: c2pa.created (computer-generated (not AI-trained)); ingredients: 0. Signature not checked here.
  xmp [not found]: IPTC/XMP provenance fields not found.
  meta [not found]: Generator metadata not found.
  watermark [can't check]: Invisible watermarks such as Google SynthID can't be read offline. No public Google SynthID Detector API is documented.
  Check signature: https://contentcredentials.org/verify
  Google SynthID Detector: https://synthid.com
  How to check in Gemini: https://support.google.com/gemini/answer/16722517?hl=en
  Verify OpenAI-made images: https://openai.com/verify
```

The CLI exits 0 after processing a request, including explicit per-file read errors, and 2 for invalid arguments. Single-file JSON is a report object; multiple-file JSON is an array. Compare JSON is a diff object.

## What it checks

| Source | What the reader shows |
|---|---|
| C2PA Content Credentials | Active manifest's generator, signer organization and name, actions, digital source types and ingredient count. JPEG APP11 packets, PNG `caBX`, WebP `C2PA` and BMFF UUID stores in MP4/MOV/M4A/HEIC/HEIF/AVIF. Other embeddings get a limited raw scan. |
| IPTC/XMP | Digital Source Type and CreatorTool in an embedded XMP packet. AI-generated, AI-edited, computer-generated, camera and composite source terms stay distinct. |
| Generator metadata | PNG text, compressed text and international text; EXIF Software and ImageDescription in JPEG, PNG and WebP. Values are shown up to 200 characters. Recognized tool names and generation keys are hints. |
| Invisible watermarks | Always unknown here. Links to [SynthID Detector](https://synthid.com), [Gemini verification help](https://support.google.com/gemini/answer/16722517?hl=en) and [OpenAI's checker](https://openai.com/verify). These services receive a file only if you separately choose to upload it there. |

For an AI label or hint, the page and CLI also link to official YouTube, TikTok and Meta disclosure guidance. That guidance describes platform rules; it is not legal advice.

The shared API works in Node (`require('./provenance')`) and the browser (`window.Provenant`): `inspect(bytes, filename)` returns a report and `compare(beforeReport, afterReport)` returns a diff. Neither function does I/O. Malformed credentials remain marked present, with a parsing error.

## What it can't do

It does not validate C2PA signatures, certificates, timestamps or file hashes. A signer name is read from an embedded certificate, not authenticated here. Even the headline "Signed as a camera capture" describes a claim, not a verified camera origin. Use [Content Credentials Verify](https://contentcredentials.org/verify) for validation.

It cannot read SynthID offline. No public Google SynthID Detector API is documented. OpenAI separately offers a [Content Provenance API](https://developers.openai.com/api/docs/guides/content-provenance) and checker that can read supported SynthID signals in OpenAI-made media; this offline tool does not use that API.

No labels does not mean human-made. Screenshots, re-uploads and many editors strip metadata. Generator hints can be edited or forged, and a tool name alone does not establish that AI created the file. An unsigned XMP camera label is shown as metadata; it does not receive the signed-camera verdict.

The browser reads files up to 1 GB in full. Larger files get separate scans of the first and last 64 MB, with a visible warning: labels in the middle or split across the boundary may be missed. CBOR, JUMBF and compressed metadata have depth and size limits so malformed input cannot expand without bounds. Remote manifests are never fetched.

## Compare mode

Compare the original and an edited or downloaded copy to see which labels survived. Every signal gets a row: kept, changed, stripped, added, or absent (neither file had it). For the included signed JPEG and its stripped copy:

```text
$ node cli.js compare test/fixtures/C.jpg test/fixtures/stripped.jpg
1 of 1 labels were stripped
Signal	Status	Before	After
c2pa	stripped	Generator: make_test_images/0.33.1 c2pa-rs/0.33.1; signer organization: C2PA Test Signing Cert; ...	-
xmp	absent	-	-
meta	absent	-	-
watermark	unknown	-	-
```

Counts cover found labels and metadata. Invisible watermarks always show as unknown, because their survival can't be measured here.

## Privacy

Everything runs in this tab. Open the Network tab and watch: no uploads. The page loads only its local script; there are no fonts, analytics, CDN scripts or remote lookups. File bytes are never sent anywhere, written to local storage, or changed. External links open only when clicked. The CLI reads files locally and prints its results.

## Tests

```bash
node --test
node scripts/make-fixtures.js
```

The suites cover real signed SDK fixtures, each synthetic fixture, verdict priorities, split JPEG packets, active manifests, compressed PNG metadata, EXIF, XMP, CBOR, DER, WebP and BMFF embeddings, comparison, CLI errors, seeded random input and truncated files. The fixture script regenerates synthetic files from the included JPEG source. See [fixture credits and limitations](test/fixtures/NOTICE.md): the derived PNG carries copied manifest bytes for parser coverage and is not a valid signed PNG.

## Support

Free, and it stays free. There is no paid tier. If it was useful, [support Provenant on Ko-fi](https://ko-fi.com/jju1s): ko-fi.com/jju1s.

## License

MIT. Third-party fixtures retain their [own attribution](test/fixtures/NOTICE.md).
