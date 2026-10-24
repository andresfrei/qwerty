import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// STRUCTURAL source contracts only: no database, credentials, Git or .pi input.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const migrations = readdirSync(`${root}supabase/migrations`).filter(n => n.endsWith('_catalog_configurations.sql'));
const sql = migrations.map(n => readFileSync(`${root}supabase/migrations/${n}`, 'utf8')).join('\n');

test('STRUCTURAL: additive storage and invoker APIs are present', () => {
  assert.equal(migrations.length, 1);
  for (const name of ['catalog_item_configurations', 'save_catalog_item_configuration', 'catalog_configuration_capabilities', 'pickup_order_catalog_v2', 'finalize_pickup_order_v2']) {
    assert.match(sql, new RegExp(`CREATE (?:TABLE|FUNCTION) public\\.${name}\\b`, 'i'));
  }
  assert.doesNotMatch(sql, /SECURITY\s+DEFINER|CREATE\s+EXTENSION|GRANT\s+DELETE|ALTER\s+TABLE\s+public\.catalog_items\s+ADD/i);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
});

test('STRUCTURAL: CAS, direct-write guard and legacy downgrade fence', () => {
  for (const fragment of ['p_expected_version bigint', 'version = p_expected_version', 'configuration_version_conflict', 'catalog_configuration_before', 'catalog_configuration_after', 'pickup_configuration_fence', 'profile_required', 'private.owner_email_verified()', 'catalog_configuration_lock']) assert.ok(sql.includes(fragment), fragment);
  assert.match(sql, /GRANT INSERT \(business_id, item_id, is_active, document\)/);
  assert.match(sql, /UPDATE \(is_active, document\)/);
  assert.doesNotMatch(sql, /GRANT[^;]*\bversion\b[^;]*TO authenticated/);
});

test('STRUCTURAL: exact v2 signatures, freshness and replay ordering', () => {
  assert.match(sql, /pickup_order_catalog_v2\(p_business uuid, p_slug text\)/);
  assert.match(sql, /finalize_pickup_order_v2\(\s*p_actor uuid, p_business uuid, p_intent jsonb, p_quote jsonb/);
  const finalizer = sql.slice(sql.indexOf('CREATE FUNCTION public.finalize_pickup_order_v2'));
  assert.ok(finalizer.indexOf('8101') < finalizer.indexOf('8102'));
  assert.ok(finalizer.indexOf("'replayed'") < finalizer.indexOf('catalog := public.pickup_order_catalog_v2'));
  assert.match(finalizer, /EXCEPTION WHEN unique_violation/);
  assert.match(sql, /'profiles'[\s\S]*ORDER BY c.item_id/);
  assert.match(sql, /sha256\(convert_to\(payload::text, 'UTF8'\)\)/);
  assert.match(sql, /RETURNS TABLE \(version integer, "schemaVersion" integer\)/);
});

// Lexical sanity only, deliberately NOT a PostgreSQL syntax/PLpgSQL parser.
function delimiters(source, label) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
    } else if (source[i] === "'" || source[i] === '"') {
      const quote = source[i++];
      while (i < source.length) {
        if (source[i] === quote) {
          if (source[i + 1] === quote) i += 2;
          else break;
        } else i++;
      }
      assert.ok(i < source.length, `${label}: unclosed quote`);
    } else if (source[i] === '$') {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if (tag) {
        const end = source.indexOf(tag, i + tag.length);
        assert.ok(end >= 0, `${label}: unclosed dollar string`);
        delimiters(source.slice(i + tag.length, end), `${label}:${source.slice(0, i).split('\n').length}`);
        i = end + tag.length - 1;
      }
    } else if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      assert.ok(--depth >= 0, `${label}: extra closing parenthesis at line ${source.slice(0, i).split('\n').length}`);
    }
  }
  assert.equal(depth, 0, `${label}: unclosed parentheses`);
}

test('STRUCTURAL: lexical delimiter sanity, not SQL syntax proof', () => {
  delimiters(sql, 'migration');
  for (const name of ['mvp_catalog_configurations.test.sql', 'mvp_pickup_orders_v2.test.sql']) {
    delimiters(readFileSync(`${root}supabase/tests/database/${name}`, 'utf8'), name);
  }
});

test('STRUCTURAL: meaningful isolated PostgreSQL cases are prepared', () => {
  for (const name of ['mvp_catalog_configurations.test.sql', 'mvp_pickup_orders_v2.test.sql']) {
    const source = readFileSync(`${root}supabase/tests/database/${name}`, 'utf8');
    assert.match(source, /BEGIN;/);
    assert.match(source, /gen_random_uuid\(\)/);
    assert.match(source, /SET LOCAL ROLE authenticated/);
    assert.match(source, /SELECT (?:is|ok|throws_ok|lives_ok)\(/);
    assert.match(source, /ROLLBACK;/);
    assert.doesNotMatch(source, /CREATE EXTENSION|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  }
});
