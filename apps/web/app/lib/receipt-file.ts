import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";

export const RECEIPT_MAX_BYTES = 10_485_760;
export const RECEIPT_MAX_PIXELS = 25_000_000;
export const RECEIPT_MAX_SIDE = 16_384;
export const RECEIPT_MAX_PAGES = 100;

type ReceiptMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
type ReceiptErrorCode = "invalid_file" | "too_large" | "unsupported_type" | "unsupported_animation" | "encrypted_pdf" | "resource_limit" | "busy" | "processing_timeout" | "processing_failed";
type ReceiptDetails = { kind: "image"; width: number; height: number } | { kind: "pdf"; pages: number };
export type ValidatedReceipt = ReceiptDetails & {
  bytes: Uint8Array;
  sizeBytes: number;
  contentType: ReceiptMime;
  sha256: string;
};
export type ReceiptFileInput = { bytes: Uint8Array; claimedMime?: string };

const messages: Record<ReceiptErrorCode, string> = {
  invalid_file: "The receipt file is incomplete or cannot be decoded.",
  too_large: "Receipt files must not exceed 10 MiB.",
  unsupported_type: "Choose a JPEG, PNG, static WebP or PDF receipt.",
  unsupported_animation: "Animated receipts are not supported.",
  encrypted_pdf: "Choose a PDF without encryption or password protection.",
  resource_limit: "The receipt exceeds the processing limits.",
  busy: "Receipt processing is busy. Try again shortly.",
  processing_timeout: "Receipt processing timed out. Try another file or retry.",
  processing_failed: "Receipt processing is unavailable. Try again.",
};

export class ReceiptFileError extends Error {
  readonly code: ReceiptErrorCode;
  constructor(code: ReceiptErrorCode) {
    super(messages[code]);
    this.name = "ReceiptFileError";
    this.code = code;
  }
}

function contentType(bytes: Uint8Array): ReceiptMime {
  const header = Buffer.from(bytes.subarray(0, 12));
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (/^%PDF-(?:1\.[0-7]|2\.0)/.test(header.toString("ascii"))) return "application/pdf";
  throw new ReceiptFileError("unsupported_type");
}

function checkPdfEnvelope(bytes: Uint8Array) {
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1").replaceAll("\0", " ");
  const match = /startxref\s+(\d+)\s+%%EOF[\t\n\f\r ]*$/.exec(tail);
  const offset = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(offset) || offset < 8 || offset >= bytes.length) throw new ReceiptFileError("invalid_file");
  const target = Buffer.from(bytes.subarray(offset, offset + 1024)).toString("latin1");
  // Classic xref or an xref-stream object; this rejects obvious repair candidates, not all PDF recovery.
  if (!/^xref(?:\s|$)/.test(target) && !/^\d+\s+\d+\s+obj\b[\s\S]*?\/Type\s*\/XRef\b/.test(target)) {
    throw new ReceiptFileError("invalid_file");
  }
}

function readDetails(value: unknown, mime: ReceiptMime): ReceiptDetails | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (mime === "application/pdf") {
    return result.kind === "pdf" && Number.isInteger(result.pages) && Number(result.pages) > 0 && Number(result.pages) <= RECEIPT_MAX_PAGES
      ? { kind: "pdf", pages: Number(result.pages) } : null;
  }
  const width = Number(result.width), height = Number(result.height);
  return result.kind === "image" && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= RECEIPT_MAX_SIDE && height <= RECEIPT_MAX_SIDE && width * height <= RECEIPT_MAX_PIXELS
    ? { kind: "image", width, height } : null;
}

type ProcessorOptions = {
  deadlineMs?: number;
  maxConcurrent?: number;
  // Trusted composition/test port only. Never derive this function from a request payload.
  spawnProcessor?: () => ChildProcess;
};

export function createReceiptValidator(options: ProcessorOptions = {}) {
  const deadlineMs = options.deadlineMs ?? 5000;
  const maxConcurrent = options.maxConcurrent ?? 2;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 5000 || !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 2) {
    throw new Error("Invalid receipt processor limits.");
  }
  const spawnProcessor = options.spawnProcessor ?? (() => fork(new URL("./receipt-file-worker.mjs", import.meta.url), [], {
    serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
    execArgv: ["--max-old-space-size=128"], env: { NODE_ENV: "production" },
  }));
  let active = 0;

  return async (input: ReceiptFileInput): Promise<ValidatedReceipt> => {
    if (!(input?.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) throw new ReceiptFileError("invalid_file");
    if (input.bytes.byteLength > RECEIPT_MAX_BYTES) throw new ReceiptFileError("too_large");
    const mime = contentType(input.bytes);
    if (input.claimedMime && (typeof input.claimedMime !== "string" || input.claimedMime.trim().toLowerCase() !== mime)) throw new ReceiptFileError("unsupported_type");
    if (mime === "application/pdf") checkPdfEnvelope(input.bytes);
    if (active >= maxConcurrent) throw new ReceiptFileError("busy");
    const bytes = Uint8Array.from(input.bytes);
    active++;
    let child: ChildProcess;
    try { child = spawnProcessor(); }
    catch { active--; throw new ReceiptFileError("processing_failed"); }

    return new Promise((resolve, reject) => {
      let outcome: ReceiptDetails | ReceiptFileError | undefined;
      let stopping = false;
      const stop = (result: ReceiptDetails | ReceiptFileError) => {
        if (stopping) return;
        stopping = true;
        outcome = result;
        child.kill("SIGKILL");
      };
      const timer = setTimeout(() => stop(new ReceiptFileError("processing_timeout")), deadlineMs);
      child.on("error", () => stop(new ReceiptFileError("processing_failed")));
      child.once("message", (message: unknown) => {
        const reply = message && typeof message === "object" ? message as Record<string, unknown> : {};
        if (reply.ok === true) {
          stop(readDetails(reply, mime) ?? new ReceiptFileError("processing_failed"));
        } else {
          const code = ["invalid_file", "resource_limit", "unsupported_animation", "encrypted_pdf"].includes(String(reply.code))
            ? reply.code as ReceiptErrorCode : "processing_failed";
          stop(new ReceiptFileError(code));
        }
      });
      // Release capacity only after the actual process and IPC resources have closed.
      child.once("close", () => {
        clearTimeout(timer);
        active--;
        if (!outcome || outcome instanceof ReceiptFileError) return reject(outcome ?? new ReceiptFileError("processing_failed"));
        resolve({ ...outcome, bytes, sizeBytes: bytes.length, contentType: mime, sha256: createHash("sha256").update(bytes).digest("hex") });
      });
      try {
        child.send({ bytes, contentType: mime, maxPixels: RECEIPT_MAX_PIXELS, maxSide: RECEIPT_MAX_SIDE, maxPages: RECEIPT_MAX_PAGES }, (error) => {
          if (error) stop(new ReceiptFileError("processing_failed"));
        });
      } catch { stop(new ReceiptFileError("processing_failed")); }
    });
  };
}

export const validateReceiptFile = createReceiptValidator();
