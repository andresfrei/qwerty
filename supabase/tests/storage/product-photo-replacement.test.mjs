import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

import { changeProductPhoto, PhotoChangeError } from '../../../apps/web/app/lib/product-photo-service.ts';
import { normalizeProductPhoto } from '../../../apps/web/app/lib/product-photo-normalizer.ts';
import { createSupabasePhotoPorts } from '../../../apps/web/app/lib/product-photo-supabase.ts';

const API_URL = 'http://127.0.0.1:54321';
const DB_CONTAINER = 'supabase_db_qwerty-mvp';
const DOCKER_CONTEXT = 'default';
const BUCKET = 'product-photos';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function run(command, args, label, options = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  } catch {
    throw new Error(`${label} failed`);
  }
}

function docker(args, label, options = {}) {
  return run('docker', ['--context', DOCKER_CONTEXT, ...args], label, options).trim();
}

function psql(sql) {
  return docker(
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At'],
    'local SQL',
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}

function quote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseStatusEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return values;
}

function localOnlyGuard() {
  if (process.env.DOCKER_HOST !== undefined) throw new Error('DOCKER_HOST must be unset');
  assert.equal(docker(['context', 'show'], 'Docker context'), DOCKER_CONTEXT, 'unexpected Docker context');
  assert.equal(
    docker(['context', 'inspect', DOCKER_CONTEXT, '--format', '{{ (index .Endpoints "docker").Host }}'], 'Docker endpoint'),
    'unix:///var/run/docker.sock',
    'Docker endpoint must be the local Unix socket',
  );
  assert.equal(statSync('/var/run/docker.sock').isSocket(), true, 'local Docker socket is missing');
  assert.equal(
    docker(['inspect', DB_CONTAINER, '--format', '{{ index .Config.Labels "com.supabase.cli.project" }}'], 'Docker project label'),
    'qwerty-mvp',
    'unexpected Supabase Docker project',
  );
}

/** Minimal service-role transport for the existing Supabase photo adapter. */
function serviceClient(env) {
  const headers = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` };
  return {
    async rpc(name, args) {
      const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!response.ok) return { data: null, error: { status: response.status } };
      return { data: await response.json(), error: null };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            const response = await fetch(`${API_URL}/storage/v1/object/${bucket}/${path}`, {
              method: 'POST',
              headers: { ...headers, 'content-type': options.contentType, 'x-upsert': String(options.upsert) },
              body: bytes,
            });
            if (!response.ok) return { data: null, error: { status: response.status } };
            await response.arrayBuffer();
            return { data: { path }, error: null };
          },
        };
      },
    },
  };
}

function fixture() {
  return {
    ownerId: crypto.randomUUID(),
    businessId: crypto.randomUUID(),
    categoryId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    strangerId: crypto.randomUUID(),
  };
}

function prefix(f) {
  return `${f.businessId}/${f.itemId}/`;
}

function createFixture(f) {
  psql(`
    INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
      VALUES (${quote(f.ownerId)}, 'authenticated', 'authenticated', ${quote(`replacement-${f.ownerId}@example.test`)}, now());
    INSERT INTO public.businesses (id, owner_id, name)
      VALUES (${quote(f.businessId)}, ${quote(f.ownerId)}, 'Photo replacement');
    INSERT INTO public.catalog_categories (id, business_id, name, sort_order)
      VALUES (${quote(f.categoryId)}, ${quote(f.businessId)}, 'Replacement', 0);
    INSERT INTO public.catalog_items (id, business_id, category_id, name, price_minor, currency, is_available, sort_order)
      VALUES (${quote(f.itemId)}, ${quote(f.businessId)}, ${quote(f.categoryId)}, 'Replacement item', 100, 'ARS', true, 0);
  `);
}

function removeFixture(f) {
  psql(`
    DELETE FROM public.catalog_items WHERE id = ${quote(f.itemId)};
    DELETE FROM public.catalog_categories WHERE id = ${quote(f.categoryId)};
    DELETE FROM public.businesses WHERE id = ${quote(f.businessId)};
    DELETE FROM auth.users WHERE id = ${quote(f.ownerId)};
  `);
}

function storedReference(f) {
  return psql(`SELECT coalesce(photo_path, 'NULL') || '|' || photo_version::text
    FROM public.catalog_items WHERE id = ${quote(f.itemId)};`);
}

function objectCount(f) {
  return psql(`SELECT count(*) FROM storage.objects
    WHERE bucket_id = ${quote(BUCKET)} AND name LIKE ${quote(`${prefix(f)}%`)};`);
}

function objectNames(f) {
  return psql(`SELECT name FROM storage.objects
    WHERE bucket_id = ${quote(BUCKET)} AND name LIKE ${quote(`${prefix(f)}%`)};`)
    .split(/\r?\n/).filter(Boolean);
}

async function removeObjects(env, names) {
  const response = await fetch(`${API_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefixes: names }),
  });
  await response.arrayBuffer();
  return response.status;
}

