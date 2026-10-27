import test from 'node:test';
import { readFileSync } from 'node:fs';
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

// Structural guards are not visual or motion acceptance; verify those in a browser.
const landingCSS = () => readFileSync('apps/web/app/landing/landing.css', 'utf8');
test('approved forest purpose and lime progress stay outside the paper receipt', () => {
  const css = landingCSS();
  assert.match(css, /\.qwerty-landing \.landing-purpose \{[^}]*background: var\(--forest\)/);
  assert.match(css, /\.qwerty-landing \.landing-progress-fill[^}]*background: var\(--lime\)/);
});

test('full and compact examples share paper, ink, scoped monospace and an unclipped tear edge', () => {
  const css = landingCSS();
  const paper = css.match(/\.qwerty-landing :is\(\.landing-turn, \.landing-hero-demo\) \{([^}]+)\}/)?.[1];
  assert.ok(paper, 'both variants must share receipt presentation');
  assert.match(paper, /background: white/);
  assert.match(paper, /color: var\(--ink\)/);
  assert.match(paper, /font-family: ui-monospace,.*monospace/);
  assert.match(paper, /overflow: visible/);
  assert.match(paper, /border-radius: 2px/);
  assert.match(css, /:is\(\.landing-turn, \.landing-hero-demo\)::after[^}]*pointer-events: none/);
  assert.match(css, /:is\(\.landing-turn, \.landing-hero-demo\)::after[^}]*background: linear-gradient/);
  assert.match(css, /\.landing-order-item[^}]*border-top: 1px dashed/);
  assert.match(css, /\.landing-hero-demo-states[^}]*border-top: 1px dashed/);
  assert.match(css, /\.landing-badge[^}]*background: none/);
  assert.doesNotMatch(css, /\.landing-(?:turn|hero-demo|payment|badge)[^{]*\{[^}]*(?:background|color): var\(--(?:forest|lime|olive|soft-lime|transfer-bg|transfer-text)\)/);
});

test('all positive motion declarations are opt-in under no-preference, not a weaker reduce override', () => {
  const css = landingCSS().replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  const declarations = [];
  let boundary = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      stack.push({ header: css.slice(boundary, i).trim(), start: i + 1 });
      boundary = i + 1;
    } else if (css[i] === '}') {
      const block = stack.pop();
      const body = css.slice(block.start, i);
      if (!body.includes('{')) {
        for (const [, property, value] of body.matchAll(/\b(animation|transition)(?:-[a-z-]+)?\s*:\s*([^;]+)/g)) {
          if (value.trim() === 'none') continue;
          declarations.push(property);
          assert.ok(stack.some(parent => parent.header === '@media (prefers-reduced-motion: no-preference)'), `${block.header}: ${property}: ${value} must opt in`);
        }
      }
      boundary = i + 1;
    }
  }
  assert.equal(declarations.length, 5, 'all five purposeful motion selectors remain defined');
});

