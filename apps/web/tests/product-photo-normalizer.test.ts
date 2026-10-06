import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  normalizeProductPhoto,
  PhotoNormalizationError,
} from "../app/lib/product-photo-normalizer.ts";

const MAX_OUTPUT_BYTES = 409_600;

function seededPixels(width: number, height: number, channels = 3): Buffer {
  let state = 0x12345678;
  const pixels = Buffer.alloc(width * height * channels);
  for (let index = 0; index < pixels.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  return pixels;
}

async function rawImage(
  width: number,
  height: number,
  channels: 3 | 4 = 3,
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      pixels[offset] = (x * 3 + y * 5) & 255;
      pixels[offset + 1] = (x * 7 + y * 2) & 255;
      pixels[offset + 2] = (x * 11 + y * 13) & 255;
      if (channels === 4) pixels[offset + 3] = (x * 17 + y * 19) & 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

function expectPhotoError(
  error: unknown,
  code: string,
): asserts error is PhotoNormalizationError {
  assert.ok(error instanceof PhotoNormalizationError);
  assert.equal(error.code, code);
  assert.equal(error.message.includes("Input buffer"), false);
}

test("returns a fitting canonical quality-80 result without comparing lossless", async () => {
  const solid = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 72, g: 126, b: 184 },
    },
  })
    .png()
    .toBuffer();

  const photo = await normalizeProductPhoto(solid);

  assert.ok(photo.bytes <= MAX_OUTPUT_BYTES);
  assert.equal(photo.quality, 80);
  assert.equal(photo.lossless, false);
  assert.equal(photo.width, 1200);
  assert.equal(photo.height, 900);
});

test("normalizes real JPEG, PNG, and static WebP bytes to bounded decodable WebP", async () => {
  const png = await rawImage(320, 180);
  const jpeg = await sharp(png).jpeg().toBuffer();
  const webp = await sharp(png).webp().toBuffer();

  for (const input of [png, jpeg, webp]) {
    const photo = await normalizeProductPhoto(input);
    assert.equal(photo.contentType, "image/webp");
    assert.equal(photo.bytes, photo.buffer.byteLength);
    assert.ok(photo.bytes > 0 && photo.bytes <= MAX_OUTPUT_BYTES);
    const decoded = await sharp(photo.buffer).raw().toBuffer({
      resolveWithObject: true,
    });
    assert.equal(decoded.info.format, "raw");
    assert.equal(decoded.info.width, photo.width);
    assert.equal(decoded.info.height, photo.height);
    assert.ok(decoded.data.byteLength > 0);
    assert.equal(photo.width, 320);
    assert.equal(photo.height, 180);
  }
});

