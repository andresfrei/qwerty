import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeProductPhoto } from "../app/lib/product-photo-normalizer.ts";
import { changeProductPhoto, PhotoChangeError } from "../app/lib/product-photo-service.ts";

const itemId = "22222222-2222-4222-8222-222222222222";
const businessId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const oldPath = `${businessId}/${itemId}/44444444-4444-4444-8444-444444444444.webp`;
const command = { itemId, expectedVersion: "7", operation: "detach" };

function harness(overrides = {}) {
  let stored = { photoPath: oldPath, photoVersion: "7" };
  const effects = { reads: 0, encodes: 0, uploads: [], commits: [] };
  const ports = {
    authenticatedUserId: async () => userId,
    ownedItem: async (item, actor) => {
      effects.reads++;
      assert.equal(item, itemId);
      assert.equal(actor, userId);
      return { businessId, photoVersion: stored.photoVersion };
    },
    normalize: async (bytes) => {
      effects.encodes++;
      return normalizeProductPhoto(bytes);
    },
    upload: async (...args) => { effects.uploads.push(args); },
    commit: async (change) => {
      effects.commits.push(change);
      assert.equal(change.actorId, userId);
      assert.equal(change.itemId, itemId);
      assert.equal(change.businessId, businessId);
      assert.equal(change.expectedVersion, stored.photoVersion);
      stored = { photoPath: change.photoPath, photoVersion: change.nextVersion };
      return true;
    },
    ...overrides,
  };
  return { ports, effects, snapshot: () => structuredClone(stored) };
}

async function rejected(h, input, code) {
  const before = h.snapshot();
  await assert.rejects(changeProductPhoto(input, h.ports), (error) => {
    assert.ok(error instanceof PhotoChangeError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
  assert.deepEqual(h.snapshot(), before);
  assert.deepEqual(h.effects.uploads, []);
  assert.deepEqual(h.effects.commits, []);
  assert.equal(h.effects.encodes, 0);
}

test("rejects missing identity and non-owned items without processing or writing", async () => {
  const signedOut = harness({ authenticatedUserId: async () => null });
  await rejected(signedOut, command, "unauthorized");
  assert.equal(signedOut.effects.reads, 0);
  await rejected(harness({ ownedItem: async () => null }), command, "not_found");
});

test("rejects invalid identifiers, versions, operation and missing image without writes", async () => {
  for (const change of [
    { itemId: "other" }, { expectedVersion: "-1" }, { expectedVersion: "07" },
    { expectedVersion: "9223372036854775807" }, { operation: "delete" },
    { operation: "replace" }, { operation: "replace", image: new Uint8Array() },
    { operation: "detach", image: new Uint8Array([1]) },
  ]) {
    await rejected(harness(), { ...command, ...change }, "invalid_input");
  }
});

test("rejects stale versions before encoding, uploading or metadata writes", async () => {
  await rejected(harness(), { ...command, expectedVersion: "6" }, "conflict");
});

test("detaches the reference and increments version without deleting or uploading objects", async () => {
  const h = harness();
  const result = await changeProductPhoto(command, h.ports);
  assert.deepEqual(result, { photoPath: null, photoVersion: "8" });
  assert.deepEqual(h.snapshot(), result);
  assert.deepEqual(h.effects.uploads, []);
  assert.equal(h.effects.encodes, 0);
  assert.deepEqual(h.effects.commits, [{
    actorId: userId, itemId, businessId, expectedVersion: "7", nextVersion: "8", photoPath: null,
  }]);
});

test("uploads real normalized WebP to a fresh path before attaching its reference", async () => {
  const input = await sharp({ create: { width: 4, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const h = harness();
  const result = await changeProductPhoto({ ...command, operation: "replace", image: input }, h.ports);
  const [path, bytes, options] = h.effects.uploads[0];
  assert.match(path, new RegExp(`^${businessId}/${itemId}/[0-9a-f-]{36}\\.webp$`));
  assert.notEqual(path, oldPath);
  assert.deepEqual(options, { contentType: "image/webp", upsert: false });
  assert.ok(bytes.byteLength <= 409600);
  assert.notDeepEqual(bytes, input);
  const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 4);
  assert.equal(decoded.info.height, 2);
  assert.equal(decoded.data.length, 24);
  assert.equal(h.effects.encodes, 1);
  assert.equal(h.effects.uploads.length, 1);
  assert.equal(h.effects.commits.length, 1);
  assert.equal(h.effects.commits[0].photoPath, path);
  assert.deepEqual(result, { photoPath: path, photoVersion: "8" });
  assert.deepEqual(h.snapshot(), result);
});

test("uses exact bigint versions beyond JavaScript's safe integer boundary", async () => {
  const h = harness({ ownedItem: async () => ({ businessId, photoVersion: "9007199254740993" }), commit: async () => true });
  assert.deepEqual(await changeProductPhoto({ ...command, expectedVersion: "9007199254740993" }, h.ports), {
    photoPath: null, photoVersion: "9007199254740994",
  });
});

test("a codec rejection never uploads or updates metadata", async () => {
  const h = harness();
  const before = h.snapshot();
  await assert.rejects(changeProductPhoto({ ...command, operation: "replace", image: new Uint8Array([1, 2, 3]) }, h.ports), { code: "unsupported_format" });
  assert.deepEqual(h.snapshot(), before);
  assert.equal(h.effects.encodes, 1);
  assert.deepEqual(h.effects.uploads, []);
  assert.deepEqual(h.effects.commits, []);
});

test("upload failure never commits, retries or removes the prior reference", async () => {
  const fault = new Error("storage unavailable");
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  const h = harness({ upload: async (...args) => { h.effects.uploads.push(args); throw fault; } });
  const before = h.snapshot();
  await assert.rejects(changeProductPhoto({ ...command, operation: "replace", image: input }, h.ports), (error) => error === fault);
  assert.deepEqual(h.snapshot(), before);
  assert.equal(h.effects.uploads.length, 1);
  assert.deepEqual(h.effects.commits, []);
});

test("a lost ownership/version race does not succeed or attempt cleanup", async () => {
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  const h = harness({ commit: async (change) => { h.effects.commits.push(change); return false; } });
  const before = h.snapshot();
  await assert.rejects(changeProductPhoto({ ...command, operation: "replace", image: input }, h.ports), { code: "conflict" });
  assert.deepEqual(h.snapshot(), before);
  assert.equal(h.effects.uploads.length, 1);
  assert.equal(h.effects.commits.length, 1);
  assert.notEqual(h.effects.uploads[0][0], oldPath);
});
