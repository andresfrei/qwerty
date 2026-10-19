-- NOT EXECUTED. Future T4c only, after new reviewed target-specific consent.
-- Run with an operator able to SET ROLE; no extensions or private config needed.
-- Entire fixture subtransaction is unconditionally rolled back, including on error.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
DO $proof$
DECLARE
  buyer uuid := '81000000-0000-4000-8000-000000000001';
  owner_actor uuid := '81000000-0000-4000-8000-000000000002';
  stranger uuid := '81000000-0000-4000-8000-000000000003';
  business uuid := '81000000-0000-4000-8000-000000000010';
  other_business uuid := '81000000-0000-4000-8000-000000000011';
  receipt uuid := '81000000-0000-4000-8000-000000000020';
  item uuid := '81000000-0000-4000-8000-000000000030';
  intent jsonb;
  quote jsonb;
  catalog jsonb;
  result jsonb;
  created jsonb;
  receipts_before jsonb;
  orders_before jsonb;
  object_count bigint;
  receipt_count bigint;
  order_count bigint;
  visible_count bigint;
  denied boolean;
  completed boolean := false;
  role_name text;
  scenario text;
BEGIN
  -- Effective privileges include PUBLIC and inherited-role grants naturally.
  -- INVOKER downstream table denials can also raise 42501, so invocation
  -- failures alone cannot prove that function EXECUTE is denied.
  IF has_function_privilege('anon', 'public.pickup_order_catalog(uuid,text)', 'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'anon catalog EXECUTE must be denied';
  END IF;
  IF has_function_privilege('authenticated', 'public.pickup_order_catalog(uuid,text)', 'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'authenticated catalog EXECUTE must be denied';
  END IF;
  IF has_function_privilege('service_role', 'public.pickup_order_catalog(uuid,text)', 'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service catalog EXECUTE must be allowed';
  END IF;
  IF has_function_privilege('anon', 'public.finalize_pickup_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'anon finalizer EXECUTE must be denied';
  END IF;
  IF has_function_privilege('authenticated', 'public.finalize_pickup_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'authenticated finalizer EXECUTE must be denied';
  END IF;
  IF has_function_privilege('service_role', 'public.finalize_pickup_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service finalizer EXECUTE must be allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (buyer, owner_actor, stranger))
     OR EXISTS (SELECT 1 FROM public.businesses WHERE id IN (business, other_business))
     OR EXISTS (SELECT 1 FROM public.guest_receipts WHERE id = receipt)
     OR EXISTS (SELECT 1 FROM public.catalog_items WHERE id = item)
     OR EXISTS (SELECT 1 FROM public.catalog_option_groups WHERE id = '81000000-0000-4000-8000-000000000050')
     OR EXISTS (SELECT 1 FROM public.catalog_options WHERE id = '81000000-0000-4000-8000-000000000051')
     OR EXISTS (SELECT 1 FROM public.business_storefronts WHERE slug = 'proof-pickup-81000000') THEN
    RAISE EXCEPTION 'fixture collision; no adoption or cleanup allowed';
  END IF;
  SELECT count(*) INTO receipt_count FROM public.guest_receipts;
  SELECT count(*) INTO order_count FROM public.pickup_orders;
  SELECT count(*) INTO object_count FROM storage.objects WHERE bucket_id = 'guest-receipts';
  BEGIN
    INSERT INTO auth.users(id, aud, role, email, email_confirmed_at, is_anonymous,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES
      (buyer, 'authenticated', 'authenticated', NULL, NULL, true, '{}', '{}', now(), now()),
      (owner_actor, 'authenticated', 'authenticated', 'owner-81000000@fixture.invalid', now(), false, '{}', '{}', now(), now()),
      (stranger, 'authenticated', 'authenticated', 'contact@fixture.invalid', now(), false, '{}', '{}', now(), now());
    INSERT INTO public.businesses(id, owner_id, name)
      VALUES (business, owner_actor, 'Proof only'), (other_business, stranger, 'Other proof only');
    INSERT INTO public.business_storefronts(business_id, slug, display_name, is_published)
      VALUES (business, 'proof-pickup-81000000', 'Proof only', true);
    INSERT INTO public.catalog_items(id, business_id, name, price_minor, currency)
      VALUES (item, business, 'Proof item', 1000, 'ARS');
    INSERT INTO public.catalog_option_groups(id, business_id, item_id, name, selection_mode, min_select, max_select)
      VALUES ('81000000-0000-4000-8000-000000000050', business, item, 'Optional', 'distinct', 0, 1);
    INSERT INTO public.catalog_options(id, business_id, group_id, name, price_delta_minor)
      VALUES ('81000000-0000-4000-8000-000000000051', business,
        '81000000-0000-4000-8000-000000000050', 'Extra', 100);
    INSERT INTO public.guest_receipts(id, actor_id, business_id, object_path, content_type, size_bytes, sha256)
      VALUES (receipt, buyer, business, business::text || '/' || buyer::text || '/' || receipt::text,
        'image/png', 1, repeat('a', 64));
    -- Metadata-only fixture; no Storage object or real HTTP upload is implied.
    intent := jsonb_build_object('version', 1, 'slug', 'proof-pickup-81000000',
      'requestId', '81000000-0000-4000-8000-000000000040', 'receiptId', receipt,
      'contact', jsonb_build_object('name', 'Proof buyer', 'email', 'contact@fixture.invalid', 'telephone', '+54 111'),
      'expected', jsonb_build_object('currency', 'ARS', 'totalMinor', 1000),
      'lines', jsonb_build_array(jsonb_build_object('itemId', item, 'quantity', 1, 'selection', '[]'::jsonb)));
    SET LOCAL ROLE service_role;
    catalog := public.pickup_order_catalog(business, 'proof-pickup-81000000');
    IF catalog->>'surchargeMinor' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'default settings'; END IF;
    quote := jsonb_build_object('version', 1, 'snapshotFingerprint', catalog->>'fingerprint',
      'businessId', business, 'currency', 'ARS', 'totalMinor', 1000, 'contact', intent->'contact',
      'lines', jsonb_build_array(jsonb_build_object('itemId', item, 'quantity', 1, 'selection', '[]'::jsonb,
        'name', 'Proof item', 'currency', 'ARS', 'unitPriceMinor', 1000, 'lineTotalMinor', 1000,
        'surchargeMinor', 0, 'selectionText', '')));
    -- Unconsumed receipt must still reject a different actor via composite FK.
    denied := false;
    BEGIN
      INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id, intent, quote, currency, total_minor)
        VALUES (stranger, business, gen_random_uuid(), receipt, intent, quote, 'ARS', 1000);
    EXCEPTION WHEN foreign_key_violation THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'composite actor/business receipt FK missing'; END IF;
    denied := false;
    BEGIN
      INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id, intent, quote, currency, total_minor)
        VALUES (buyer, other_business, gen_random_uuid(), receipt, intent, quote, 'ARS', 1000);
    EXCEPTION WHEN foreign_key_violation THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'cross-business receipt FK missing'; END IF;
    RESET ROLE;
    SELECT to_jsonb(r) INTO receipts_before FROM public.guest_receipts r WHERE id = receipt;

    -- Supplement the effective ACL assertions above with actual call denials.
    -- A 42501 here does not identify the failing privilege boundary by itself.
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      EXECUTE format('SET LOCAL ROLE %I', role_name);
      PERFORM set_config('request.jwt.claim.sub', buyer::text, true);
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', buyer, 'role', role_name, 'is_anonymous', true)::text, true);
      denied := false;
      BEGIN
        PERFORM public.finalize_pickup_order(buyer, business, intent, quote);
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'browser RPC accepted'; END IF;
      denied := false;
      BEGIN
        PERFORM public.pickup_order_catalog(business, 'proof-pickup-81000000');
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'browser catalog RPC accepted'; END IF;
      denied := false;
      BEGIN
        INSERT INTO public.pickup_orders DEFAULT VALUES;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'browser insert accepted'; END IF;
      RESET ROLE;
      IF (SELECT count(*) FROM public.pickup_orders) <> order_count
         OR (SELECT count(*) FROM public.guest_receipts) <> receipt_count + 1
         OR (SELECT to_jsonb(r) FROM public.guest_receipts r WHERE id = receipt) IS DISTINCT FROM receipts_before
         OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'guest-receipts') <> object_count THEN
        RAISE EXCEPTION 'denial changed rows/receipt/counters';
      END IF;
    END LOOP;

    FOREACH scenario IN ARRAY ARRAY['invalid_receipt', 'catalog_changed', 'mixed_currency', 'invalid_quote'] LOOP
      SET LOCAL ROLE service_role;
      CASE scenario
        WHEN 'invalid_receipt' THEN
          result := public.finalize_pickup_order(stranger, business, intent, quote);
        WHEN 'catalog_changed' THEN
          result := public.finalize_pickup_order(buyer, business, intent,
            quote || jsonb_build_object('snapshotFingerprint', repeat('b', 64)));
        WHEN 'mixed_currency' THEN
          result := public.finalize_pickup_order(buyer, business, intent,
            jsonb_set(quote, '{lines,0,currency}', '"USD"'));
        WHEN 'invalid_quote' THEN
          result := public.finalize_pickup_order(buyer, business, intent, NULL);
      END CASE;
      RESET ROLE;
      IF result->>'code' IS DISTINCT FROM scenario THEN RAISE EXCEPTION 'wrong rejection: %', scenario; END IF;
      IF (SELECT count(*) FROM public.pickup_orders) <> order_count
         OR (SELECT count(*) FROM public.guest_receipts) <> receipt_count + 1
         OR (SELECT to_jsonb(r) FROM public.guest_receipts r WHERE id = receipt) IS DISTINCT FROM receipts_before
         OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'guest-receipts') <> object_count THEN
        RAISE EXCEPTION 'rejection changed rows/receipt/counters: %', scenario;
      END IF;
    END LOOP;

    -- Restore each mutation with a subtransaction, never by guessing old values.
    FOREACH scenario IN ARRAY ARRAY['name', 'price', 'currency', 'availability', 'settings',
      'group_name', 'group_bounds', 'option_name', 'option_price', 'option_availability'] LOOP
      BEGIN
        CASE scenario
          WHEN 'name' THEN UPDATE public.catalog_items SET name = 'Changed' WHERE id = item;
          WHEN 'price' THEN UPDATE public.catalog_items SET price_minor = 1001 WHERE id = item;
          WHEN 'currency' THEN UPDATE public.catalog_items SET currency = 'USD' WHERE id = item;
          WHEN 'availability' THEN UPDATE public.catalog_items SET is_available = false WHERE id = item;
          WHEN 'settings' THEN INSERT INTO public.business_catalog_settings VALUES (business, 1);
          WHEN 'group_name' THEN UPDATE public.catalog_option_groups SET name = 'Changed' WHERE business_id = business;
          WHEN 'group_bounds' THEN UPDATE public.catalog_option_groups SET min_select = 1 WHERE business_id = business;
          WHEN 'option_name' THEN UPDATE public.catalog_options SET name = 'Changed' WHERE business_id = business;
          WHEN 'option_price' THEN UPDATE public.catalog_options SET price_delta_minor = 101 WHERE business_id = business;
          WHEN 'option_availability' THEN UPDATE public.catalog_options SET is_available = false WHERE business_id = business;
        END CASE;
        SET LOCAL ROLE service_role;
        result := public.finalize_pickup_order(buyer, business, intent, quote);
        RESET ROLE;
        IF result->>'code' IS DISTINCT FROM 'catalog_changed' THEN RAISE EXCEPTION 'fence: %', scenario; END IF;
        IF (SELECT count(*) FROM public.pickup_orders) <> order_count
           OR (SELECT to_jsonb(r) FROM public.guest_receipts r WHERE id = receipt) IS DISTINCT FROM receipts_before
           OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'guest-receipts') <> object_count THEN
          RAISE EXCEPTION 'fence changed durable rows: %', scenario;
        END IF;
        RAISE SQLSTATE 'QW002' USING MESSAGE = 'restore catalog mutation';
      EXCEPTION WHEN SQLSTATE 'QW002' THEN NULL;
      END;
    END LOOP;
    UPDATE public.business_storefronts SET is_published = false WHERE business_id = business;
    SET LOCAL ROLE service_role;
    result := public.finalize_pickup_order(buyer, business, intent, quote);
    RESET ROLE;
    IF result->>'code' IS DISTINCT FROM 'unavailable' THEN RAISE EXCEPTION 'publication fence'; END IF;
    UPDATE public.business_storefronts SET is_published = true WHERE business_id = business;
    SET LOCAL ROLE service_role;
    created := public.finalize_pickup_order(buyer, business, intent, quote);
    RESET ROLE;
    IF created->>'code' IS DISTINCT FROM 'created'
       OR created->'order'->>'fulfillment_state' IS DISTINCT FROM 'pendiente_de_pago'
       OR created->'order'->>'payment_state' IS DISTINCT FROM 'pendiente' THEN
      RAISE EXCEPTION 'creation contract';
    END IF;
    orders_before := created->'order';
    -- Direct trusted-writer probes establish durable constraints, not just RPC locks.
    SET LOCAL ROLE service_role;
    denied := false;
    BEGIN
      INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id, intent, quote, currency, total_minor)
        VALUES (stranger, business, gen_random_uuid(), receipt, intent, quote, 'ARS', 1000);
    EXCEPTION WHEN unique_violation THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'receipt binding/uniqueness missing'; END IF;
    denied := false;
    BEGIN
      INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id, intent, quote, currency, total_minor)
        VALUES (buyer, business, NULL, receipt, intent, quote, 'ARS', 1000);
    EXCEPTION WHEN not_null_violation THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'nullable attempt key'; END IF;
    RESET ROLE;
    denied := false;
    BEGIN
      DELETE FROM public.guest_receipts WHERE id = receipt;
    EXCEPTION WHEN foreign_key_violation THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'receipt reference must RESTRICT delete'; END IF;
    UPDATE public.business_storefronts SET is_published = false WHERE business_id = business;
    UPDATE public.catalog_items SET price_minor = 9999, is_available = false WHERE id = item;
    SET LOCAL ROLE service_role;
    result := public.finalize_pickup_order(buyer, business, intent, NULL);
    IF result->>'code' IS DISTINCT FROM 'replayed' OR result->'order' IS DISTINCT FROM orders_before THEN
      RAISE EXCEPTION 'replay must precede publication/reprice';
    END IF;
    result := public.finalize_pickup_order(buyer, business,
      jsonb_set(intent, '{contact,name}', '"Different"'), NULL);
    IF result->>'code' IS DISTINCT FROM 'idempotency_conflict' THEN RAISE EXCEPTION 'intent conflict'; END IF;
    result := public.finalize_pickup_order(buyer, business,
      jsonb_set(intent, '{requestId}', '"81000000-0000-4000-8000-000000000041"'), NULL);
    IF result->>'code' IS DISTINCT FROM 'receipt_used' THEN RAISE EXCEPTION 'receipt uniqueness'; END IF;
    RESET ROLE;

    SET LOCAL ROLE anon;
    denied := false;
    BEGIN
      PERFORM 1 FROM public.pickup_orders WHERE business_id = business;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'anon order SELECT accepted'; END IF;
    RESET ROLE;
    -- Buyer OR current confirmed owning-business owner, never typed email authority.
    FOREACH role_name IN ARRAY ARRAY[buyer::text, owner_actor::text, stranger::text] LOOP
      PERFORM set_config('request.jwt.claim.sub', role_name, true);
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', role_name, 'role', 'authenticated',
        'email', 'contact@fixture.invalid', 'email_confirmed_at', '2026-01-01',
        'user_metadata', jsonb_build_object('is_owner', true))::text, true);
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO visible_count FROM public.pickup_orders WHERE business_id = business;
      RESET ROLE;
      IF visible_count <> (CASE WHEN role_name = stranger::text THEN 0 ELSE 1 END) THEN
        RAISE EXCEPTION 'private reader boundary';
      END IF;
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', owner_actor::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', owner_actor, 'role', 'authenticated',
      'email_confirmed_at', '2026-01-01', 'user_metadata', jsonb_build_object('is_owner', true))::text, true);
    UPDATE auth.users SET email_confirmed_at = NULL WHERE id = owner_actor;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible_count FROM public.pickup_orders WHERE business_id = business;
    RESET ROLE;
    IF visible_count <> 0 THEN RAISE EXCEPTION 'current confirmation required'; END IF;
    UPDATE auth.users SET email_confirmed_at = now(), deleted_at = now() WHERE id = owner_actor;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible_count FROM public.pickup_orders WHERE business_id = business;
    RESET ROLE;
    IF visible_count <> 0 THEN RAISE EXCEPTION 'deleted owner denied'; END IF;
    UPDATE auth.users SET deleted_at = NULL WHERE id = owner_actor;
    UPDATE public.businesses SET owner_id = stranger WHERE id = business;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible_count FROM public.pickup_orders WHERE business_id = business;
    RESET ROLE;
    IF visible_count <> 0 THEN RAISE EXCEPTION 'former owner still authorized'; END IF;
    PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible_count FROM public.pickup_orders WHERE business_id = business;
    RESET ROLE;
    IF visible_count <> 1 THEN RAISE EXCEPTION 'current confirmed owner not authorized'; END IF;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format('SET LOCAL ROLE %I', role_name);
      denied := false;
      BEGIN
        UPDATE public.pickup_orders SET quote = '{}' WHERE business_id = business;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'immutable quote UPDATE accepted'; END IF;
      denied := false;
      BEGIN
        DELETE FROM public.pickup_orders WHERE business_id = business;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'order DELETE accepted'; END IF;
      denied := false;
      BEGIN
        UPDATE public.guest_receipts SET state = 'staged' WHERE id = receipt;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'receipt UPDATE accepted'; END IF;
      RESET ROLE;
    END LOOP;
    IF (SELECT count(*) FROM public.pickup_orders) <> order_count + 1
       OR (SELECT count(*) FROM public.guest_receipts) <> receipt_count + 1
       OR (SELECT to_jsonb(r) FROM public.guest_receipts r WHERE id = receipt) IS DISTINCT FROM receipts_before
       OR (SELECT to_jsonb(o) FROM public.pickup_orders o WHERE business_id = business) IS DISTINCT FROM orders_before
       OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'guest-receipts') <> object_count THEN
      RAISE EXCEPTION 'final immutable rows/counters';
    END IF;
    completed := true;
    RAISE SQLSTATE 'QW001' USING MESSAGE = 'owned proof rollback';
  EXCEPTION WHEN SQLSTATE 'QW001' THEN
    IF NOT completed THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (buyer, owner_actor, stranger))
     OR EXISTS (SELECT 1 FROM public.businesses WHERE id IN (business, other_business))
     OR EXISTS (SELECT 1 FROM public.pickup_orders WHERE business_id = business)
     OR (SELECT count(*) FROM public.guest_receipts) <> receipt_count
     OR (SELECT count(*) FROM public.pickup_orders) <> order_count
     OR (SELECT count(*) FROM storage.objects WHERE bucket_id = 'guest-receipts') <> object_count THEN
    RAISE EXCEPTION 'rollback residue';
  END IF;
  RAISE NOTICE 'pickup SQL contract assertions completed and rolled back';
END;
$proof$;
ROLLBACK;
