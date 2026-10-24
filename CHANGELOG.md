# Changelog

## Unreleased

### Fixed

- Manifest stores followed by padding inside their container (seen in Truepic MP4 files from the C2PA public test set) were reported as "could not be parsed". The store's own box length now decides where it ends.

## v1 (2026-10-09)

First release: the web page and CLI read C2PA Content Credentials (JPEG, PNG, WebP, MP4/MOV/M4A/HEIC/HEIF/AVIF), IPTC/XMP digital source types and generator metadata, with a compare mode for checking which labels survived an edit.
