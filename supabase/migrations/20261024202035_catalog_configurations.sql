-- SOURCE ONLY. Independent SQL review and target-specific T7 consent required.
-- One atomic capability boundary; no data backfill, old RPC replacement or grant replay.
BEGIN;

-- Unit A: bounded, typed JSON. Helpers are invoker-only and not Data API endpoints.
CREATE FUNCTION private.catalog_configuration_assert(p_ok boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invalid_catalog_configuration' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION private.catalog_configuration_keys(p_value jsonb, p_keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'object' THEN
    p_value ?& p_keys AND (SELECT count(*) FROM jsonb_object_keys(p_value)) = cardinality(p_keys)
    ELSE false END;
$$;

CREATE FUNCTION private.catalog_configuration_array(p_value jsonb, p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'array'
    THEN jsonb_array_length(p_value) <= p_max ELSE false END;
$$;

CREATE FUNCTION private.catalog_configuration_uuid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_typeof(p_value) = 'string' AND
    (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;

CREATE FUNCTION private.catalog_configuration_integer(p_value jsonb, p_min numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'number' THEN
    (p_value #>> '{}')::numeric BETWEEN p_min AND 9007199254740991
    AND trunc((p_value #>> '{}')::numeric) = (p_value #>> '{}')::numeric
    ELSE false END;
$$;

CREATE FUNCTION private.catalog_configuration_bounded(p_value jsonb, p_depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE entry record; child jsonb;
BEGIN
  IF p_value IS NULL OR p_depth > 12 OR octet_length(p_value::text) > 262144 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_value) = 'number' THEN
    IF abs((p_value #>> '{}')::numeric) > 1.7976931348623157e308::numeric THEN
      RETURN false; -- conservative finite-JavaScript-number bound for inactive JSON
    END IF;
  END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR entry IN SELECT * FROM jsonb_each(p_value) LOOP
      -- T1 visits object keys at depth + 1 as well as values.
      IF p_depth = 12 OR NOT private.catalog_configuration_bounded(entry.value, p_depth + 1) THEN
        RETURN false;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR child IN SELECT * FROM jsonb_array_elements(p_value) LOOP
      IF NOT private.catalog_configuration_bounded(child, p_depth + 1) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION private.catalog_configuration_shape(p_document jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  c jsonb; a jsonb; f jsonb; pick jsonb; r jsonb;
  ids text[]; orders numeric[] := '{}'; component_ids text[] := '{}';
  group_ids text[]; option_ids text[]; instances numeric := 0; picks_used integer;
BEGIN
  PERFORM private.catalog_configuration_assert(private.catalog_configuration_bounded(p_document));
  PERFORM private.catalog_configuration_assert(p_document->'schemaVersion' = '1'::jsonb);
  CASE p_document->>'kind'
  WHEN 'standard' THEN
    PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(p_document, ARRAY['schemaVersion','kind']));
  WHEN 'dozen' THEN
    PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(p_document, ARRAY['schemaVersion','kind','varietyGroupId'])
      AND private.catalog_configuration_uuid(p_document->'varietyGroupId'));
  WHEN 'pizza' THEN
    PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(p_document, ARRAY['schemaVersion','kind','sizeGroupId','flavorGroupId','matrix'])
      AND private.catalog_configuration_uuid(p_document->'sizeGroupId')
      AND private.catalog_configuration_uuid(p_document->'flavorGroupId')
      AND private.catalog_configuration_array(p_document->'matrix', 4096));
    ids := '{}';
    FOR r IN SELECT * FROM jsonb_array_elements(p_document->'matrix') LOOP
      PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(r, ARRAY['sizeOptionId','flavorOptionId','priceMinor','available'])
        AND private.catalog_configuration_uuid(r->'sizeOptionId')
        AND private.catalog_configuration_uuid(r->'flavorOptionId')
        AND private.catalog_configuration_integer(r->'priceMinor', 0)
        AND jsonb_typeof(r->'available') = 'boolean');
      PERFORM private.catalog_configuration_assert(NOT lower((r->>'sizeOptionId') || ':' || (r->>'flavorOptionId')) = ANY(ids));
      ids := array_append(ids, lower((r->>'sizeOptionId') || ':' || (r->>'flavorOptionId')));
    END LOOP;
  WHEN 'combo' THEN
    PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(p_document, ARRAY['schemaVersion','kind','components'])
      AND private.catalog_configuration_array(p_document->'components', 32));
    PERFORM private.catalog_configuration_assert(jsonb_array_length(p_document->'components') > 0);
    FOR c IN SELECT * FROM jsonb_array_elements(p_document->'components') LOOP
      PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(c, ARRAY['componentId','itemId','quantity','order','fixedGroupPicks','allowedOptions'])
        AND private.catalog_configuration_uuid(c->'componentId') AND private.catalog_configuration_uuid(c->'itemId')
        AND private.catalog_configuration_integer(c->'quantity', 1) AND private.catalog_configuration_integer(c->'order', 0)
        AND private.catalog_configuration_array(c->'fixedGroupPicks', 100)
        AND private.catalog_configuration_array(c->'allowedOptions', 100));
      PERFORM private.catalog_configuration_assert(NOT lower(c->>'componentId') = ANY(component_ids)
        AND NOT (c->>'order')::numeric = ANY(orders));
      component_ids := array_append(component_ids, lower(c->>'componentId'));
      orders := array_append(orders, (c->>'order')::numeric);
      instances := instances + (c->>'quantity')::numeric;
      PERFORM private.catalog_configuration_assert(instances <= 100);
      group_ids := '{}'; picks_used := 0;
      FOR f IN SELECT * FROM jsonb_array_elements(c->'fixedGroupPicks') LOOP
        PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(f, ARRAY['groupId','picks'])
          AND private.catalog_configuration_uuid(f->'groupId') AND private.catalog_configuration_array(f->'picks', 1000));
        PERFORM private.catalog_configuration_assert(NOT lower(f->>'groupId') = ANY(group_ids));
        group_ids := array_append(group_ids, lower(f->>'groupId'));
        option_ids := '{}';
        FOR pick IN SELECT * FROM jsonb_array_elements(f->'picks') LOOP
          picks_used := picks_used + 1;
          PERFORM private.catalog_configuration_assert(picks_used <= 1000
            AND private.catalog_configuration_keys(pick, ARRAY['optionId','quantity'])
            AND private.catalog_configuration_uuid(pick->'optionId')
            AND private.catalog_configuration_integer(pick->'quantity', 1));
          PERFORM private.catalog_configuration_assert(NOT lower(pick->>'optionId') = ANY(option_ids));
          option_ids := array_append(option_ids, lower(pick->>'optionId'));
        END LOOP;
      END LOOP;
      group_ids := '{}';
      FOR a IN SELECT * FROM jsonb_array_elements(c->'allowedOptions') LOOP
        PERFORM private.catalog_configuration_assert(private.catalog_configuration_keys(a, ARRAY['groupId','optionIds'])
          AND private.catalog_configuration_uuid(a->'groupId') AND private.catalog_configuration_array(a->'optionIds', 1000));
        PERFORM private.catalog_configuration_assert(NOT lower(a->>'groupId') = ANY(group_ids));
        group_ids := array_append(group_ids, lower(a->>'groupId'));
        option_ids := '{}';
        FOR pick IN SELECT * FROM jsonb_array_elements(a->'optionIds') LOOP
          PERFORM private.catalog_configuration_assert(private.catalog_configuration_uuid(pick));
          PERFORM private.catalog_configuration_assert(NOT lower(pick #>> '{}') = ANY(option_ids));
          option_ids := array_append(option_ids, lower(pick #>> '{}'));
        END LOOP;
      END LOOP;
    END LOOP;
  ELSE
    PERFORM private.catalog_configuration_assert(false);
  END CASE;
END;
$$;

-- Unit B: optional record, independent owner authorization, least-privilege CAS.
CREATE TABLE public.catalog_item_configurations (
  business_id uuid NOT NULL,
  item_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  is_active boolean NOT NULL,
  document jsonb NOT NULL,
  PRIMARY KEY (business_id, item_id),
  FOREIGN KEY (business_id, item_id) REFERENCES public.catalog_items(business_id, id),
  CHECK (private.catalog_configuration_bounded(document))
);
ALTER TABLE public.catalog_item_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_configurations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_item_configurations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.catalog_item_configurations TO anon, authenticated, service_role;
GRANT INSERT (business_id, item_id, is_active, document), UPDATE (is_active, document)
  ON public.catalog_item_configurations TO authenticated;
-- version is trigger-owned. No INSERT(id) on any existing table and no DELETE.
CREATE POLICY catalog_configuration_public_read ON public.catalog_item_configurations
FOR SELECT TO anon, authenticated USING (
  is_active AND EXISTS (
    SELECT 1 FROM public.catalog_items i JOIN public.business_storefronts s ON s.business_id = i.business_id
    WHERE i.business_id = catalog_item_configurations.business_id
      AND i.id = catalog_item_configurations.item_id AND i.is_available AND s.is_published
  )
);
-- Deliberately no child availability predicate: missing child never means legacy.
CREATE POLICY catalog_configuration_owner_read ON public.catalog_item_configurations
FOR SELECT TO authenticated USING (
  (SELECT private.owner_email_verified()) AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = catalog_item_configurations.business_id
      AND b.owner_id = (SELECT auth.uid())
  )
);
CREATE POLICY catalog_configuration_owner_insert ON public.catalog_item_configurations
FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.owner_email_verified()) AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = catalog_item_configurations.business_id
      AND b.owner_id = (SELECT auth.uid())
  )
);
CREATE POLICY catalog_configuration_owner_update ON public.catalog_item_configurations
FOR UPDATE TO authenticated USING (
  (SELECT private.owner_email_verified()) AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = catalog_item_configurations.business_id
      AND b.owner_id = (SELECT auth.uid())
  )
) WITH CHECK (
  (SELECT private.owner_email_verified()) AND EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = catalog_item_configurations.business_id
      AND b.owner_id = (SELECT auth.uid())
  )
);

CREATE FUNCTION private.catalog_configuration_lock(p_business uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'configuration_requires_read_committed' USING ERRCODE = '25001';
  END IF;
  PERFORM pg_advisory_xact_lock(8103, hashtext(p_business::text));
END;
$$;

CREATE FUNCTION public.save_catalog_item_configuration(
  p_business uuid, p_item uuid, p_expected_version bigint, p_is_active boolean, p_document jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.catalog_item_configurations;
BEGIN
  IF NOT private.owner_email_verified() OR NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = p_business AND b.owner_id = auth.uid()
  ) THEN RAISE EXCEPTION 'configuration_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_item IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    OR p_is_active IS NULL OR p_document IS NULL THEN
    RAISE EXCEPTION 'invalid_catalog_configuration' USING ERRCODE = '23514';
  END IF;
  IF p_expected_version = 0 THEN
    PERFORM private.catalog_configuration_lock(p_business);
    -- Plain existence check after the wait: never acquire a profile row lock
    -- under the business lock (a direct UPDATE may already hold that row).
    IF EXISTS (SELECT 1 FROM public.catalog_item_configurations
      WHERE business_id = p_business AND item_id = p_item) THEN
      RETURN jsonb_build_object('code', 'configuration_version_conflict');
    END IF;
    INSERT INTO public.catalog_item_configurations(business_id, item_id, is_active, document)
      VALUES (p_business, p_item, p_is_active, p_document) RETURNING * INTO saved;
  ELSE
    -- Ordinary CAS obtains its row lock BEFORE the BEFORE-row business guard.
    UPDATE public.catalog_item_configurations SET is_active = p_is_active, document = p_document
      WHERE business_id = p_business AND item_id = p_item AND version = p_expected_version
      RETURNING * INTO saved;
    IF NOT FOUND THEN RETURN jsonb_build_object('code', 'configuration_version_conflict'); END IF;
  END IF;
  RETURN jsonb_build_object('code', 'saved', 'profile', to_jsonb(saved));
END;
$$;

-- Unit C: relationship invariants. All reads are plain, invoker/RLS-visible reads.
CREATE FUNCTION private.catalog_configuration_references(p_business uuid, p_item uuid, d jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  n bigint; size_count bigint; flavor_count bigint;
  c jsonb; f jsonb; a jsonb; pick jsonb;
  g public.catalog_option_groups; total numeric;
  parent_currency text; child_currency text;
BEGIN
  PERFORM private.catalog_configuration_shape(d);
  SELECT count(*) INTO n FROM public.catalog_option_groups WHERE business_id = p_business AND item_id = p_item;
  PERFORM private.catalog_configuration_assert(n <= 100);
  IF d->>'kind' = 'pizza' THEN
    PERFORM private.catalog_configuration_assert(n = 2 AND (d->>'sizeGroupId')::uuid <> (d->>'flavorGroupId')::uuid);
    PERFORM private.catalog_configuration_assert(EXISTS (
      SELECT 1 FROM public.catalog_option_groups WHERE business_id = p_business AND item_id = p_item
      AND id = (d->>'sizeGroupId')::uuid AND selection_mode = 'distinct' AND min_select = 1 AND max_select = 1
    ));
    PERFORM private.catalog_configuration_assert(EXISTS (
      SELECT 1 FROM public.catalog_option_groups WHERE business_id = p_business AND item_id = p_item
      AND id = (d->>'flavorGroupId')::uuid AND selection_mode = 'distinct' AND min_select = 1 AND max_select = 2
    ));
    SELECT count(*) INTO size_count FROM public.catalog_options WHERE business_id = p_business AND group_id = (d->>'sizeGroupId')::uuid;
    SELECT count(*) INTO flavor_count FROM public.catalog_options WHERE business_id = p_business AND group_id = (d->>'flavorGroupId')::uuid;
    PERFORM private.catalog_configuration_assert(size_count > 0 AND flavor_count > 0
      AND jsonb_array_length(d->'matrix') = size_count * flavor_count);
    FOR f IN SELECT * FROM jsonb_array_elements(d->'matrix') LOOP
      PERFORM private.catalog_configuration_assert(EXISTS (
        SELECT 1 FROM public.catalog_options WHERE business_id = p_business
          AND group_id = (d->>'sizeGroupId')::uuid AND id = (f->>'sizeOptionId')::uuid
      ) AND EXISTS (
        SELECT 1 FROM public.catalog_options WHERE business_id = p_business
          AND group_id = (d->>'flavorGroupId')::uuid AND id = (f->>'flavorOptionId')::uuid
      ));
    END LOOP;
  ELSIF d->>'kind' = 'dozen' THEN
    PERFORM private.catalog_configuration_assert(n = 1 AND EXISTS (
      SELECT 1 FROM public.catalog_option_groups WHERE business_id = p_business AND item_id = p_item
      AND id = (d->>'varietyGroupId')::uuid AND selection_mode = 'quantity' AND min_select = 12 AND max_select = 12
    ));
  ELSIF d->>'kind' = 'combo' THEN
    PERFORM private.catalog_configuration_assert(n = 0);
    SELECT currency INTO parent_currency FROM public.catalog_items WHERE business_id = p_business AND id = p_item;
    FOR c IN SELECT * FROM jsonb_array_elements(d->'components') LOOP
      SELECT currency INTO child_currency FROM public.catalog_items WHERE business_id = p_business AND id = (c->>'itemId')::uuid;
      PERFORM private.catalog_configuration_assert(FOUND AND (c->>'itemId')::uuid <> p_item
        AND child_currency = parent_currency AND NOT EXISTS (
          SELECT 1 FROM public.catalog_item_configurations WHERE business_id = p_business
            AND item_id = (c->>'itemId')::uuid AND is_active AND document->>'kind' = 'combo'
        ));
      FOR a IN SELECT * FROM jsonb_array_elements(c->'allowedOptions') LOOP
        PERFORM private.catalog_configuration_assert(EXISTS (
          SELECT 1 FROM public.catalog_option_groups WHERE business_id = p_business
            AND item_id = (c->>'itemId')::uuid AND id = (a->>'groupId')::uuid
        ));
        FOR pick IN SELECT * FROM jsonb_array_elements(a->'optionIds') LOOP
          PERFORM private.catalog_configuration_assert(EXISTS (
            SELECT 1 FROM public.catalog_options WHERE business_id = p_business
              AND group_id = (a->>'groupId')::uuid AND id = (pick #>> '{}')::uuid
          ));
        END LOOP;
      END LOOP;
      FOR f IN SELECT * FROM jsonb_array_elements(c->'fixedGroupPicks') LOOP
        SELECT * INTO g FROM public.catalog_option_groups WHERE business_id = p_business
          AND item_id = (c->>'itemId')::uuid AND id = (f->>'groupId')::uuid;
        PERFORM private.catalog_configuration_assert(FOUND);
        total := 0;
        FOR pick IN SELECT * FROM jsonb_array_elements(f->'picks') LOOP
          PERFORM private.catalog_configuration_assert(EXISTS (
            SELECT 1 FROM public.catalog_options WHERE business_id = p_business
              AND group_id = g.id AND id = (pick->>'optionId')::uuid
          ) AND (g.selection_mode <> 'distinct' OR (pick->>'quantity')::numeric = 1));
          total := total + (pick->>'quantity')::numeric;
          -- Fixed complete selections must also obey explicit allowlists.
          FOR a IN SELECT * FROM jsonb_array_elements(c->'allowedOptions')
            WHERE (value->>'groupId')::uuid = g.id LOOP
            PERFORM private.catalog_configuration_assert(EXISTS (
              SELECT 1 FROM jsonb_array_elements(a->'optionIds') x
                WHERE (x.value #>> '{}')::uuid = (pick->>'optionId')::uuid
            ));
          END LOOP;
        END LOOP;
        PERFORM private.catalog_configuration_assert(total BETWEEN g.min_select AND g.max_select);
      END LOOP;
    END LOOP;
  END IF;
  -- Never inspect item/option availability here: agotado is purchase state.
END;
$$;

CREATE FUNCTION private.catalog_configuration_before()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM private.catalog_configuration_assert(NEW.business_id = OLD.business_id AND NEW.item_id = OLD.item_id);
  END IF;
  PERFORM private.catalog_configuration_lock(NEW.business_id);
  IF TG_TABLE_NAME = 'catalog_item_configurations' THEN
    IF TG_OP = 'INSERT' THEN
      -- Direct duplicate INSERT must not wait on an existing row's UPDATE while
      -- holding this business lock. RPC create already performs the same check.
      IF EXISTS (SELECT 1 FROM public.catalog_item_configurations
        WHERE business_id = NEW.business_id AND item_id = NEW.item_id) THEN
        RAISE EXCEPTION 'configuration_version_conflict' USING ERRCODE = '23505';
      END IF;
      NEW.version := 1;
    ELSE NEW.version := OLD.version + 1; END IF;
    PERFORM private.catalog_configuration_assert(private.catalog_configuration_bounded(NEW.document));
    IF NEW.is_active THEN PERFORM private.catalog_configuration_shape(NEW.document); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.catalog_configuration_after()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE p record;
BEGIN
  -- VOLATILE statements get a fresh READ COMMITTED view after the BEFORE wait,
  -- plus this statement's own changes. No recursive configuration-table policy.
  FOR p IN SELECT item_id, document FROM public.catalog_item_configurations
    WHERE business_id = NEW.business_id AND is_active ORDER BY item_id LOOP
    PERFORM private.catalog_configuration_references(NEW.business_id, p.item_id, p.document);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_configuration_before BEFORE INSERT OR UPDATE ON public.catalog_item_configurations
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_before();
CREATE TRIGGER catalog_configuration_after AFTER INSERT OR UPDATE ON public.catalog_item_configurations
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_after();

-- Legacy mutations already hold their row lock before taking the business guard.
-- Separate trigger avoids assuming every legacy row contains an item_id column.
CREATE FUNCTION private.catalog_configuration_catalog_before()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM private.catalog_configuration_assert(NEW.business_id = OLD.business_id AND NEW.id = OLD.id);
  END IF;
  PERFORM private.catalog_configuration_lock(NEW.business_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalog_configuration_items_before BEFORE INSERT OR UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_catalog_before();
CREATE TRIGGER catalog_configuration_items_after AFTER INSERT OR UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_after();
CREATE TRIGGER catalog_configuration_groups_before BEFORE INSERT OR UPDATE ON public.catalog_option_groups
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_catalog_before();
CREATE TRIGGER catalog_configuration_groups_after AFTER INSERT OR UPDATE ON public.catalog_option_groups
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_after();
CREATE TRIGGER catalog_configuration_options_before BEFORE INSERT OR UPDATE ON public.catalog_options
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_catalog_before();
CREATE TRIGGER catalog_configuration_options_after AFTER INSERT OR UPDATE ON public.catalog_options
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_after();

-- Snapshot-affecting settings/publication updates participate too, without row locks
-- on catalog entities after the advisory lock. Identity is immutable under guard.
CREATE FUNCTION private.catalog_configuration_business_before()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM private.catalog_configuration_assert(NEW.business_id = OLD.business_id);
  END IF;
  PERFORM private.catalog_configuration_lock(NEW.business_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalog_configuration_settings_before BEFORE INSERT OR UPDATE ON public.business_catalog_settings
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_business_before();
CREATE TRIGGER catalog_configuration_storefront_before BEFORE INSERT OR UPDATE ON public.business_storefronts
  FOR EACH ROW EXECUTE FUNCTION private.catalog_configuration_business_before();

-- Unit D: one coherent service snapshot; v1 remains byte-for-byte untouched.
CREATE FUNCTION public.pickup_order_catalog_v2(p_business uuid, p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH snapshot AS (
    SELECT (public.pickup_order_catalog(p_business, p_slug) - 'fingerprint') || jsonb_build_object(
      'version', 2, 'schemaVersion', 1,
      'profiles', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'business_id', c.business_id, 'item_id', c.item_id, 'version', c.version,
          'is_active', c.is_active, 'document', c.document
        ) ORDER BY c.item_id)
        FROM public.catalog_item_configurations c WHERE c.business_id = p_business
      ), '[]'::jsonb)
    ) AS payload
  )
  SELECT payload || jsonb_build_object(
    'fingerprint', encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
  ) FROM snapshot WHERE payload IS NOT NULL;
$$;

-- Every INSERT, including OLD trusted writers, fences active-profile downgrade.
-- Old replays return before INSERT. No historical row is modified or revalidated.
CREATE FUNCTION private.pickup_configuration_fence()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE catalog jsonb;
BEGIN
  PERFORM private.catalog_configuration_lock(NEW.business_id);
  IF NEW.intent->'version' = '1'::jsonb THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.intent->'lines') l
      JOIN public.catalog_item_configurations c ON c.business_id = NEW.business_id
        AND c.item_id = (l->>'itemId')::uuid AND c.is_active
    ) THEN RAISE EXCEPTION 'profile_required' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.intent->'version' = '2'::jsonb THEN
    catalog := public.pickup_order_catalog_v2(NEW.business_id, NEW.intent->>'slug');
    IF catalog IS NULL OR NEW.quote->'version' IS DISTINCT FROM '2'::jsonb
      OR NEW.quote->>'snapshotFingerprint' IS DISTINCT FROM catalog->>'fingerprint' THEN
      RAISE EXCEPTION 'catalog_changed' USING ERRCODE = '23514';
    END IF;
  ELSE RAISE EXCEPTION 'invalid_request' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pickup_configuration_fence BEFORE INSERT ON public.pickup_orders
  FOR EACH ROW EXECUTE FUNCTION private.pickup_configuration_fence();

CREATE FUNCTION public.finalize_pickup_order_v2(
  p_actor uuid, p_business uuid, p_intent jsonb, p_quote jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  existing public.pickup_orders;
  catalog jsonb;
  v_request_id uuid;
  v_receipt_id uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'pickup_requires_read_committed' USING ERRCODE = '25001';
  END IF;
  IF p_actor IS NULL OR p_business IS NULL OR p_intent IS NULL
    OR p_intent->'version' IS DISTINCT FROM '2'::jsonb
    OR NOT private.catalog_configuration_array(p_intent->'lines', 100)
    OR octet_length(p_intent::text) > 1048576 THEN
    RETURN jsonb_build_object('code', 'invalid_request');
  END IF;
  IF jsonb_array_length(p_intent->'lines') < 1
    OR NOT private.catalog_configuration_uuid(p_intent->'requestId')
    OR NOT private.catalog_configuration_uuid(p_intent->'receiptId') THEN
    RETURN jsonb_build_object('code', 'invalid_request');
  END IF;
  v_request_id := (p_intent->>'requestId')::uuid;
  v_receipt_id := (p_intent->>'receiptId')::uuid;
  -- Receipt before attempt, then business configuration lock; never reversed.
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
    SELECT 1 FROM public.guest_receipts r WHERE r.id = v_receipt_id
      AND r.actor_id = p_actor AND r.business_id = p_business AND r.state = 'staged'
  ) THEN RETURN jsonb_build_object('code', 'invalid_receipt'); END IF;

  -- Trusted T3 Node normalizes/prices v2 and creates immutable component snapshots.
  -- SHA is freshness, not a price certificate or a replacement for that boundary.
  IF p_quote IS NULL OR p_quote->'version' IS DISTINCT FROM '2'::jsonb
    OR p_quote->>'businessId' IS DISTINCT FROM p_business::text
    OR p_quote->'contact' IS DISTINCT FROM p_intent->'contact'
    OR jsonb_typeof(p_quote->'contact') IS DISTINCT FROM 'object'
    OR p_quote->>'currency' IS DISTINCT FROM p_intent->'expected'->>'currency'
    OR coalesce(p_quote->>'currency', '') !~ '^[A-Z]{3}$'
    OR p_quote->'totalMinor' IS DISTINCT FROM p_intent->'expected'->'totalMinor'
    OR NOT private.catalog_configuration_integer(p_quote->'totalMinor', 0)
    OR NOT private.catalog_configuration_array(p_quote->'lines', 100)
    OR octet_length(p_quote::text) > 1048576 THEN
    RETURN jsonb_build_object('code', 'invalid_quote');
  END IF;
  IF jsonb_array_length(p_quote->'lines') <> jsonb_array_length(p_intent->'lines') THEN
    RETURN jsonb_build_object('code', 'invalid_quote');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_quote->'lines') line
    WHERE line->>'currency' IS DISTINCT FROM p_quote->>'currency') THEN
    RETURN jsonb_build_object('code', 'mixed_currency');
  END IF;
  PERFORM private.catalog_configuration_lock(p_business);
  catalog := public.pickup_order_catalog_v2(p_business, p_intent->>'slug');
  IF catalog IS NULL THEN RETURN jsonb_build_object('code', 'unavailable'); END IF;
  IF catalog->>'fingerprint' IS DISTINCT FROM p_quote->>'snapshotFingerprint' THEN
    RETURN jsonb_build_object('code', 'catalog_changed');
  END IF;
  BEGIN
    INSERT INTO public.pickup_orders(actor_id, business_id, request_id, receipt_id, intent, quote, currency, total_minor)
    VALUES (p_actor, p_business, v_request_id, v_receipt_id, p_intent, p_quote,
      p_quote->>'currency', (p_quote->>'totalMinor')::bigint) RETURNING * INTO existing;
  EXCEPTION WHEN unique_violation THEN
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
    RAISE;
  END;
  RETURN jsonb_build_object('code', 'created', 'order', to_jsonb(existing));
