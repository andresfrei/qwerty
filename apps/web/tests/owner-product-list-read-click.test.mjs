import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { load, id } from "./owner-first-store-fixtures.mjs";

test("read controls forward optional UI click without replacing guarded destinations", () => {
  const session = { locked: () => false, canLeaveSaved: () => true, subscribe: () => () => {}, version: () => 0 };
  const hooks = { ...React, useContext: () => session, useSyncExternalStore: (_subscribe, get) => get() };
  const { CatalogProductReadLink } = load("apps/web/app/owner/catalog/catalog-product-filters.tsx", { react: hooks });
  const { CatalogInspectionLink } = load("apps/web/app/owner/catalog/catalog-form-navigation.tsx", { react: hooks });
  const href = `/owner/catalog/items?businessId=${id}`, onClick = () => {};
  const props = { href, businessId: id, children: "Aplicar filtros", onClick };
  const ordinary = CatalogProductReadLink(props);
  assert.equal(ordinary.type.name, "CatalogLink"); assert.equal(ordinary.props.onClick, onClick); assert.equal(ordinary.props.href, href);
  session.locked = () => true;
  const inspect = CatalogProductReadLink(props);
  assert.equal(inspect.type.name, "CatalogInspectionLink"); assert.equal(inspect.props.onClick, onClick);
  const saved = CatalogInspectionLink(props);
  assert.equal(saved.type, "a"); assert.equal(saved.props["data-catalog-confirmed-get"], id); assert.equal(saved.props.onClick, onClick);
  session.canLeaveSaved = () => false;
  const uncertain = CatalogInspectionLink(props);
  assert.equal(uncertain.type.name, "CatalogLink"); assert.equal(uncertain.props.inspectionBusinessId, id);
  assert.equal(uncertain.props.prefetch, false); assert.equal(uncertain.props.onClick, onClick);
});
