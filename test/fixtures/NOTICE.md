# Fixture credits

The upstream samples are from [contentauth/c2pa-rs](https://github.com/contentauth/c2pa-rs), revision `58b9a092882b4dcbdbfe854073a1021d3fcbf9a9`, downloaded October 9, 2026. The SDK is dual-licensed MIT OR Apache-2.0; we redistribute these samples under its MIT option. The exact license is reproduced below.

| Included file | Exact upstream path or derivation |
|---|---|
| `C.jpg` | `sdk/tests/fixtures/C.jpg` |
| `CA.jpg` | `sdk/tests/fixtures/CA.jpg` |
| `video1.mp4` | `sdk/tests/fixtures/video1.mp4` |
| `es256-cert.crt` | `sdk/tests/fixtures/certs/es256.pub`, public certificate only |
| `stripped.jpg` | Derived from `C.jpg` by removing JPEG APP11 segments |
| `corrupt.jpg` | Half of `C.jpg`'s manifest store embedded in a synthetic JPEG |
| `c2pa-derived.png` | `C.jpg`'s unchanged manifest store placed in a synthetic PNG `caBX` chunk |

The PNG derivative tests reading a real signed store from a PNG container. It is **not a valid signed PNG**: the copied manifest's content hash refers to the source JPEG, not the PNG pixels. The only upstream PNG with an embedded store, `sdk/tests/fixtures/exp-test1.png`, is 5,884,439 bytes; its manifest alone is 3,439,689 bytes. It cannot fit the fixture size budget. The other upstream PNGs have no embedded store (one has a remote reference). No validity claim is made about this derivative.

`plain.jpg`, `xmp-ai.jpg`, `xmp-camera.jpg`, `sd.png` and `comfy.png` are original synthetic 1×1 images produced by `scripts/make-fixtures.js`, under this repository's MIT license. All derived and synthetic fixtures regenerate deterministically with that script.

Upstream sanity checks: `make_test_images/src/make_test_images.rs` creates the gradient with `c2pa.created` and `algorithmicMedia`, and applies brightness edits with `c2pa.color_adjustments` and a parent ingredient. `make_test_images/json_manifests_v1/C.json` and `CA.json` describe those same actions and the test certificate organization. Those JSON snapshots name a newer generator version than the checked-in binaries; tests use the binary's observed version, independently confirmed with the official SDK reader. These are test signing credentials, not production identities.

## Upstream MIT license

MIT License

© Copyright 2020 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