test('the trusted contract is present in the local database', () => {
  localOnlyGuard();
  const functions = psql(`SELECT proname FROM pg_proc
    WHERE proname IN ('get_owned_product_photo', 'commit_product_photo') ORDER BY proname;`)
    .split(/\r?\n/).filter(Boolean).join(',');
  assert.equal(
    functions,
    'commit_product_photo,get_owned_product_photo',
    'apply the function/privilege portion of supabase/operations/trusted_product_photo_storage.sql first',
  );
});

test('real owner replace, replace again and detach against the local stack', async (t) => {
  localOnlyGuard();
  const env = parseStatusEnv(run('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], 'Supabase status'));
  assert.equal(env.API_URL, API_URL, 'Supabase API must be the exact local loopback URL');
  assert.ok(env.SERVICE_ROLE_KEY, 'local service role key is required');

  const f = fixture();
  let fixtureMayExist = false;
  let failure = null;
  const client = serviceClient(env);
  const ownerPorts = createSupabasePhotoPorts({
    client,
    authenticatedUserId: async () => f.ownerId,
    normalize: normalizeProductPhoto,
  });
  const strangerPorts = createSupabasePhotoPorts({
    client,
    authenticatedUserId: async () => f.strangerId,
    normalize: normalizeProductPhoto,
  });

  try {
    createFixture(f);
    fixtureMayExist = true;

    const replaced = await changeProductPhoto(
      { itemId: f.itemId, expectedVersion: '0', operation: 'replace', image: PNG },
      ownerPorts,
    );
    assert.equal(replaced.photoVersion, '1');
    assert.match(replaced.photoPath, new RegExp(`^${prefix(f)}[0-9a-f-]{36}[.]webp$`));
    assert.equal(storedReference(f), `${replaced.photoPath}|1`);
    assert.equal(objectCount(f), '1');
    const publicRead = await fetch(`${API_URL}/storage/v1/object/public/${BUCKET}/${replaced.photoPath}`);
    assert.equal(publicRead.status, 200, 'the uploaded WebP must be publicly readable');

    const second = await changeProductPhoto(
      { itemId: f.itemId, expectedVersion: '1', operation: 'replace', image: PNG },
      ownerPorts,
    );
    assert.equal(second.photoVersion, '2');
    assert.notEqual(second.photoPath, replaced.photoPath);
    assert.equal(storedReference(f), `${second.photoPath}|2`);
    assert.equal(objectCount(f), '2', 'the replaced object is retained');

    const detached = await changeProductPhoto(
      { itemId: f.itemId, expectedVersion: '2', operation: 'detach' },
      ownerPorts,
    );
    assert.equal(detached.photoPath, null);
    assert.equal(detached.photoVersion, '3');
    assert.equal(storedReference(f), 'NULL|3');
    assert.equal(objectCount(f), '2', 'detach keeps the retained objects');

    await assert.rejects(
      () => changeProductPhoto({ itemId: f.itemId, expectedVersion: '3', operation: 'detach' }, strangerPorts),
      (error) => error instanceof PhotoChangeError && error.code === 'not_found',
    );
    await assert.rejects(
      () => changeProductPhoto({ itemId: f.itemId, expectedVersion: '0', operation: 'detach' }, ownerPorts),
      (error) => error instanceof PhotoChangeError && error.code === 'conflict',
    );
    assert.equal(storedReference(f), 'NULL|3', 'denials must not change the stored reference');
    assert.equal(objectCount(f), '2', 'denials must not create objects');
  } catch (error) {
    failure = error;
  } finally {
    t.diagnostic(`fixture business ${f.businessId} item ${f.itemId}`);
    if (fixtureMayExist) {
      try {
        const names = objectNames(f);
        if (names.length) {
          assert.equal(await removeObjects(env, names), 200, 'privileged local object cleanup must succeed');
        }
        assert.equal(objectCount(f), '0', 'cleanup must remove the retained objects');
        removeFixture(f);
      } catch (cleanupError) {
        if (!failure) failure = cleanupError;
        else t.diagnostic(`cleanup also failed: ${cleanupError.message}`);
      }
    }
  }
  if (failure) throw failure;
});