END;
$$;

-- Explicit signatures only: never revoke or regrant an old object's privileges.
REVOKE EXECUTE ON FUNCTION private.catalog_configuration_assert(boolean),
  private.catalog_configuration_keys(jsonb, text[]), private.catalog_configuration_array(jsonb, integer),
  private.catalog_configuration_uuid(jsonb), private.catalog_configuration_integer(jsonb, numeric),
  private.catalog_configuration_bounded(jsonb, integer), private.catalog_configuration_shape(jsonb),
  private.catalog_configuration_lock(uuid), private.catalog_configuration_references(uuid, uuid, jsonb),
  private.catalog_configuration_before(), private.catalog_configuration_after(),
  private.catalog_configuration_catalog_before(), private.catalog_configuration_business_before(),
  private.pickup_configuration_fence() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
-- anon only reads; it needs no CHECK execution or private schema privileges.
GRANT EXECUTE ON FUNCTION private.catalog_configuration_assert(boolean),
  private.catalog_configuration_keys(jsonb, text[]), private.catalog_configuration_array(jsonb, integer),
  private.catalog_configuration_uuid(jsonb), private.catalog_configuration_integer(jsonb, numeric),
  private.catalog_configuration_bounded(jsonb, integer), private.catalog_configuration_shape(jsonb),
  private.catalog_configuration_lock(uuid), private.catalog_configuration_references(uuid, uuid, jsonb)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_catalog_item_configuration(uuid, uuid, bigint, boolean, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_catalog_item_configuration(uuid, uuid, bigint, boolean, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pickup_order_catalog_v2(uuid, text),
  public.finalize_pickup_order_v2(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pickup_order_catalog_v2(uuid, text),
  public.finalize_pickup_order_v2(uuid, uuid, jsonb, jsonb) TO service_role;

-- Last object in the same transaction: no advertised half-installed capability.
CREATE FUNCTION public.catalog_configuration_capabilities()
RETURNS TABLE (version integer, "schemaVersion" integer)
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT 2, 1;
$$;
REVOKE EXECUTE ON FUNCTION public.catalog_configuration_capabilities() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_configuration_capabilities() TO anon, authenticated, service_role;
COMMIT;
