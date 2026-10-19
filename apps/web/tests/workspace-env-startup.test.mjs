import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const web = path.join(repository, "apps/web");
const webPackage = JSON.parse(readFileSync(path.join(web, "package.json"), "utf8"));
const rootPackage = JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8"));
const require = createRequire(path.join(web, "package.json"));
const nextRequire = createRequire(require.resolve("next/package.json"));
const envHelper = nextRequire.resolve("@next/env");
const nextOptions = nextRequire.resolve("./dist/server/lib/utils.js");
const rootValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://root.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-root",
  SUPABASE_SECRET_KEY: "synthetic-private-root",
  QWERTY_SITE_URL: "https://root-site.example.test",
};
const webValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://web.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-web",
  SUPABASE_SECRET_KEY: "synthetic-private-web",
  QWERTY_SITE_URL: "https://web-site.example.test",
  QWERTY_WEB_ONLY: "web-only",
};
const injectedValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://injected.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-injected",
  SUPABASE_SECRET_KEY: "synthetic-private-injected",
  QWERTY_SITE_URL: "https://qwerty.localhost",
};
const missingRootNotice = "../../.env.local not found. Continuing without it.\n";
const dotenv = (values) => Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n") + "\n";

function fixture(mode, { rootPresent = true } = {}) {
  const args = webPackage.scripts[mode].split(" ");
  assert.deepEqual(args, [
    "node", "scripts/next-with-workspace-env.mjs", mode,
  ], `${mode} must load the optional workspace root without a dotenv CLI flag`);

  // These are new test-owned files containing only invented values, not project credentials.
  const scratch = path.join(repository, ".pi");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(path.join(scratch, "startup-env."));
  const app = path.join(root, "apps/web");
  const cli = path.join(app, "node_modules/next/dist/bin/next");
  mkdirSync(path.dirname(cli), { recursive: true });
  mkdirSync(path.join(app, "scripts"), { recursive: true });
  writeFileSync(path.join(app, "scripts/next-with-workspace-env.mjs"),
    readFileSync(path.join(web, "scripts/next-with-workspace-env.mjs"), "utf8"));
  const rootText = dotenv(rootValues);
  const webText = dotenv(webValues);
  const rootFile = path.join(root, ".env.local");
  const webFile = path.join(app, ".env.local");
  if (rootPresent) writeFileSync(rootFile, rootText);
  writeFileSync(webFile, webText);
  writeFileSync(cli, `
const { loadEnvConfig } = require(${JSON.stringify(envHelper)});
loadEnvConfig(process.cwd(), process.argv[2] === "dev", { info() {}, error() { process.stderr.write("fixture-env-error\\n"); } });
const variants = ${JSON.stringify({ root: rootValues, web: webValues, injected: injectedValues })};
const source = (name) => Object.entries(variants).find(([, values]) => values[name] === process.env[name])?.[0] ?? "absent";
const output = {
  mode: process.argv[2], args: process.argv.slice(3),
  urlSource: source("NEXT_PUBLIC_SUPABASE_URL"), publicKeySource: source("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  privateKeySource: source("SUPABASE_SECRET_KEY"), siteSource: source("QWERTY_SITE_URL"),
  webOnly: process.env.QWERTY_WEB_ONLY,
};
process.stdout.write(JSON.stringify(output) + "\\n");
if (process.argv.includes("--fixture-failure")) { process.stderr.write("fixture-next-failure\\n"); process.exitCode = 7; }
if (process.argv.includes("--fixture-fork-options")) {
  const { getParsedNodeOptions, formatNodeOptions } = require(${JSON.stringify(nextOptions)});
  const { spawnSync } = require("node:child_process");
  const { nodeOptions, execArgv } = formatNodeOptions(getParsedNodeOptions());
  const child = spawnSync(process.execPath, [...execArgv, "-e", 'process.emitWarning("fixture-warning", {code:"QWERTY_FIXTURE_WARNING"}); process.stdout.write("fork-child-started\\\\n")'], {
    env: { ...process.env, NODE_OPTIONS: nodeOptions }, encoding: "utf8",
  });
  process.stdout.write(child.stdout ?? ""); process.stderr.write(child.stderr ?? "");
  process.exitCode = child.status ?? 1;
}
`);
  return {
    run(extra = [], environment = {}) {
      const result = spawnSync(process.execPath, [...args.slice(1), ...extra], {
        cwd: app,
        // Never forward the real process environment or credentials into a test child.
        env: environment,
        encoding: "utf8",
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(readFileSync(webFile, "utf8"), webText);
      if (rootPresent) assert.equal(readFileSync(rootFile, "utf8"), rootText);
      else assert.throws(() => readFileSync(rootFile), { code: "ENOENT" });
      return result;
    },
  };
}

function expected(mode, source, args = []) {
  return JSON.stringify({
    mode, args, urlSource: source, publicKeySource: source,
    privateKeySource: source, siteSource: source, webOnly: "web-only",
  }) + "\n";
}

test("root pnpm dev retains Portless routing and the explicit site origin", () => {
  assert.equal(rootPackage.scripts.dev,
    "QWERTY_SITE_URL=https://qwerty.localhost portless qwerty pnpm --filter @qwerty/web dev");
});

for (const mode of ["dev", "build"]) {
  test(`${mode}: Next can fork without receiving a forbidden dotenv Node option`, () => {
    const args = ["--fixture-fork-options"];
    const result = fixture(mode).run(args, { NODE_OPTIONS: "--no-warnings" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected(mode, "root", args) + "fork-child-started\n");
    assert.equal(result.stderr, "");
  });

  test(`${mode}: workspace-root public and private variables precede app-local defaults`, () => {
    const result = fixture(mode).run();
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected(mode, "root"));
    assert.equal(result.stderr, "");
  });

  test(`${mode}: explicit injected variables keep priority, including the Portless origin`, () => {
    const result = fixture(mode).run([], injectedValues);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected(mode, "injected"));
    assert.equal(result.stderr, "");
  });

  test(`${mode}: a missing root preserves normal Next app-local loading`, () => {
    const result = fixture(mode, { rootPresent: false }).run();
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected(mode, "web"));
    assert.equal(result.stderr, missingRootNotice);
  });

  test(`${mode}: arguments, stdout, stderr and nonzero Next exit status are preserved`, () => {
    const args = mode === "dev"
      ? ["--port", "4137", "--hostname", "127.0.0.1", "--fixture-failure"]
      : ["--webpack", "--fixture-failure"];
    const result = fixture(mode).run(args);
    assert.equal(result.status, 7);
    assert.equal(result.stdout, expected(mode, "root", args));
    assert.equal(result.stderr, "fixture-next-failure\n");
  });
}
