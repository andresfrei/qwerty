import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React, { createElement } from 'react';
import { load } from './owner-first-store-fixtures.mjs';

const page = () => load('apps/web/app/page.tsx', { './landing/landing.css': {} }).default;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('public landing always offers a native Ingresar entry, with no session-dependent label', () => {
  const html = renderToStaticMarkup(createElement(page()));
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  const links = [...header.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const entry = links.filter(([, , body]) => text(body) === 'Ingresar');
  assert.equal(entry.length, 1);
  assert.match(entry[0][1], /href="\/ingresar"/);
  assert.match(entry[0][1], /landing-entry/);
  assert.doesNotMatch(header, /Iniciar sesión|Mi panel/);
  assert.match(text(header), /qwerty/);
});

test('guided story retains Qwerty identity, all readable chapters and separate illustrative financial states', () => {
  const html = renderToStaticMarkup(createElement(page()));
  assert.match(text(html), /Tus pedidos\. En orden\./);
  assert.match(text(html), /Sitio en desarrollo/);
  assert.match(html, /class="qwerty-landing"/);
  for (const chapter of ['pedido', 'cocina', 'cobro', 'reparto', 'cierre']) {
    assert.match(html, new RegExp(`id="${chapter}"`));
    assert.match(html, new RegExp(`href="#${chapter}"`));
  }
  assert.match(html, /id="como-funciona"/);
  assert.match(text(html), /Pedido #149/);
  assert.match(text(html), /Pendiente de confirmar/);
  assert.match(text(html), /Esperando rendición/);
  assert.match(text(html), /Vista conceptual · Estados e importes ilustrativos/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<iframe|autoplay|Empezar gratis/);
});

test('landing remains synchronous and renders useful content without a session or browser APIs', () => {
  const Home = page();
  assert.notEqual(Home.constructor.name, 'AsyncFunction');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests++; throw Error('public render must not fetch identity'); };
  try {
    const html = renderToStaticMarkup(createElement(Home));
    assert.equal(requests, 0);
    assert.match(text(html), /Del pedido al cierre/);
    assert.match(text(html), /El comprobante no confirma el cobro/);
    assert.match(html, /href="\/ingresar"/);
    assert.match(html, /href="#como-funciona"/);
  } finally { globalThis.fetch = originalFetch; }
});

// Deterministic observer wiring, not a substitute for rendered browser geometry.
test('reading band uses viewport-height pixels and is rebuilt on resize', () => {
  const effects = [], observers = [], listeners = new Map();
  const originalWindow = globalThis.window, OriginalObserver = globalThis.IntersectionObserver;
  const elements = [{ dataset: { storyStep: '0' } }, { dataset: { storyStep: '1' } }];
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.elements = []; observers.push(this); }
    observe(element) { this.elements.push(element); }
    disconnect() { this.disconnected = true; }
  }
  const host = { innerHeight: 800, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  globalThis.window = host;
  globalThis.IntersectionObserver = Observer;
  try {
    const { LandingStory } = load('apps/web/app/landing/landing-story.tsx', { react: {
      ...React,
      useState: initial => [initial, () => {}],
      useRef: () => ({ current: { querySelectorAll: () => elements } }),
      useEffect: callback => { effects.push(callback); },
    } });
    LandingStory();
    const cleanup = effects[0]();
    assert.equal(observers[0].options.rootMargin, '-120px 0px -360px 0px');
    assert.deepEqual(observers[0].elements, elements);
    assert.equal(typeof listeners.get('resize'), 'function');
    host.innerHeight = 640;
    listeners.get('resize')();
    assert.equal(observers[0].disconnected, true);
    assert.equal(observers[1].options.rootMargin, '-96px 0px -288px 0px');
    assert.deepEqual(observers[1].elements, elements);
    cleanup();
    assert.equal(observers[1].disconnected, true);
    assert.equal(listeners.has('resize'), false);
  } finally { globalThis.window = originalWindow; globalThis.IntersectionObserver = OriginalObserver; }
});
