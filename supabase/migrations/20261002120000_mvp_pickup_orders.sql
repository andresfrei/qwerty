-- SOURCE ONLY: T4c requires independent review and NEW target-specific consent.
BEGIN;

-- Consumption is a unique reference, never a receipt state transition.
ALTER TABLE public.guest_receipts
  ADD CONSTRAINT guest_receipts_actor_business_id_key
  UNIQUE (actor_id, business_id, id);

CREATE TABLE public.pickup_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  intent jsonb NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
  quote jsonb NOT NULL CHECK (jsonb_typeof(quote) = 'object'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor bigint NOT NULL CHECK (total_minor BETWEEN 0 AND 9007199254740991),
  fulfillment_state text NOT NULL DEFAULT 'pendiente_de_pago'
    CHECK (fulfillment_state = 'pendiente_de_pago'),
  payment_state text NOT NULL DEFAULT 'pendiente' CHECK (payment_state = 'pendiente'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pickup_orders_attempt_key UNIQUE (actor_id, business_id, request_id),
  CONSTRAINT pickup_orders_receipt_key UNIQUE (receipt_id),
  CONSTRAINT pickup_orders_receipt_binding FOREIGN KEY (actor_id, business_id, receipt_id)
    REFERENCES public.guest_receipts(actor_id, business_id, id) ON DELETE RESTRICT
);
CREATE INDEX pickup_orders_business_created ON public.pickup_orders(business_id, created_at, id);
ALTER TABLE public.pickup_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_orders FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pickup_orders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pickup_orders TO authenticated;
GRANT SELECT, INSERT ON public.pickup_orders TO service_role;
-- No UPDATE/DELETE grants, including service. No lifecycle operation in this unit.
CREATE POLICY pickup_orders_private_read ON public.pickup_orders
FOR SELECT TO authenticated USING (
  actor_id = (SELECT auth.uid())
  OR (
    (SELECT private.owner_email_verified())
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = pickup_orders.business_id AND b.owner_id = (SELECT auth.uid())
    )
  )
);

-- Explicit read dependencies only; preserve every old grant/policy unchanged.
GRANT SELECT ON public.business_storefronts, public.business_catalog_settings,
  public.catalog_items, public.catalog_option_groups, public.catalog_options TO service_role;

CREATE FUNCTION public.pickup_order_catalog(p_business uuid, p_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  -- One statement / MVCC snapshot; include unavailable rows, defaults and names.
  WITH snapshot AS (
    SELECT jsonb_build_object(
      'version', 1, 'businessId', s.business_id, 'slug', s.slug,
      'surchargeMinor', coalesce((
        SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
        WHERE business_id = s.business_id
      ), 0),
      'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'business_id', i.business_id, 'name', i.name,
          'price_minor', i.price_minor, 'currency', i.currency, 'is_available', i.is_available
        ) ORDER BY i.id)
        FROM public.catalog_items i WHERE i.business_id = s.business_id
      ), '[]'::jsonb),
      'groups', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', g.id, 'business_id', g.business_id, 'item_id', g.item_id,
          'name', g.name, 'selection_mode', g.selection_mode,
          'min_select', g.min_select, 'max_select', g.max_select, 'sort_order', g.sort_order
        ) ORDER BY g.id)
        FROM public.catalog_option_groups g WHERE g.business_id = s.business_id
      ), '[]'::jsonb),
      'options', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id, 'business_id', o.business_id, 'group_id', o.group_id,
          'name', o.name, 'price_delta_minor', o.price_delta_minor,
          'is_available', o.is_available, 'sort_order', o.sort_order
        ) ORDER BY o.id)
        FROM public.catalog_options o WHERE o.business_id = s.business_id
      ), '[]'::jsonb)
    ) AS payload
    FROM public.business_storefronts s
    WHERE s.business_id = p_business AND s.slug = p_slug AND s.is_published
  )
  SELECT payload || jsonb_build_object(
    'fingerprint', encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
  ) FROM snapshot;
