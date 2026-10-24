import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrations = new URL('../../../supabase/migrations/', import.meta.url);

test('explicit business id permission is exactly the approved single SQL statement', () => {
  const files = readdirSync(migrations).filter(name => name.endsWith('_owner_store_creation_id.sql'));
  assert.equal(files.length, 1, 'exactly one owner-store-id migration');
  const sql = readFileSync(new URL(files[0], migrations), 'utf8');
  // Structural scope proof only: this does not execute PostgreSQL or prove RLS behavior.
  assert.match(sql, /^\s*GRANT\s+INSERT\s*\(\s*id\s*\)\s+ON\s+TABLE\s+public\.businesses\s+TO\s+authenticated\s*;\s*$/i);
});