test('compact hero example is labelled SSR content inside the hero, not a full card below it', () => {
  const html = renderToStaticMarkup(createElement(page()));
  const hero = html.match(/<section class="landing-hero"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero);
  const preview = hero.match(/<figure class="landing-hero-demo"[^>]*>([\s\S]*?)<\/figure>/)?.[1];
  assert.ok(preview, 'hero must contain a compact conceptual order');
  for (const label of ['Pedido #149', 'Preparación', 'Cobro', 'Rendición', 'Pendiente', 'Estados e importes ilustrativos']) {
    assert.ok(text(preview).includes(label), label);
  }
  assert.match(hero, /href="#como-funciona"/);
  assert.doesNotMatch(preview, /landing-state-list|landing-turn-body/);
  assert.match(landingCSS(), /@media \(max-width: 600px\)[\s\S]*\.landing-story \{ padding-top: 28px;/);
});

test('stage changes key a brief visible entrance and drive a persistent animated progress fill', () => {
  let stage = 0;
  const { LandingStory } = load('apps/web/app/landing/landing-story.tsx', { react: {
    ...React, useState: () => [stage, next => { stage = next; }],
    useRef: () => ({ current: null }), useEffect: () => {},
  } });
  const children = node => React.Children.toArray(node?.props?.children);
  const find = (node, predicate) => predicate(node) ? node : children(node).map(child => find(child, predicate)).find(Boolean);
  const first = LandingStory();
  const link = find(first, node => node?.props?.href === '#reparto' && node.props.onClick);
  link.props.onClick();
  const updated = LandingStory();
  const preview = find(updated, node => node?.props?.className === 'landing-preview-sticky');
  assert.equal(preview.props['data-active-stage'], 3);
  const fill = find(preview, node => node?.props?.className === 'landing-progress-fill');
  assert.equal(fill.props.style.transform, 'scaleX(0.8)');
  const html = renderToStaticMarkup(updated);
  assert.match(html, /data-stage="3"/);
  // A rapid reverse selection replaces the stage immediately, with no queued timer.
  find(updated, node => node?.props?.href === '#pedido' && node.props.onClick).props.onClick();
  const latest = find(LandingStory(), node => node?.props?.className === 'landing-preview-sticky');
  assert.equal(latest.props['data-active-stage'], 0);
  assert.equal(find(latest, node => node?.props?.className === 'landing-progress-fill').props.style.transform, 'scaleX(0.2)');
  const source = readFileSync('apps/web/app/landing/landing-story.tsx', 'utf8');
  assert.match(source, /className="landing-turn-body" key=\{stage\}/);
  const css = landingCSS();
  assert.match(css, /@keyframes landing-stage-enter/);
  assert.match(css, /\.landing-turn-body[^}]*animation: landing-stage-enter 360ms/);
  assert.match(css, /\.landing-progress-fill[^}]*transition: transform 420ms/);
  assert.doesNotMatch(css, /opacity:\s*0(?:[;\s}]|$)|infinite/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none; transition: none/);
});

test('observer notifications select current geometry on forward and exit-only reverse batches', () => {
  const effects = [], observers = [];
  let active = 0;
  const rectangles = [{ top: -40, bottom: 210 }, { top: 235, bottom: 700 }, { top: 900, bottom: 1300 }];
  const elements = rectangles.map((_, index) => ({
    dataset: { storyStep: String(index) }, getBoundingClientRect: () => rectangles[index],
  }));
  const originalWindow = globalThis.window, OriginalObserver = globalThis.IntersectionObserver;
  globalThis.window = { innerHeight: 800, addEventListener() {}, removeEventListener() {} };
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  };
  const entry = (index, isIntersecting) => ({ target: elements[index], isIntersecting, boundingClientRect: { ...rectangles[index] } });
  try {
    const { LandingStory } = load('apps/web/app/landing/landing-story.tsx', { react: {
      ...React, useState: () => [active, next => { active = next; }],
      useRef: () => ({ current: { querySelectorAll: () => elements } }), useEffect: callback => effects.push(callback),
    } });
    LandingStory();
    const cleanup = effects[0]();
    const notify = entries => observers[0].callback(entries);
    notify([entry(0, true), entry(1, true)]);
    assert.equal(active, 1, 'Cocina is nearest the 240px reading line');
    rectangles[0] = { top: 230, bottom: 600 };
    rectangles[1] = { top: 650, bottom: 1050 };
    notify([entry(1, false)]);
    assert.equal(active, 0, 'Pedido stayed intersecting and emits no entry on reverse');
    rectangles[0] = { top: -500, bottom: 100 };
    rectangles[1] = { top: -100, bottom: 200 };
    rectangles[2] = { top: 230, bottom: 600 };
    notify([entry(2, true)]);
    assert.equal(active, 2, 'forward selection uses the latest geometry');
    rectangles[1] = { top: 230, bottom: 600 };
    rectangles[2] = { top: 650, bottom: 1050 };
    notify([entry(2, false)]);
    assert.equal(active, 1, 'a second exit-only reverse selects the remaining chapter');
    elements[1].dataset.storyStep = '99';
    notify([entry(1, true)]);
    assert.equal(active, 1, 'invalid stage cannot replace selection');
    rectangles[1] = { top: 650, bottom: 1050 };
    notify([entry(1, false)]);
    assert.equal(active, 1, 'empty reading band keeps the latest selection');
    cleanup();
  } finally { globalThis.window = originalWindow; globalThis.IntersectionObserver = OriginalObserver; }
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
