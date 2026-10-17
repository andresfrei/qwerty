// Private Node child entry point. It receives bytes over IPC, never a user-selected URL or path.
const fail = (code) => { throw Object.assign(new Error(code), { receiptCode: code }); };

function rejectPngAnimation(bytes) {
  // Sharp may expose only the default APNG frame, with no metadata.pages.
  // Walk chunk boundaries, not payload bytes: IDAT can legitimately contain "acTL".
  for (let offset = 8; offset < bytes.length;) {
    const remaining = bytes.length - offset;
    if (remaining < 12) fail("invalid_file");
    const length = bytes.readUInt32BE(offset);
    if (length > remaining - 12) fail("invalid_file");
    if (bytes.toString("latin1", offset + 4, offset + 8) === "acTL") fail("unsupported_animation");
    offset += length + 12; // Always advances, including for empty chunks; never exceeds bytes.length.
  }
}

async function decodeImage(bytes, contentType, maxPixels, maxSide) {
  if (contentType === "image/png") rejectPngAnimation(bytes);
  const { default: sharp } = await import("sharp");
  const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: false, animated: true });
  try {
    const metadata = await decoder.metadata();
    const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[contentType];
    if (metadata.format !== expected || !metadata.width || !metadata.height) fail("invalid_file");
    if ((metadata.pages ?? 1) !== 1) fail("unsupported_animation");
    if (metadata.width > maxSide || metadata.height > maxSide || metadata.width * metadata.height > maxPixels) fail("resource_limit");
    // Full pixel decode, not metadata-only acceptance. These pixels are discarded, never stored.
    await decoder.raw({ depth: "uchar" }).toBuffer();
    return { kind: "image", width: metadata.width, height: metadata.height };
  } finally {
    decoder.destroy();
  }
}

async function parsePdf(bytes, maxPages, maxPixels) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(bytes), verbosity: 0, stopAtErrors: true,
    isEvalSupported: false, useSystemFonts: false, disableFontFace: true,
    useWasm: false, useWorkerFetch: false, isOffscreenCanvasSupported: false,
    maxImageSize: maxPixels,
  });
  try {
    const document = await task.promise;
    const { info } = await document.getMetadata();
    // Empty-password encryption can open without PasswordException; do not mistake it for plain PDF.
    if (info.EncryptFilterName !== null || await document.getPermissions() !== null) fail("encrypted_pdf");
    if (!Number.isInteger(document.numPages) || document.numPages < 1) fail("invalid_file");
    if (document.numPages > maxPages) fail("resource_limit");
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      if (!page.view.every(Number.isFinite) || page.view[2] <= page.view[0] || page.view[3] <= page.view[1]) fail("invalid_file");
      // Parse each page's operators/resources, without canvas rendering or executing document actions.
      await page.getOperatorList();
      page.cleanup();
    }
    return { kind: "pdf", pages: document.numPages };
  } catch (error) {
    if (error?.name === "PasswordException") fail("encrypted_pdf");
    throw error;
  } finally {
    await task.destroy();
  }
}

process.once("message", async ({ bytes, contentType, maxPixels, maxSide, maxPages }) => {
  // No external fetch input is accepted. Missing PDF auxiliary resources must fail, not go online.
  globalThis.fetch = async () => { throw new Error("External receipt resources are disabled."); };
  try {
    const buffer = Buffer.from(bytes);
    const details = contentType === "application/pdf"
      ? await parsePdf(buffer, maxPages, maxPixels)
      : await decodeImage(buffer, contentType, maxPixels, maxSide);
    process.send?.({ ok: true, ...details });
  } catch (error) {
    process.send?.({ ok: false, code: error?.receiptCode ?? "invalid_file" });
  }
});