test("limits dimensions without enlargement or crop and preserves aspect ratio", async () => {
  const small = await normalizeProductPhoto(await rawImage(41, 23));
  assert.equal(small.width, 41);
  assert.equal(small.height, 23);

  const largeInput = await sharp({
    create: {
      width: 1800,
      height: 900,
      channels: 3,
      background: { r: 80, g: 120, b: 160 },
    },
  })
    .png()
    .toBuffer();
  const large = await normalizeProductPhoto(largeInput);
  assert.equal(large.width, 1200);
  assert.equal(large.height, 600);

  const oddInput = await sharp({
    create: {
      width: 1379,
      height: 1000,
      channels: 3,
      background: { r: 90, g: 130, b: 170 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
  const odd = await normalizeProductPhoto(oddInput);
  assert.equal(odd.width, 1200);
  assert.ok(Math.abs(odd.width / odd.height - 1379 / 1000) < 0.002);
});

test("auto-orients before resize, strips metadata, and retains transparency", async () => {
  const orientedInput = await sharp(seededPixels(80, 40), {
    raw: { width: 80, height: 40, channels: 3 },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const oriented = await normalizeProductPhoto(orientedInput);
  assert.equal(oriented.width, 40);
  assert.equal(oriented.height, 80);

  const metadataInput = await sharp(seededPixels(32, 24), {
    raw: { width: 32, height: 24, channels: 3 },
  })
    .withMetadata({ orientation: 1 })
    .jpeg()
    .toBuffer();
  const stripped = await normalizeProductPhoto(metadataInput);
  const metadata = await sharp(stripped.buffer).metadata();
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);

  const rgba = Buffer.alloc(24 * 16 * 4);
  const palette = [
    [220, 45, 35],
    [35, 190, 75],
    [40, 80, 220],
  ];
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const offset = (y * 24 + x) * 4;
      const color = palette[Math.floor(x / 8)];
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = [0, 128, 255][x % 3];
    }
  }
  const alphaPng = await sharp(rgba, {
    raw: { width: 24, height: 16, channels: 4 },
  })
    .png()
    .toBuffer();
  const transparent = await normalizeProductPhoto(alphaPng);
  const roundTrip = await sharp(transparent.buffer)
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (const x of [2, 11, 20]) {
    const offset = (8 * 24 + x) * 4;
    const expected = palette[Math.floor(x / 8)];
    for (let channel = 0; channel < 3; channel += 1) {
      assert.ok(Math.abs(roundTrip[offset + channel] - expected[channel]) <= 12);
    }
    assert.equal(roundTrip[offset + 3], 255);
  }
  assert.equal(roundTrip[(8 * 24 + 0) * 4 + 3], 0);
  assert.equal(roundTrip[(8 * 24 + 1) * 4 + 3], 128);
  assert.equal(roundTrip[(8 * 24 + 2) * 4 + 3], 255);
});

test("rejects invalid, unsupported, animated, oversized, and pixel-bomb inputs with stable errors", async () => {
  await assert.rejects(normalizeProductPhoto(Buffer.alloc(0)), (error) => {
    expectPhotoError(error, "invalid_input");
    return true;
  });
  await assert.rejects(normalizeProductPhoto(Buffer.from("not an image")), (error) => {
    expectPhotoError(error, "unsupported_format");
    return true;
  });

  await assert.rejects(normalizeProductPhoto(Buffer.from("<svg/>")), (error) => {
    expectPhotoError(error, "unsupported_format");
    return true;
  });

  const malformedPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);
  await assert.rejects(normalizeProductPhoto(malformedPng), (error) => {
    expectPhotoError(error, "invalid_input");
    return true;
  });

  const oversized = Buffer.alloc(4 * 1024 * 1024 + 1);
  await assert.rejects(normalizeProductPhoto(oversized), (error) => {
    expectPhotoError(error, "input_too_large");
    return true;
  });

  const tooManyPixels = await sharp({
    create: {
      width: 4001,
      height: 4000,
      channels: 3,
      background: { r: 40, g: 90, b: 130 },
    },
  })
    .jpeg({ quality: 30 })
    .toBuffer();
  await assert.rejects(normalizeProductPhoto(tooManyPixels), (error) => {
    expectPhotoError(error, "image_too_large");
    return true;
  });

  const tooWide = await rawImage(16_385, 1);
  await assert.rejects(normalizeProductPhoto(tooWide), (error) => {
    expectPhotoError(error, "image_too_large");
    return true;
  });

  const animationPixels = Buffer.alloc(8 * 16 * 3);
  animationPixels.fill(255, 0, 8 * 8 * 3);
  const animated = await sharp(animationPixels, {
    raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await assert.rejects(normalizeProductPhoto(animated), (error) => {
    expectPhotoError(error, "unsupported_animation");
    return true;
  });
});

test("uses bounded quality and resolution fallback for high-entropy inputs", async (t) => {
  const noisy = await sharp(seededPixels(1100, 1100), {
    raw: { width: 1100, height: 1100, channels: 3 },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  const optimized = await normalizeProductPhoto(noisy);
  assert.ok(optimized.bytes <= MAX_OUTPUT_BYTES);
  assert.equal(optimized.quality, 75);
  assert.ok(Math.max(optimized.width, optimized.height) <= 1_024);
  assert.ok(Math.max(optimized.width, optimized.height) >= 800);
  t.diagnostic(
    `fallback fixture: input=${noisy.byteLength} bytes, output=${optimized.bytes} bytes, ${optimized.width}x${optimized.height}, quality=${optimized.quality}`,
  );

  const irreducibleNoise = await sharp(seededPixels(800, 800), {
    raw: { width: 800, height: 800, channels: 3 },
  })
    .png()
    .toBuffer();
  const irreducibleResult = await normalizeProductPhoto(irreducibleNoise);
  assert.ok(irreducibleResult.bytes <= MAX_OUTPUT_BYTES);
  t.diagnostic(
    `800x800 PNG fixture: input=${irreducibleNoise.byteLength} bytes, output=${irreducibleResult.bytes} bytes, quality=${irreducibleResult.quality ?? "lossless"}`,
  );
});

test("admits at most two concurrent jobs and releases a slot after failures", async () => {
  const input = await sharp(seededPixels(1200, 1200), {
    raw: { width: 1200, height: 1200, channels: 3 },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  const jobs = [
    normalizeProductPhoto(input),
    normalizeProductPhoto(input),
    normalizeProductPhoto(input),
  ];
  const settled = await Promise.allSettled(jobs);
  const busy = settled.filter(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof PhotoNormalizationError &&
      result.reason.code === "processing_busy",
  );
  assert.equal(busy.length, 1);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 2);

  await assert.rejects(
    normalizeProductPhoto(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
  );
  const afterFailure = await normalizeProductPhoto(await rawImage(40, 30));
  assert.ok(afterFailure.bytes <= MAX_OUTPUT_BYTES);
});
