import sharp from "sharp";

export type PhotoNormalizationErrorCode =
  | "invalid_input"
  | "unsupported_format"
  | "unsupported_animation"
  | "input_too_large"
  | "image_too_large"
  | "processing_busy"
  | "processing_timeout"
  | "output_too_large"
  | "processing_failed";

export class PhotoNormalizationError extends Error {
  readonly code: PhotoNormalizationErrorCode;

  constructor(code: PhotoNormalizationErrorCode) {
    super(photoErrorMessages[code]);
    this.name = "PhotoNormalizationError";
    this.code = code;
  }
}

export interface NormalizedProductPhoto {
  buffer: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
  quality?: number;
  lossless?: boolean;
}

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_SOURCE_SIDE = 16_384;
const MAX_OUTPUT_BYTES = 409_600;
const MAX_SIDE = 1_200;
const MIN_FALLBACK_SIDE = 800;
const MAX_ACTIVE_JOBS = 2;
const TOTAL_BUDGET_MS = 10_000;
const MAX_NATIVE_TIMEOUT_SECONDS = 5;
const MAX_ENCODES = 4;

const photoErrorMessages: Record<PhotoNormalizationErrorCode, string> = {
  invalid_input: "The image input is invalid.",
  unsupported_format: "Only JPEG, PNG, and static WebP images are supported.",
  unsupported_animation: "Animated images are not supported.",
  input_too_large: "The image input exceeds the allowed byte limit.",
  image_too_large: "The image dimensions exceed the allowed limits.",
  processing_busy: "Photo processing is busy; try again shortly.",
  processing_timeout: "Photo processing exceeded its time budget.",
  output_too_large: "The normalized image exceeds the allowed byte limit.",
  processing_failed: "The image could not be safely processed.",
};

let activeJobs = 0;

type AcceptedFormat = "jpeg" | "png" | "webp";

