import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");

test("storefront link uses public slug, nonempty cart and existing browse/cart wiring", () => {
  const source = read("store/storefront-client.tsx");
  assert.match(source, /slug: string/);
  assert.match(source, /href=\{`\/store\/\$\{slug\}\/checkout`\}/);
  assert.match(source, /Continuar compra/);
  assert.match(source, /cart.items.length > 0/);
  for (const helper of ["addCartItem", "setCartQuantity", "normalizePersistedCart", "reconcileCart", "persistCart", "categoryAnchorId"]) assert.ok(source.includes(helper));
  assert.match(read("store/[slug]/page.tsx"), /slug=\{result.storefront.slug\}/);
});

test("dynamic server GET only reads public checkout catalog and awaits params", () => {
  const source = read("store/[slug]/checkout/page.tsx");
  assert.match(source, /force-dynamic/);
  assert.match(source, /await params/);
  assert.match(source, /await readCheckoutCatalog\(slug\)/);
  assert.match(source, /notFound\(\)/);
  assert.match(source, /<CheckoutClient/);
  assert.doesNotMatch(source, /supabase\/|checkout\/session|signIn|cookies\(/);
});

test("UI uses tested controller only on submit, keeps controlled contact and local inflight guard", () => {
  const source = read("store/[slug]/checkout/checkout-client.tsx");
  assert.match(source, /onSubmit=\{handleSubmit\}/);
  assert.match(source, /submitCheckout\(/);
  assert.match(source, /inflight.current/);
  assert.match(source, /disabled=\{busy/);
  assert.match(source, /Todavía no se envió ningún pedido/);
  assert.match(source, /registro es opcional/);
  assert.match(source, /aria-live/);
  assert.match(source, /updateSelection\(/);
  assert.match(source, /inspectCart\(/);
  assert.match(source, /persistCart\(/);
  assert.doesNotMatch(source, /signOut|signIn|createClient|document.cookie|removeItem|fetch\(/);
  assert.doesNotMatch(source, /persistCart\([^;]*contact/s);
});
