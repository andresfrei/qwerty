import type { CheckoutCatalogRead } from "./checkout-catalog-reader";
import type { ConfiguredStorefrontRead } from "./configured-storefront";
import type { ProfileCatalog, ProfileSelection } from "./catalog-profiles";
import type { ConfiguredCart, PublicCartLine } from "./configured-cart";
import type { AcceptedOrderIntent, OrderIntent, OrderResponse, PickupOrder } from "./pickup-order-client";
import type { ConfiguredAttempt, AttemptReference } from "./pickup-attempt";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateProfileConfiguration, validateProfileSelection } from "./catalog-profiles.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { priceProfileSelection } from "./catalog-profile-pricing.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { addConfiguredVariant, changeConfiguredQuantity, configuredCartIntent, configuredCartStorageKey, isConfiguredCartLine, persistConfiguredCart, readConfiguredCart } from "./configured-cart.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { addSelectedCartItem, createCart } from "./storefront.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { validateContact, type Contact } from "./checkout-draft.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { uploadCheckoutReceipt } from "./checkout-receipt.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizeConfiguredPickupIntent } from "./configured-order-quote.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { normalizePickupIntent } from "./order-quote.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { pickupSlug, requestOrder } from "./pickup-order-client.ts";
// @ts-expect-error Native Node tests require explicit extensions.
import { readAttemptState, readConfiguredAttempt, saveConfiguredAttempt } from "./pickup-attempt.ts";

export type ConfiguredCheckoutPage = { slug: string; publicCatalog: ConfiguredStorefrontRead; legacyCatalog: CheckoutCatalogRead | null };
export type PublicCartStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export function loadScopedCart(storage: PublicCartStorage, businessId: string, slug: string) {
  const scopedKey = configuredCartStorageKey(businessId, slug);
  const scoped = storage.getItem(scopedKey);
  const key = scoped === null ? `qwerty:cart:v1:${businessId}` : scopedKey;
  const value = scoped ?? storage.getItem(key);
  const read = readConfiguredCart(JSON.parse(value ?? "null"), businessId, slug);
  if (!read.ok) throw Error("Stored cart requires review");
  return { cart: read.cart, snapshot: { key, value: value ?? "null" }, scoped: scoped !== null };
}
export function publicItemCatalog(page: ConfiguredCheckoutPage, itemId: string): ProfileCatalog | null {
  const published = page.publicCatalog;
  if (published.status !== "ok") return null;
  const configured = published.configurations[itemId];
  if (configured?.status === "ready") return configured.catalog;
  if (published.capability !== "legacy_only" && configured?.status !== "legacy") return null;
  const classic = page.legacyCatalog;
  if (classic?.status !== "ok" || classic.storefront.business_id !== published.storefront.business_id) return null;
  const item = classic.categories.flatMap(c => c.items).find(i => i.id === itemId);
  if (!item) return null;
  const groups = classic.groups.filter(g => g.item_id === itemId);
  const ids = new Set(groups.map(g => g.id));
  const businessId = item.business_id;
  const result = validateProfileConfiguration({ businessId, surchargeMinor: classic.surchargeMinor,
    items: [{ id: item.id, business_id: businessId, name: item.name, price_minor: item.price_minor, currency: item.currency, is_available: item.is_available }],
    groups: groups.map(g => ({ ...g, business_id: businessId })),
    options: classic.options.filter(o => ids.has(o.group_id)).map(o => ({ ...o, business_id: businessId })), profiles: [] });
  return result.ok ? result.value : null;
}
export const cartLineSelection = (line: PublicCartLine): ProfileSelection => isConfiguredCartLine(line) ? line.selection : { kind: "legacy", profileVersion: 0, groups: line.selection };
export function inspectConfiguredCart(cart: ConfiguredCart | null, page: ConfiguredCheckoutPage) {
  const rows = cart?.items.map(line => {
    const catalog = publicItemCatalog(page, line.id);
    const request = catalog ? { catalog, itemId: line.id, selection: cartLineSelection(line) } : null;
    const validation = request ? validateProfileSelection(request) : null;
    const price = validation?.ok && request ? priceProfileSelection(request) : null;
    const item = catalog?.items.find(i => i.id === line.id);
    const changed = !!(price?.ok && (price.unitPriceMinor !== line.unitPriceMinor || item?.currency !== line.currency));
    return { line, catalog, price, changed, valid: !!(validation?.ok && price?.ok && !changed && catalog?.businessId === cart?.businessId) };
  }) ?? [];
  const currencies = new Set(rows.map(row => row.line.currency));
  const total = rows.reduce((sum, row) => sum + BigInt(row.line.unitPriceMinor) * BigInt(row.line.quantity), BigInt(0));
  return { rows, valid: rows.length > 0 && rows.every(row => row.valid) && currencies.size === 1 && total <= BigInt(Number.MAX_SAFE_INTEGER) };
}
function replaceLine(cart: ConfiguredCart, key: string, selection: ProfileSelection, page: ConfiguredCheckoutPage): ConfiguredCart | null {
  const line = cart.items.find(l => l.key === key);
  const catalog = line ? publicItemCatalog(page, line.id) : null;
  if (!line || !catalog || catalog.businessId !== cart.businessId) return null;
  const request = { catalog, itemId: line.id, selection };
  const resolved = validateProfileSelection(request);
  if (!resolved.ok) return null;
  const without = { ...cart, items: cart.items.filter(l => l.key !== key) };
  if (selection.kind !== "legacy") {
    const result = addConfiguredVariant(without, request, line.quantity);
    return result.ok ? result.cart : null;
  }
  const item = resolved.value.item;
  const added = addSelectedCartItem(createCart(cart.businessId), { item, groups: catalog.groups, options: catalog.options,
    selections: selection.groups, surchargeMinor: catalog.surchargeMinor }, selection.groups).items[0];
  if (!added) return null;
  const matching = without.items.find(l => l.key === added.key);
  const quantity = line.quantity + (matching?.quantity ?? 0);
  if (quantity > 99) return null;
  return { ...cart, items: [...without.items.filter(l => l.key !== added.key), { ...added, quantity }] };
}