$$;
REVOKE EXECUTE ON FUNCTION public.pickup_order_catalog(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickup_order_catalog(uuid, text) TO service_role;

CREATE FUNCTION public.finalize_pickup_order(
  p_actor uuid, p_business uuid, p_intent jsonb, p_quote jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  existing public.pickup_orders;
  catalog jsonb;
  v_request_id uuid;
  v_receipt_id uuid;
BEGIN
  -- Separate PL/pgSQL statements need fresh snapshots after a lock wait.
  -- Repeatable-read/serializable callers must not pretend a hidden winner is absent.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'pickup_requires_read_committed' USING ERRCODE = '25001';
  END IF;
  IF p_actor IS NULL OR p_business IS NULL OR p_intent IS NULL
     OR p_intent->>'version' IS DISTINCT FROM '1'
     OR jsonb_typeof(p_intent->'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_intent->'lines') NOT BETWEEN 1 AND 100
     OR octet_length(p_intent::text) > 1048576 THEN
    RETURN jsonb_build_object('code', 'invalid_request');
  END IF;
  v_request_id := (p_intent->>'requestId')::uuid;
  v_receipt_id := (p_intent->>'receiptId')::uuid;
  IF v_request_id IS NULL OR v_receipt_id IS NULL THEN
    RETURN jsonb_build_object('code', 'invalid_request');
  END IF;

  -- Receipt first, then attempt. Hash collisions only add serialization.
  -- Advisory locks do not lock catalog or reserve inventory. Durable unique
  -- constraints remain authoritative even for a trusted writer not using RPC.
  PERFORM pg_advisory_xact_lock(8101, hashtext(v_receipt_id::text));
  PERFORM pg_advisory_xact_lock(8102, hashtext(
    p_actor::text || ':' || p_business::text || ':' || v_request_id::text));

  SELECT * INTO existing FROM public.pickup_orders o
    WHERE o.actor_id = p_actor AND o.business_id = p_business AND o.request_id = v_request_id;
  IF FOUND THEN
    IF existing.intent IS DISTINCT FROM p_intent THEN
      RETURN jsonb_build_object('code', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('code', 'replayed', 'order', to_jsonb(existing));
  END IF;
  IF EXISTS (SELECT 1 FROM public.pickup_orders o WHERE o.receipt_id = v_receipt_id) THEN
    RETURN jsonb_build_object('code', 'receipt_used');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guest_receipts r
    WHERE r.id = v_receipt_id AND r.actor_id = p_actor AND r.business_id = p_business
      AND r.state = 'staged'
  ) THEN
    RETURN jsonb_build_object('code', 'invalid_receipt');
  END IF;

  -- Trusted Node MUST normalize intent, resolve replay, then quote using the
  -- version-1 pure helper. Hash is a freshness fence, NOT a pricing certificate.
  IF p_quote IS NULL OR p_quote->>'version' IS DISTINCT FROM '1'
     OR p_quote->>'businessId' IS DISTINCT FROM p_business::text
     OR p_quote->'contact' IS DISTINCT FROM p_intent->'contact'
     OR p_quote->>'currency' IS DISTINCT FROM p_intent->'expected'->>'currency'
     OR p_quote->'totalMinor' IS DISTINCT FROM p_intent->'expected'->'totalMinor'
     OR jsonb_typeof(p_quote->'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_quote->'lines') <> jsonb_array_length(p_intent->'lines')
     OR octet_length(p_quote::text) > 1048576 THEN
    RETURN jsonb_build_object('code', 'invalid_quote');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_quote->'lines') line
    WHERE line->>'currency' IS DISTINCT FROM p_quote->>'currency'
  ) THEN
    RETURN jsonb_build_object('code', 'mixed_currency');
  END IF;
  catalog := public.pickup_order_catalog(p_business, p_intent->>'slug');
  IF catalog IS NULL THEN
    RETURN jsonb_build_object('code', 'unavailable');
  END IF;
  IF catalog->>'fingerprint' IS DISTINCT FROM p_quote->>'snapshotFingerprint' THEN
    RETURN jsonb_build_object('code', 'catalog_changed');
  END IF;

  BEGIN
    INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id,
      intent, quote, currency, total_minor)
    VALUES (p_actor, p_business, v_request_id, v_receipt_id, p_intent, p_quote,
      p_quote->>'currency', (p_quote->>'totalMinor')::bigint)
    RETURNING * INTO existing;
  EXCEPTION WHEN unique_violation THEN
    -- A non-RPC trusted writer can win the unique constraint. Never return
    -- invisible ON CONFLICT success: this new statement sees the committed row.
    SELECT * INTO existing FROM public.pickup_orders o
      WHERE o.actor_id = p_actor AND o.business_id = p_business AND o.request_id = v_request_id;
    IF FOUND THEN
      IF existing.intent IS DISTINCT FROM p_intent THEN
        RETURN jsonb_build_object('code', 'idempotency_conflict');
      END IF;
      RETURN jsonb_build_object('code', 'replayed', 'order', to_jsonb(existing));
    END IF;
    IF EXISTS (SELECT 1 FROM public.pickup_orders o WHERE o.receipt_id = v_receipt_id) THEN
      RETURN jsonb_build_object('code', 'receipt_used');
    END IF;
    RAISE; -- Unknown constraint/visibility issue is not an order success.
  END;
  RETURN jsonb_build_object('code', 'created', 'order', to_jsonb(existing));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_pickup_order(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pickup_order(uuid, uuid, jsonb, jsonb) TO service_role;
COMMIT;
