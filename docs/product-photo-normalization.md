# Product photo normalization

`normalizeProductPhoto` converts an already-buffered product image into a bounded, metadata-free static WebP. It is the codec boundary for a future trusted upload flow; it does not authenticate callers, write to Storage, or make a route safe by itself.

## Use

```ts
import { normalizeProductPhoto } from "../lib/product-photo-normalizer.ts";

const photo = await normalizeProductPhoto(imageBytes);
// photo.buffer, photo.contentType, photo.width, photo.height, photo.bytes
```

Pass actual file bytes as a `Uint8Array` or `Buffer`. Do not use a client-provided MIME type as evidence of the decoded format. The helper accepts JPEG, PNG, and static WebP only and throws `PhotoNormalizationError`; callers should branch on its stable `code`, not expose decoder details.

## Output and bounded optimization

| Concern | Behavior |
|---|---|
| Stored encoding | Static `image/webp`; effort 6 |
| Dimensions | Auto-orient first; longest side at most 1200 px; preserve aspect ratio; no crop or enlargement |
| Color and metadata | Convert to sRGB, preserve alpha, omit source metadata such as EXIF/GPS, XMP, and ICC profiles |
| Canonical result | Encode quality 80 WebP at canonical dimensions; return it immediately when it fits within 409,600 bytes |
| Size fallback | Only when quality 80 exceeds 409,600 bytes: try quality 75 at canonical dimensions, then quality 75 at up to 1024 px and 800 px largest sides |
| Lossless | Not compared; its extra native pass could delay or prevent returning an already-fitting canonical result |
| Quality floor | Never encode below quality 75; never shrink below `min(800, oriented input longest side)`; skip repeated dimensions |
| Hard cap | Throw `output_too_large` if no bounded candidate fits; never return an over-cap result |

The 150–250 KiB range is an optimization aim, not a promise or a minimum. If all bounded candidates exceed the hard cap, callers must reject the image rather than retry indefinitely or lower quality further.

## Input and processing limits

- Buffered input: nonempty and at most 4 MiB.
- Decoded source: at most 16,000,000 pixels and at most 16,384 px on either source side; animations and malformed inputs are rejected.
- Active work: at most two jobs in this Node process; additional work fails immediately with `processing_busy` instead of queueing.
- Raster decoding and encoding request Sharp's native timeout with a maximum of five seconds per pass; stage checks use a ten-second local budget. These are best-effort local limits, not a distributed rate limiter, a hard end-to-end SLA, or protection for every upstream buffering cost.

The decoder applies Sharp's input pixel guard before raster decode, and the implementation checks metadata dimensions before processing. Sharp's metadata worker does not consume the pipeline timeout option: metadata reading has no native deadline, although a local budget check runs after it completes. Native pipeline timeout relies on evaluation progress and excludes libuv worker waiting. The local budget is checked at stage boundaries, but successful encoding returns have no post-await budget assertion. Consequently, neither timeout setting guarantees a ten-second wall-clock return or cancels work merely because a caller stops waiting. Keep upstream request/body limits in any future upload route as a separate defense.

## Stable errors

| Code | Meaning |
|---|---|
| `invalid_input` | Empty, malformed, or undecodable bytes |
| `unsupported_format` | Input is not JPEG, PNG, or WebP |
| `unsupported_animation` | Multi-frame image input |
| `input_too_large` | Buffered bytes exceed 4 MiB |
| `image_too_large` | Source pixel or side limit exceeded |
| `processing_busy` | Both process-local slots are occupied |
| `processing_timeout` | Recognized Sharp/libvips timeout or elapsed local processing budget |
| `output_too_large` | No allowed encoding candidate meets 409,600 bytes |
| `processing_failed` | Other safe processing failure |

Error messages are generic by design. Do not log or return raw Sharp/libvips errors or image metadata to clients.

## Verification boundary

The deterministic codec tests use generated in-memory fixtures and actual Sharp decoding/encoding. They verify dimensions, supported formats, orientation, metadata removal, representative synthetic palette colors, semitransparent alpha, malformed and oversized rejection, and bounded compression behavior. A synthetic 800×800 seeded-noise PNG normalized below the cap, so the `output_too_large` branch is not proven by a passing fixture. Earlier 700×700 and 668×668 dense-alpha probes ended as `processing_timeout`, not cap rejection; they were not retried. The one additional 800×800 seeded-RGB plus binary-alpha candidate (2,267,921-byte PNG) ended as `processing_failed` after 6.085 seconds, not cap rejection; no further cap probes were run. Native timeout classification is based on Sharp/libvips timeout errors and elapsed budget checks, but the metadata/decode/encode timeout branches have no focused functional timeout fixture. The `output_too_large` branch and that unexpected native-failure path therefore remain functionally unproven. Synthetic fidelity checks do not establish food-photo quality or readability. No representative food-photo corpus, upload route, Auth/ownership check, SQL policy, Storage HTTP write, browser rendering, or deployment behavior is covered by this encoder unit.
