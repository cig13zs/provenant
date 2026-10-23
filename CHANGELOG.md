# Changelog

## Unreleased

### Added

- Every verdict now comes with a one-line reason, shown under the headline on the page, as `Why:` in the CLI and as `reason` in JSON. It names the field that decided it: the C2PA action and source type, an unsigned XMP value, an ingredient's earlier claim, or the metadata key behind an AI hint.
- A manifest with no actions now says `actions: none` instead of leaving the list blank.

### Fixed

- AI claims made in an ingredient's manifest were ignored, so a file whose active manifest only records a conversion or edit (the shape OpenAI uses for ChatGPT and DALL-E images) read "Has Content Credentials, no AI claim". Provenant now follows the active manifest's ingredient links: an AI "created" claim reached only through parent ingredients gives "Labelled as AI-generated", and an AI component gives "Labelled as edited with AI". The c2pa row names the earlier claim and the path to it.
- An edit or placement action whose source type is `trainedAlgorithmicMedia` (Adobe Express with Firefly, for example) now counts as edited with AI instead of no AI claim.
- Manifest stores followed by padding inside their container (seen in Truepic MP4 files from the C2PA public test set) were reported as "could not be parsed". The store's own box length now decides where it ends.

## v1 (2026-10-09)

First release: the web page and CLI read C2PA Content Credentials (JPEG, PNG, WebP, MP4/MOV/M4A/HEIC/HEIF/AVIF), IPTC/XMP digital source types and generator metadata, with a compare mode for checking which labels survived an edit.
