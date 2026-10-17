import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { encryptedPdf, makePdf, makePng } from "./receipt-file-fixtures.mjs";

const maxBytes = 10_485_760;
const load = () => import("../app/lib/receipt-file.ts");
const image = (format = "png") => sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).toFormat(format).toBuffer();
const stable = (code) => (error) => {
  assert.equal(error.name, "ReceiptFileError");
  assert.equal(error.code, code);
  assert.equal(error.message.includes("secret"), false);
  return true;
};
const validate = async (bytes, claimedMime) => (await load()).validateReceiptFile({ bytes, claimedMime });

for (const [format, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
  test(`accepts fully decoded static ${format}, preserving bytes, size and hash`, async () => {
    const bytes = await image(format);
    const original = Buffer.from(bytes);
    const result = await validate(bytes, mime);
    assert.equal(result.kind, "image");
    assert.equal(result.contentType, mime);
    assert.equal(result.width, 2);
    assert.equal(result.height, 2);
    assert.equal(result.sizeBytes, original.length);
    assert.equal(result.sha256, createHash("sha256").update(original).digest("hex"));
    assert.deepEqual(Buffer.from(result.bytes), original);
    assert.deepEqual(bytes, original);
    bytes.fill(0);
    assert.deepEqual(Buffer.from(result.bytes), original, "returned bytes are an owned copy");
  });
}

for (const kind of ["text", "scanned", "multipage"]) {
  test(`accepts ${kind} PDF with actual document/page processing and unchanged original`, async () => {
    const bytes = makePdf({ pages: kind === "multipage" ? 3 : 1, jpeg: kind === "scanned" ? await image("jpeg") : undefined });
    const result = await validate(bytes, "application/pdf");
    assert.equal(result.kind, "pdf");
    assert.equal(result.pages, kind === "multipage" ? 3 : 1);
    assert.equal(result.contentType, "application/pdf");
    assert.equal(result.sizeBytes, bytes.length);
    assert.deepEqual(Buffer.from(result.bytes), bytes);
    assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  });
}

test("accepts exactly 10 MiB and rejects larger input before creating a processor", async () => {
  const { createReceiptValidator } = await load();
  const base = makePdf({ padding: 1 });
  let padding = maxBytes - base.length + 1;
  const candidate = makePdf({ padding });
  // The startxref decimal field also grows when the padding crosses a digit boundary.
  padding -= candidate.length - maxBytes;
  const bytes = makePdf({ padding });
  assert.equal(bytes.length, maxBytes);
  assert.equal((await validate(bytes, "application/pdf")).sizeBytes, maxBytes);
  let calls = 0;
  const validator = createReceiptValidator({ spawnProcessor: () => { calls++; throw Error("must not spawn"); } });
  const excessive = Buffer.alloc(maxBytes + 1, 4);
  const before = createHash("sha256").update(excessive).digest("hex");
  await assert.rejects(validator({ bytes: excessive }), stable("too_large"));
  assert.equal(calls, 0);
  assert.equal(createHash("sha256").update(excessive).digest("hex"), before);
});

test("rejects unsupported/signature-only/mismatched inputs before starting a process", async () => {
  const { createReceiptValidator } = await load();
  let calls = 0;
  const validator = createReceiptValidator({ spawnProcessor: () => { calls++; throw Error("must not spawn"); } });
  for (const [bytes, claimedMime, code] of [
    [Buffer.alloc(0), undefined, "invalid_file"],
    [Buffer.from("GIF89a fake"), "image/gif", "unsupported_type"],
    [Buffer.from("<html>receipt</html>"), "application/pdf", "unsupported_type"],
    [Buffer.from("%PDF-1.7\n"), "application/pdf", "invalid_file"],
    [makePdf().subarray(0, -12), "application/pdf", "invalid_file"],
    [makePdf(), "text/html", "unsupported_type"],
    [await image(), "image/jpeg", "unsupported_type"],
  ]) {
    const copy = Buffer.from(bytes);
    await assert.rejects(validator({ bytes, claimedMime }), stable(code));
    assert.deepEqual(bytes, copy);
  }
  assert.equal(calls, 0);
});

test("rejects corrupt or truncated image payloads despite usable metadata", async () => {
  for (const format of ["png", "jpeg", "webp"]) {
    const bytes = await image(format);
    const broken = bytes.subarray(0, Math.floor(bytes.length * 0.65));
    await assert.rejects(validate(broken), stable("invalid_file"));
  }
});

test("APNG: rejects genuine two-frame PNG through the public validator", async () => {
  const bytes = makePng({ animated: true });
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    chunks.push({ type: bytes.toString("ascii", offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  assert.deepEqual(chunks.map(({ type }) => type), ["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "IEND"]);
  assert.equal(chunks[1].data.readUInt32BE(0), 2);
  assert.deepEqual(inflateSync(chunks[3].data), Buffer.from([0, 255, 0, 0, 255]));
  assert.deepEqual(inflateSync(chunks[5].data.subarray(4)), Buffer.from([0, 0, 0, 255, 255]));
  // Sharp decodes the default frame even on builds that omit APNG metadata.pages.
  assert.equal((await sharp(bytes).raw().toBuffer()).length, 4);
  await assert.rejects(validate(bytes, "image/png"), stable("unsupported_animation"));
});

test("APNG: acTL bytes inside static PNG IDAT are not an animation chunk", async () => {
  const bytes = makePng({ idatLookalike: true });
  assert.ok(bytes.includes(Buffer.from("acTL")));
  const result = await validate(bytes, "image/png");
  assert.equal(result.width, 1);
  assert.deepEqual(Buffer.from(result.bytes), bytes);
});

test("APNG: malformed PNG chunk lengths fail closed without loops or out-of-bounds reads", async () => {
  const bytes = makePng();
  for (const length of [0, bytes.length, 0xffffffff]) {
    const broken = Buffer.from(bytes);
    broken.writeUInt32BE(length, 8);
    await assert.rejects(validate(broken, "image/png"), stable("invalid_file"));
  }
  for (const end of [9, 15, bytes.length - 1]) {
    await assert.rejects(validate(bytes.subarray(0, end), "image/png"), stable("invalid_file"));
  }
});

test("rejects animated WebP instead of validating only its first frame", async () => {
  const pixels = Buffer.alloc(8 * 16 * 3);
  pixels.fill(255, 0, 8 * 8 * 3);
  const bytes = await sharp(pixels, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(bytes, { animated: true }).metadata()).pages, 2);
  await assert.rejects(validate(bytes), stable("unsupported_animation"));
});

test("rejects image pixel/side limits before full decode", async () => {
  const bytes = await sharp({ create: { width: 5001, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validate(bytes), stable("resource_limit"));
  const wide = await sharp({ create: { width: 16_385, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validate(wide), stable("resource_limit"));
});

test("rejects damaged xref recovery candidates and excessive PDF page count", async () => {
  const bytes = makePdf();
  const broken = Buffer.from(bytes.toString("latin1").replace(/startxref\n\d+/, "startxref\n1"), "latin1");
  await assert.rejects(validate(broken), stable("invalid_file"));
  await assert.rejects(validate(makePdf({ pages: 101 })), stable("resource_limit"));
});

for (const password of ["secret", ""]) {
  test(`rejects real ${password ? "password-protected" : "empty-password encrypted"} PDF`, async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = encryptedPdf(password);
    const control = getDocument({ data: Uint8Array.from(bytes), password, verbosity: 0 });
    const document = await control.promise;
    try {
      assert.equal(document.numPages, 1);
      assert.equal((await document.getMetadata()).info.EncryptFilterName, "Standard");
    } finally {
      await control.destroy();
    }
    await assert.rejects(validate(bytes, "application/pdf"), stable("encrypted_pdf"));
  });
}

function processorHarness(firstMode) {
  const children = [];
  return {
    children,
    spawnProcessor: () => {
      const mode = children.length === 0 ? firstMode : "valid";
      const child = fork(new URL("./fixtures/receipts/process.mjs", import.meta.url), [], {
        serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"],
        execArgv: ["--max-old-space-size=128"], env: { RECEIPT_TEST_MODE: mode },
      });
      children.push(child);
      return child;
    },
  };
}

for (const [mode, code] of [["hang", "processing_timeout"], ["crash", "processing_failed"], ["malformed", "processing_failed"]]) {
  test(`terminates ${mode} processor, releases the slot and permits retry`, async () => {
    const { createReceiptValidator } = await load();
    const harness = processorHarness(mode);
    const validator = createReceiptValidator({ spawnProcessor: harness.spawnProcessor, deadlineMs: mode === "hang" ? 500 : 5000, maxConcurrent: 1 });
    const bytes = await image();
    const before = Buffer.from(bytes);
    await assert.rejects(validator({ bytes }), stable(code));
    assert.ok(harness.children[0].exitCode !== null || harness.children[0].signalCode !== null);
    if (mode === "hang") assert.equal(harness.children[0].signalCode, "SIGKILL");
    assert.deepEqual(bytes, before);
    assert.equal((await validator({ bytes })).width, 2);
    assert.equal(harness.children.length, 2);
    assert.ok(harness.children.every((child) => child.exitCode !== null || child.signalCode !== null));
  });
}

test("fails busy without a queue or extra process, then recovers after timeout", async () => {
  const { createReceiptValidator } = await load();
  const harness = processorHarness("hang");
  const validator = createReceiptValidator({ spawnProcessor: harness.spawnProcessor, deadlineMs: 500, maxConcurrent: 1 });
  const bytes = await image();
  const pending = assert.rejects(validator({ bytes }), stable("processing_timeout"));
  await assert.rejects(validator({ bytes }), stable("busy"));
  assert.equal(harness.children.length, 1);
  await pending;
  assert.equal((await validator({ bytes })).kind, "image");
});
