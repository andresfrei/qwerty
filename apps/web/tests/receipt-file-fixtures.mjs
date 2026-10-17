import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

export function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

// Valid PNG/APNG chunks with CRCs and independently compressed RGBA frames.
export function makePng({ animated = false, idatLookalike = false } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const frame = (sequence) => {
    const control = Buffer.alloc(26);
    control.writeUInt32BE(sequence, 0);
    control.writeUInt32BE(1, 4);
    control.writeUInt32BE(1, 8);
    control.writeUInt16BE(1, 20);
    control.writeUInt16BE(10, 22);
    return pngChunk("fcTL", control);
  };
  const pixels = idatLookalike ? Buffer.from([0, ...Buffer.from("acTL")]) : Buffer.from([0, 255, 0, 0, 255]);
  const chunks = [Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", header)];
  if (animated) {
    const control = Buffer.alloc(8);
    control.writeUInt32BE(2);
    chunks.push(pngChunk("acTL", control), frame(0));
  }
  chunks.push(pngChunk("IDAT", deflateSync(pixels, idatLookalike ? { level: 0 } : {})));
  if (animated) {
    const sequence = Buffer.alloc(4);
    sequence.writeUInt32BE(2);
    chunks.push(frame(1), pngChunk("fdAT", Buffer.concat([sequence, deflateSync(Buffer.from([0, 0, 0, 255, 255]))])));
  }
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

export function assemblePdf(objects, { encrypt, id } = {}) {
  const chunks = [Buffer.from("%PDF-1.7\n%\xff\xff\xff\xff\n", "latin1")];
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(chunks.reduce((sum, part) => sum + part.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "latin1"), Buffer.from(body, "latin1"), Buffer.from("\nendobj\n"));
  }
  const xref = chunks.reduce((sum, part) => sum + part.length, 0);
  const table = offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  const extras = encrypt ? ` /Encrypt ${encrypt} 0 R /ID [<${id}><${id}>]` : "";
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${extras} >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

export function makePdf({ pages = 1, jpeg, padding = 0, content } = {}) {
  const fontNumber = 3 + pages * 2;
  const imageNumber = fontNumber + 1;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] >>`,
  ];
  for (let i = 0; i < pages; i++) {
    const operators = content ?? (jpeg ? "q 100 0 0 100 0 0 cm /Im1 Do Q" : "BT /F1 12 Tf 20 20 Td (Receipt) Tj ET");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 ${fontNumber} 0 R >>${jpeg ? ` /XObject << /Im1 ${imageNumber} 0 R >>` : ""} >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(operators)} >>\nstream\n${operators}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  if (jpeg) objects.push(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg.toString("latin1")}\nendstream`);
  if (padding) objects.push(`<< /UnusedPadding (${" ".repeat(padding)}) >>`);
  return assemblePdf(objects);
}

const passwordPadding = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");
const pad = (password) => Buffer.concat([Buffer.from(password, "latin1"), passwordPadding]).subarray(0, 32);
const md5 = (bytes) => createHash("md5").update(bytes).digest();

// Standard Security Handler revision 2: real fixtures, including an empty user password.
function rc4(key, input) {
  const state = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
  }
  let i = 0;
  j = 0;
  return Buffer.from(input.map((byte) => {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
    return byte ^ state[(state[i] + state[j]) % 256];
  }));
}

export function encryptedPdf(password = "") {
  const id = Buffer.alloc(16, 7);
  const owner = rc4(md5(pad("owner")).subarray(0, 5), pad(password));
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const key = md5(Buffer.concat([pad(password), owner, permissions, id])).subarray(0, 5);
  const user = rc4(key, passwordPadding);
  return assemblePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> >>",
    `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P -4 >>`,
  ], { encrypt: 4, id: id.toString("hex") });
}