// The server canonicalizes v1 before storing/presenting it. Use that same view
// for new wire and old-envelope response binding, never mutate a frozen intent.
function canonicalLegacyIntent(input: unknown, slug: string): OrderIntent | null {
  const normalized = normalizePickupIntent(input, slug);
  if (!normalized.ok) return null;
  const { requestId, receiptId, contact, expected, lines } = normalized.intent;
  return { requestId, receiptId, contact, expected, lines };
}

function reviewedIntent(cart: ConfiguredCart, slug: string, contact: Contact, requestId: string, receiptId: string): AcceptedOrderIntent | null {
  const built = configuredCartIntent(cart, { requestId, receiptId,
    contact: { name: contact.name.trim(), email: contact.email.trim(), telephone: contact.telephone.trim() } });
  if (!built.ok) return null;
  if ("version" in built.intent && built.intent.version === 2) {
    const normalized = normalizeConfiguredPickupIntent(built.intent, slug);
    if (!normalized.ok) return null;
    const { slug: _slug, ...canonical } = normalized.intent;
    return canonical;
  }
  return canonicalLegacyIntent(built.intent, slug);
}

export type ConfiguredCheckoutPhase = "loading" | "idle" | "preparing" | "ready" | "uploading" | "pending" | "unknown" | "correction" | "confirmed" | "unavailable" | "storage_error";
export type ConfiguredCheckoutState = {
  phase: ConfiguredCheckoutPhase; cart: ConfiguredCart | null; contact: Contact;
  file: File | null; receiptId: string | null; attempt: ConfiguredAttempt | null;
  reference: AttemptReference | null; order: PickupOrder | null; reading: boolean; message: string;
};
export function createConfiguredCheckoutController(page: ConfiguredCheckoutPage, dependencies: {
  storage(): PublicCartStorage; fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  uuid?: () => string; onChange?: () => void;
}) {
  const fetcher = dependencies.fetcher ?? fetch;
  let alive = true, restored = false, writeGeneration = 0;
  const state: ConfiguredCheckoutState = { phase: "loading", cart: null, contact: { name: "", email: "", telephone: "" },
    file: null, receiptId: null, attempt: null, reference: null, order: null, reading: false, message: "" };
  const emit = () => { if (alive) dependencies.onChange?.(); };
  const locked = () => !alive || !restored || ["loading", "preparing", "uploading", "pending", "unknown", "confirmed", "storage_error"].includes(state.phase);
  const business = () => page.publicCatalog.status === "ok" ? page.publicCatalog.storefront.business_id : state.attempt?.businessId ?? state.reference?.businessId;
  const persist = (cart: ConfiguredCart) => {
    try { if (persistConfiguredCart((key, value) => dependencies.storage().setItem(key, value), cart)) { state.cart = cart; return true; } } catch { /* safe refusal */ }
    state.phase = "storage_error"; state.message = "No pudimos guardar el carrito. Conservamos tus elecciones."; return false;
  };
  function saveAttempt(attempt: ConfiguredAttempt) {
    try { return saveConfiguredAttempt(dependencies.storage(), attempt); } catch { return false; }
  }
  function updateAttempt(status: ConfiguredAttempt["status"], correction?: ConfiguredAttempt["correction"]) {
    if (!state.attempt) return;
    const { correction: _old, ...previous } = state.attempt;
    state.attempt = { ...previous, status, ...(correction ? { correction } : {}) };
    if (!saveAttempt(state.attempt)) state.message = "No pudimos guardar el estado. Conservá esta página y consultá la misma referencia.";
  }
  function result(response: OrderResponse, token: number, readOnly = false) {
    if (!alive || token !== writeGeneration) return;
    if (response.status === "confirmed") {
      writeGeneration++; state.phase = "confirmed"; state.order = response.order;
      updateAttempt("confirmed");
      const snapshot = state.attempt?.cartSnapshot;
      if (snapshot && state.cart) {
        try {
          const storage = dependencies.storage();
          const current = loadScopedCart(storage, state.cart.businessId, page.slug).snapshot;
          if (current.key === snapshot.key && current.value === snapshot.value) {
            // Keep a scoped empty v3 tombstone: no fallback to an older v1 cart.
            if (persistConfiguredCart((key, value) => storage.setItem(key, value), { ...state.cart, items: [] })) state.cart = { ...state.cart, items: [] };
            else state.message = "Pedido confirmado. No pudimos limpiar el carrito; no lo vuelvas a enviar.";
          }
        } catch { state.message = "Pedido confirmado. No pudimos limpiar el carrito; no lo vuelvas a enviar."; }
      }
    } else if (response.status === "correctable" && state.attempt) {
      state.phase = "correction"; updateAttempt("correction", response.code);
      state.message = "Revisá explícitamente precio, opciones y contacto antes de confirmar la misma referencia.";
    } else {
      state.phase = state.attempt?.status === "correction" ? "correction" : "unknown";
      if (state.phase === "unknown" && !readOnly) updateAttempt("unknown");
      state.message = response.status === "session" ? "Necesitás la sesión original. No creamos otra para recuperar." : "Resultado sin confirmar. Consultá la misma referencia; no vuelvas a enviar.";
    }
    emit();
  }
  async function recover() {
    if (!alive || !restored || state.phase === "confirmed" || state.reading || (!state.attempt && !state.reference)) return;
    const frozenIntent = state.attempt?.intent;
    const intent = frozenIntent && !("version" in frozenIntent && frozenIntent.version === 2)
      ? canonicalLegacyIntent(frozenIntent, page.slug) : frozenIntent;
    if (frozenIntent && !intent) return;
    const reference = state.reference;
    const requestId = intent?.requestId ?? reference?.requestId;
    if (!requestId) return;
    state.reading = true; emit(); const token = writeGeneration;
    const response = await requestOrder({ kind: "recover", slug: page.slug, requestId,
      receiptId: intent?.receiptId ?? reference?.receiptId, ...(intent ? { intent } : {}) }, fetcher);
    if (!alive || token !== writeGeneration) return;
    state.reading = false; result(response, token, true);
  }
  return {
    snapshot: (): ConfiguredCheckoutState => ({ ...state, cart: state.cart ? structuredClone(state.cart) : null,
      contact: { ...state.contact }, attempt: state.attempt ? structuredClone(state.attempt) : null,
      order: state.order ? structuredClone(state.order) : null }),
    async restore() {
      if (restored || !alive) return;
      try {
        if (!pickupSlug(page.slug) || page.publicCatalog.status === "ok" && page.publicCatalog.storefront.slug !== page.slug) throw Error("scope");
        const storage = dependencies.storage();
        const frozen = readConfiguredAttempt(storage, page.slug);
        if (!frozen.ok) throw Error("attempt");
        state.attempt = frozen.attempt;
        if (state.attempt) {
          if (business() !== state.attempt.businessId) throw Error("scope");
          state.contact = { ...state.attempt.intent.contact }; state.receiptId = state.attempt.intent.receiptId;
        } else {
          const old = readAttemptState(() => storage, page.slug);
          if (old.unavailable || storage.getItem(`qwerty:pickup:v1:${page.slug}`) !== null && !old.reference) throw Error("attempt");
          state.reference = old.reference;
          if (old.reference && business() !== old.reference.businessId) throw Error("scope");
        }
        const id = business();
        if (id) {
          try { state.cart = loadScopedCart(storage, id, page.slug).cart; }
          catch (error) {
            if (!state.attempt && !state.reference) throw error;
            state.message = "El carrito guardado necesita revisión. Conservamos la referencia para consultar el pedido.";
          }
        }
        state.phase = state.attempt || state.reference ? "unknown" : page.publicCatalog.status === "ok" ? "idle" : "unavailable";
      } catch { state.phase = "storage_error"; state.message = "No pudimos restaurar datos seguros. No enviamos ningún pedido."; }
      restored = true; emit();
      if (state.phase !== "storage_error" && (state.attempt || state.reference)) await recover();
    },
    editContact(contact: Contact) { if (!locked()) { state.contact = { ...contact }; if (state.phase === "ready" && !state.receiptId) state.phase = "idle"; emit(); } },
    setFile(file: File | null) { if (!locked() && !state.attempt && !state.reference && !state.receiptId) { state.file = file; emit(); } },
    quantity(key: string, units: number) {
      if (locked() || !state.cart) return false;
      const next = changeConfiguredQuantity(state.cart, key, units);
      if (!next.ok) return false;
      const ok = persist(next.cart); if (ok && state.phase === "ready" && !state.receiptId) state.phase = "idle"; emit(); return ok;
    },
    replace(key: string, selection: ProfileSelection) {
      if (locked() || !state.cart) return false;
      const next = replaceLine(state.cart, key, selection, page);
      if (!next) return false;
      const ok = persist(next); emit(); return ok;
    },
    review() {
      if (!alive || state.phase !== "correction" || !state.attempt || !state.cart || Object.keys(validateContact(state.contact)).length) return false;
      let cart = state.cart;
      for (const line of cart.items) {
        const next = replaceLine(cart, line.key, cartLineSelection(line), page);
        if (!next) return false;
        cart = next;
      }
      if (!inspectConfiguredCart(cart, page).valid) return false;
      if (JSON.stringify(cart) !== JSON.stringify(state.cart) && !persist(cart)) { emit(); return false; }
      state.phase = "ready"; state.message = "Importe revisado. Confirmá explícitamente con el mismo comprobante y referencia."; emit(); return true;
    },
    async prepare() {
      if (locked() || state.phase === "correction" || state.attempt || state.reference || state.receiptId
        || !state.cart || !inspectConfiguredCart(state.cart, page).valid || Object.keys(validateContact(state.contact)).length) return false;
      // Pure T3 validation before any session/receipt effect. These selectors are
      // placeholders only: never persisted, transmitted or allocated as attempts.
      const placeholder = "00000000-0000-4000-8000-000000000000";
      if (!reviewedIntent(state.cart, page.slug, state.contact, placeholder, placeholder)) return false;
      state.phase = "preparing"; emit(); const token = writeGeneration;
      try {
        const response = await fetcher("/api/checkout/session", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: page.slug }) });
        const body: unknown = await response.json();
        if (!alive || token !== writeGeneration) return false;
        const ready = response.ok && !!body && typeof body === "object" && Object.keys(body).length === 1 && "ready" in body && body.ready === true;
        state.phase = ready ? "ready" : "idle"; state.message = ready ? "Sesión preparada. Adjuntá el comprobante." : "No pudimos preparar la sesión."; emit(); return ready;
      } catch { if (alive && token === writeGeneration) { state.phase = "idle"; state.message = "No pudimos preparar la sesión."; emit(); } return false; }
    },
    async upload() {
      if (!alive || state.phase !== "ready" || !state.file || state.receiptId || state.attempt || state.reference) return false;
      state.phase = "uploading"; emit(); const token = writeGeneration;
      const response = await uploadCheckoutReceipt(page.slug, state.file, fetcher);
      if (!alive || token !== writeGeneration) return false;
      state.phase = response.status === "session" ? "idle" : "ready";
      if (response.status === "staged") state.receiptId = response.receiptId;
      state.message = response.status === "staged" ? "Comprobante adjuntado. El pago no está confirmado." : "No pudimos adjuntar el comprobante. Conservamos tus datos.";
      emit(); return response.status === "staged";
    },
    async confirm() {
      if (!alive || state.phase !== "ready" || !state.cart || !state.receiptId || !inspectConfiguredCart(state.cart, page).valid || Object.keys(validateContact(state.contact)).length) return;
      const id = state.attempt?.intent.requestId ?? (dependencies.uuid ?? (() => crypto.randomUUID()))();
      const intent = reviewedIntent(state.cart, page.slug, state.contact, id, state.receiptId);
      if (!intent) return;
      try {
        const storage = dependencies.storage();
        const existing = readConfiguredAttempt(storage, page.slug);
        if (!existing.ok || existing.attempt && (!state.attempt
          || existing.attempt.businessId !== state.attempt.businessId
          || JSON.stringify(existing.attempt.intent) !== JSON.stringify(state.attempt.intent))) throw Error("attempt changed");
        const snapshot = loadScopedCart(storage, state.cart.businessId, page.slug);
        if (JSON.stringify(snapshot.cart) !== JSON.stringify(state.cart)) throw Error("cart changed");
        const attempt: ConfiguredAttempt = { version: 2, businessId: state.cart.businessId, slug: page.slug, status: "pending", intent, cartSnapshot: snapshot.snapshot };
        if (!saveConfiguredAttempt(storage, attempt)) throw Error("storage");
        state.attempt = attempt;
      } catch { state.phase = "storage_error"; state.message = "No pudimos guardar la referencia completa. No enviamos el pedido."; emit(); return; }
      state.phase = "pending"; state.message = "Confirmando compra…"; const token = ++writeGeneration; emit();
      result(await requestOrder({ kind: "submit", slug: page.slug, intent }, fetcher), token);
    },
    recover,
    dispose() { alive = false; writeGeneration++; },
  };
}
