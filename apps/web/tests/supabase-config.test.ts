import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves explicit .ts imports.
import { getSupabaseConfig } from "../app/lib/supabase/config.ts";

const anonJwt = (role: string) => {
  const payload = Buffer.from(JSON.stringify({ role }), "utf8").toString("base64url");
  return `eyJhbGciOiJub25lIn0.${payload}.signature`;
};

function withEnv(
  values: { url?: string; key?: string; publicUrl?: string; publishableKey?: string },
  callback: () => void,
): void {
  const environment: Record<string, string | undefined> = {
    SUPABASE_URL: values.url,
    SUPABASE_ANON_KEY: values.key,
    NEXT_PUBLIC_SUPABASE_URL: values.publicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.publishableKey,
  };
  const previous = Object.fromEntries(Object.keys(environment).map((name) => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("configuration uses the official Next.js pair by default and prefers it over legacy variables", () => {
  const official = {
    publicUrl: " https://official.supabase.co/ ",
    publishableKey: " sb_publishable_official-key ",
  };
  const expected = { url: "https://official.supabase.co", anonKey: "sb_publishable_official-key" };
  withEnv(official, () => assert.deepEqual(getSupabaseConfig(), expected));
  withEnv({ ...official, url: "https://legacy.supabase.co", key: "sb_publishable_legacy-key" }, () => {
    assert.deepEqual(getSupabaseConfig(), expected);
  });
  assert.deepEqual(getSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: official.publicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: official.publishableKey,
  }), expected);
});

test("configuration never mixes pairs or falls back from an incomplete or invalid official pair", () => {
  const legacy = { SUPABASE_URL: "https://legacy.supabase.co", SUPABASE_ANON_KEY: "sb_publishable_legacy-key" };
  for (const official of [
    { NEXT_PUBLIC_SUPABASE_URL: "https://official.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_official-key" },
    { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://official.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " " },
    { NEXT_PUBLIC_SUPABASE_URL: "ftp://official.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_official-key" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://official.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not-public" },
  ]) {
    const environment = { ...legacy, ...official };
    const before = { ...environment };
    assert.equal(getSupabaseConfig(environment), null);
    assert.deepEqual(environment, before);
  }
});

test("official variables retain URL and public-key safety guards", () => {
  const valid = { NEXT_PUBLIC_SUPABASE_URL: "https://official.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key" };
  for (const url of ["ftp://official.supabase.co", "http://official.supabase.co", "https://user:password@official.supabase.co"]) {
    assert.equal(getSupabaseConfig({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url }), null);
  }
  for (const key of ["sb_secret_test-key", anonJwt("service_role"), anonJwt("authenticated"), "not.a.jwt", "sb_publishable_"]) {
    assert.equal(getSupabaseConfig({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), null);
  }
  assert.deepEqual(getSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321/",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonJwt("anon"),
  }), { url: "http://127.0.0.1:54321", anonKey: anonJwt("anon") });
});

test("configuration fails closed when URL or key is missing", () => {
  withEnv({ url: "http://127.0.0.1:54321" }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ key: anonJwt("anon") }, () => assert.equal(getSupabaseConfig(), null));
});

test("configuration rejects non-http URLs and privileged keys", () => {
  withEnv({ url: "ftp://supabase.test", key: anonJwt("anon") }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://supabase.test", key: anonJwt("anon") }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://127.0.0.1:54321", key: "sb_secret_test-key" }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://127.0.0.1:54321", key: "service-role-test-key" }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://127.0.0.1:54321", key: "anon-test-key" }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://127.0.0.1:54321", key: "not.a.jwt" }, () => assert.equal(getSupabaseConfig(), null));
  withEnv({ url: "http://127.0.0.1:54321", key: anonJwt("authenticated") }, () => assert.equal(getSupabaseConfig(), null));
});

test("configuration accepts local anon and publishable keys", () => {
  withEnv({ url: "http://127.0.0.1:54321", key: anonJwt("anon") }, () => {
    assert.deepEqual(getSupabaseConfig(), {
      url: "http://127.0.0.1:54321",
      anonKey: anonJwt("anon"),
    });
  });
  withEnv({ url: "https://project.supabase.co/", key: "sb_publishable_test-key" }, () => {
    assert.deepEqual(getSupabaseConfig(), {
      url: "https://project.supabase.co",
      anonKey: "sb_publishable_test-key",
    });
  });
});
