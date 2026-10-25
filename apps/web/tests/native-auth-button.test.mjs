import assert from "node:assert/strict";
import test from "node:test";
import { hydrationPreparation } from "./native-feedback-hydration-fixture.mjs";

test("actual OwnerShell SSR already owns native logout labels, reserve and status", () => {
  const html = hydrationPreparation.markup;
  const form = html.match(/<form\b[^>]*>/)?.[0];
  assert.match(form ?? "", /action="\/auth\/logout"/);
  assert.match(form ?? "", /method="post"/);
  assert.match(html, /<button type="submit" class="async-action [^"]+" data-native-auth-feedback="" aria-busy="false">/);
  assert.equal((html.match(/class="async-action-content"/g) ?? []).length, 1);
  assert.equal((html.match(/class="async-action-reserve"/g) ?? []).length, 2);
  assert.match(html, /aria-hidden="true" class="async-action-reserve">Cerrando sesión…/);
  assert.match(html, /class="async-action-label">Cerrar sesión<\/span>/);
  assert.match(html, /data-native-auth-feedback-status="" class="async-action-status" role="status" aria-live="polite" aria-atomic="true"><\/span>/);
  assert.doesNotMatch(html, /disabled=""|async-action-spinner/);
});
