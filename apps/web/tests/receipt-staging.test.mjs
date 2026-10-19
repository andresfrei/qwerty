import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { makePng } from './receipt-file-fixtures.mjs';
const actor = '11111111-1111-4111-8111-111111111111', business = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
const path = `${business}/${actor}/${id}`;
const bytes = Uint8Array.from(makePng());
const load = () => import('../app/lib/receipt-staging.ts');
function repository() {
  const calls = [], rows = [], objects = new Map();
  return { calls, rows, objects,
    async upload(p, value, mime) { calls.push('upload'); assert.equal(mime, 'image/png'); assert.equal(objects.has(p), false); objects.set(p, Uint8Array.from(value)); },
    async insert(row) { calls.push('insert'); rows.push(row); },
    async find(a, b, r) { calls.push('find'); return rows.find(row => row.actor_id === a && row.business_id === b && row.id === r) ?? null; },
    async download(p) { calls.push('download'); return objects.get(p); },
  };
}
test('real T3a validation precedes private upload; metadata is server-derived', async () => {
  const repo = repository(); const service = (await load()).createReceiptStaging(repo, { randomId: () => id });
  assert.equal(await service.stage(actor, business, bytes), id);
  assert.deepEqual(repo.calls, ['upload', 'insert']); assert.deepEqual(repo.objects.get(path), bytes);
  assert.deepEqual(repo.rows, [{ id, actor_id: actor, business_id: business, object_path: path, content_type: 'image/png', size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), state: 'staged' }]);
  const result = await service.download(actor, business, id); assert.deepEqual(result, { bytes, contentType: 'image/png' });
});
test('invalid file never calls repository', async () => {
  const repo = repository(); const service = (await load()).createReceiptStaging(repo);
  await assert.rejects(service.stage(actor, business, new Uint8Array([1, 2])), { code: 'unsupported_type' }); assert.deepEqual(repo.calls, []);
});
test('upload failure never inserts; metadata failure leaves only private orphan and retry uses fresh ID', async () => {
  const repo = repository(); repo.upload = async () => { throw new Error('provider detail'); };
  const service = (await load()).createReceiptStaging(repo); await assert.rejects(service.stage(actor, business, bytes)); assert.equal(repo.rows.length, 0);
  const orphan = repository(); orphan.insert = async () => { throw new Error('insert failed'); };
  const retryService = (await load()).createReceiptStaging(orphan); await assert.rejects(retryService.stage(actor, business, bytes)); await assert.rejects(retryService.stage(actor, business, bytes));
  assert.equal(orphan.objects.size, 2); assert.equal(orphan.rows.length, 0);
});
test('foreign guest, same-email unrelated account and other business owner cannot fetch bytes', async () => {
  const repo = repository(); const service = (await load()).createReceiptStaging(repo, { randomId: () => id }); await service.stage(actor, business, bytes);
  for (const [a, b] of [[business, business], [id, business], [actor, id]]) {
    repo.calls.length = 0; assert.equal(await service.download(a, b, id), null); assert.deepEqual(repo.calls, ['find']);
  }
});
test('corrupt metadata or bytes fail closed before delivering', async () => {
  for (const corrupt of [row => { row.object_path = 'foreign'; }, row => { row.actor_id = id; }, row => { row.state = 'attached'; }, row => { row.content_type = 'text/html'; }, row => { row.size_bytes++; }, row => { row.sha256 = '0'.repeat(64); }]) {
    const repo = repository(); const service = (await load()).createReceiptStaging(repo, { randomId: () => id }); await service.stage(actor, business, bytes); corrupt(repo.rows[0]);
    assert.equal(await service.download(actor, business, id), null);
  }
});