function detectFormat(input: Uint8Array): AcceptedFormat {
  if (
    input.byteLength >= 3 &&
    input[0] === 0xff &&
    input[1] === 0xd8 &&
    input[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    input.byteLength >= 8 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47 &&
    input[4] === 0x0d &&
    input[5] === 0x0a &&
    input[6] === 0x1a &&
    input[7] === 0x0a
  ) {
    return "png";
  }
  if (
    input.byteLength >= 12 &&
    String.fromCharCode(...input.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...input.subarray(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  throw new PhotoNormalizationError("unsupported_format");
}

function nativeTimeoutSeconds(startedAt: number): number {
  const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    throw new PhotoNormalizationError("processing_timeout");
  }
  return Math.max(
    1,
    Math.min(MAX_NATIVE_TIMEOUT_SECONDS, Math.floor(remainingMs / 1_000)),
  );
}

function assertWithinBudget(startedAt: number): void {
  if (Date.now() - startedAt >= TOTAL_BUDGET_MS) {
    throw new PhotoNormalizationError("processing_timeout");
  }
}

function isProcessingTimeout(error: unknown, startedAt: number): boolean {
  return (
    Date.now() - startedAt >= TOTAL_BUDGET_MS ||
    (error instanceof Error && /\btimeout\b/i.test(error.message))
  );
}

interface EncodedCandidate {
  buffer: Buffer;
  width: number;
  height: number;
  quality?: number;
  lossless?: boolean;
}

async function encodeCandidate(
  pixels: Buffer,
  width: number,
  height: number,
  startedAt: number,
  options: { quality?: number; lossless: boolean },
): Promise<EncodedCandidate> {
  const result = await sharp(pixels, {
    raw: { width, height, channels: 4 },
    failOn: "error",
  })
    .webp({
      effort: 6,
      lossless: options.lossless,
      ...(options.quality === undefined ? {} : { quality: options.quality }),
    })
    .timeout({ seconds: nativeTimeoutSeconds(startedAt) })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    ...(options.quality === undefined ? {} : { quality: options.quality }),
    lossless: options.lossless,
  };
}

function resizePixels(
  pixels: Buffer,
  width: number,
  height: number,
  targetSide: number,
  startedAt: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  return sharp(pixels, {
    raw: { width, height, channels: 4 },
    failOn: "error",
  })
    .resize({
      width: targetSide,
      height: targetSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .raw()
    .timeout({ seconds: nativeTimeoutSeconds(startedAt) })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({
      data,
      width: info.width,
      height: info.height,
    }));
}

export async function normalizeProductPhoto(
  input: Uint8Array,
): Promise<NormalizedProductPhoto> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) {
    throw new PhotoNormalizationError("invalid_input");
  }
  if (input.byteLength > MAX_INPUT_BYTES) {
    throw new PhotoNormalizationError("input_too_large");
  }
  if (activeJobs >= MAX_ACTIVE_JOBS) {
    throw new PhotoNormalizationError("processing_busy");
  }
  activeJobs += 1;
  const startedAt = Date.now();

  try {
    const expectedFormat = detectFormat(input);
    const source = Buffer.from(input);
    const sourceImage = sharp(source, {
      failOn: "error",
      limitInputPixels: false,
    }).timeout({ seconds: MAX_NATIVE_TIMEOUT_SECONDS });
    let metadata: sharp.Metadata;
    try {
      metadata = await sourceImage.metadata();
    } catch (error) {
      throw new PhotoNormalizationError(
        isProcessingTimeout(error, startedAt) ? "processing_timeout" : "invalid_input",
      );
    }
    assertWithinBudget(startedAt);

    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw new PhotoNormalizationError("invalid_input");
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new PhotoNormalizationError("unsupported_animation");
    }
    if (
      metadata.width > MAX_SOURCE_SIDE ||
      metadata.height > MAX_SOURCE_SIDE ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      throw new PhotoNormalizationError("image_too_large");
    }

    let decoded: Awaited<ReturnType<ReturnType<typeof sharp>["toBuffer"]>>;
    try {
      decoded = await sharp(source, {
        failOn: "error",
        limitInputPixels: MAX_PIXELS,
      })
        .rotate()
        .resize({
          width: MAX_SIDE,
          height: MAX_SIDE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColourspace("srgb")
        .ensureAlpha()
        .raw()
        .timeout({ seconds: nativeTimeoutSeconds(startedAt) })
        .toBuffer({ resolveWithObject: true });
    } catch (error) {
      throw new PhotoNormalizationError(
        isProcessingTimeout(error, startedAt) ? "processing_timeout" : "invalid_input",
      );
    }
    assertWithinBudget(startedAt);

    const width = decoded.info.width;
    const height = decoded.info.height;
    const orientedLongestSide = Math.max(width, height);
    let encodeCount = 0;

    const addCandidate = async (
      pixels: Buffer,
      candidateWidth: number,
      candidateHeight: number,
      options: { quality?: number; lossless: boolean },
    ): Promise<EncodedCandidate> => {
      assertWithinBudget(startedAt);
      if (encodeCount >= MAX_ENCODES) {
        throw new PhotoNormalizationError("processing_failed");
      }
      encodeCount += 1;
      return encodeCandidate(
        pixels,
        candidateWidth,
        candidateHeight,
        startedAt,
        options,
      );
    };

    const canonical = await addCandidate(decoded.data, width, height, {
      quality: 80,
      lossless: false,
    });
    if (canonical.buffer.byteLength <= MAX_OUTPUT_BYTES) {
      return {
        buffer: canonical.buffer,
        contentType: "image/webp",
        width: canonical.width,
        height: canonical.height,
        bytes: canonical.buffer.byteLength,
        quality: 80,
        lossless: false,
      };
    }

    const fallbackQuality = await addCandidate(decoded.data, width, height, {
      quality: 75,
      lossless: false,
    });
    if (fallbackQuality.buffer.byteLength <= MAX_OUTPUT_BYTES) {
      return {
        buffer: fallbackQuality.buffer,
        contentType: "image/webp",
        width: fallbackQuality.width,
        height: fallbackQuality.height,
        bytes: fallbackQuality.buffer.byteLength,
        quality: 75,
        lossless: false,
      };
    }

    const minimumSide = Math.min(MIN_FALLBACK_SIDE, orientedLongestSide);
    let resizedPixels: Buffer = decoded.data;
    let resizedWidth = width;
    let resizedHeight = height;
    for (const targetSide of [1_024, MIN_FALLBACK_SIDE]) {
      const actualTarget = Math.max(minimumSide, Math.min(targetSide, orientedLongestSide));
      if (actualTarget >= Math.max(resizedWidth, resizedHeight)) {
        continue;
      }
      const resized = await resizePixels(
        decoded.data,
        width,
        height,
        actualTarget,
        startedAt,
      );
      assertWithinBudget(startedAt);
      resizedPixels = resized.data;
      resizedWidth = resized.width;
      resizedHeight = resized.height;
      const candidate = await addCandidate(
        resizedPixels,
        resizedWidth,
        resizedHeight,
        { quality: 75, lossless: false },
      );
      if (candidate.buffer.byteLength <= MAX_OUTPUT_BYTES) {
        return {
          buffer: candidate.buffer,
          contentType: "image/webp",
          width: candidate.width,
          height: candidate.height,
          bytes: candidate.buffer.byteLength,
          quality: 75,
          lossless: false,
        };
      }
    }

    throw new PhotoNormalizationError("output_too_large");
  } catch (error) {
    if (error instanceof PhotoNormalizationError) {
      throw error;
    }
    if (isProcessingTimeout(error, startedAt)) {
      throw new PhotoNormalizationError("processing_timeout");
    }
    throw new PhotoNormalizationError("processing_failed");
  } finally {
    activeJobs -= 1;
  }
}
