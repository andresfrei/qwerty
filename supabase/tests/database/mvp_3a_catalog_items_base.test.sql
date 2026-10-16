BEGIN;

SELECT no_plan();

SELECT has_table('public', 'catalog_items', 'catalog_items table exists');
SELECT is(
  (SELECT array_agg(column_name::text || ':' || data_type || ':' || is_nullable
                   ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_items'),
  ARRAY[
    'id:uuid:NO',
    'business_id:uuid:NO',
    'name:text:NO',
    'description:text:YES',
    'price_minor:integer:NO',
    'currency:text:NO',
    'is_available:boolean:NO',
    'sort_order:integer:NO',
    'created_at:timestamp with time zone:NO',
    'category_id:uuid:NO',
    'photo_path:text:YES',
    'photo_version:bigint:NO'
  ]::text[],
  'catalog_items has exactly the current columns with their expected types and nullability'
);
SELECT is(
  (SELECT array_agg(column_name::text || ':' || data_type || ':' || is_nullable
                   ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_items'
     AND column_name IN ('category_id', 'photo_path', 'photo_version')),
  ARRAY[
    'category_id:uuid:NO',
    'photo_path:text:YES',
    'photo_version:bigint:NO'
  ]::text[],
  'catalog_items keeps the category and photo columns added by later features'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.catalog_items')),
  'catalog_items has row-level security enabled'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'p'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                         WHERE attrelid = to_regclass('public.catalog_items')
                           AND attname = 'id')]::smallint[]
  ),
  'catalog_items uses id as its primary key'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'f'
      AND confrelid = 'public.businesses'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                         WHERE attrelid = to_regclass('public.catalog_items')
                           AND attname = 'business_id')]::smallint[]
  ),
  'catalog_items business_id references businesses'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%price_minor%>=%0%'
  ),
  'catalog_items constrains price_minor to nonnegative values'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%currency%'
      AND pg_get_constraintdef(oid) LIKE '%[A-Z]{3}%'
  ),
  'catalog_items constrains currency to three uppercase ASCII letters'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%length(btrim(name))%'
  ),
  'catalog_items constrains names to nonblank text'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.catalog_items')
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%sort_order%>=%0%'
  ),
  'catalog_items constrains sort_order to nonnegative values'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'catalog_items'
      AND indexname = 'catalog_items_business_sort_order_idx'
      AND indexdef LIKE '%(business_id, sort_order, id)%'
  ),
  'catalog_items has the business and sort-order index'
);
SELECT ok(has_table_privilege('anon', 'public.catalog_items', 'SELECT'), 'anon has catalog SELECT access');
SELECT ok(has_table_privilege('authenticated', 'public.catalog_items', 'SELECT'), 'authenticated has catalog SELECT access');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_items', 'INSERT'), 'anon has no catalog INSERT grant');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_items', 'UPDATE'), 'anon has no catalog UPDATE grant');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_items', 'DELETE'), 'anon has no catalog DELETE grant');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'business_id', 'INSERT'), 'authenticated can insert catalog business_id');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'name', 'INSERT'), 'authenticated can insert catalog name');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'description', 'UPDATE'), 'authenticated can update catalog description');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'price_minor', 'UPDATE'), 'authenticated can update catalog price');
SELECT ok(NOT has_table_privilege('authenticated', 'public.catalog_items', 'DELETE'), 'authenticated has no catalog DELETE grant');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'id', 'INSERT'), 'authenticated cannot assign catalog ids');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'id', 'UPDATE'), 'authenticated cannot change catalog ids');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'business_id', 'UPDATE'), 'authenticated cannot transfer catalog business ownership');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'created_at', 'INSERT'), 'authenticated cannot assign catalog creation timestamps');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'created_at', 'UPDATE'), 'authenticated cannot change catalog creation timestamps');
SELECT ok(NOT has_table_privilege('public', 'public.catalog_items', 'SELECT'), 'PUBLIC has no catalog grant');

-- Real Auth users and owner-created businesses exercise the committed ownership boundary.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'catalog-owner-a@example.test', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'catalog-owner-b@example.test', '2026-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Catalog Owner A Business');
SELECT set_config('test.catalog_business_a', (SELECT id::text FROM public.businesses WHERE name = 'Catalog Owner A Business'), true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.catalog_business_a')::uuid, 'catalog-owner-a', 'Catalog Owner A', false);
INSERT INTO public.catalog_categories (business_id, name, sort_order)
VALUES (current_setting('test.catalog_business_a')::uuid, 'General', 0);
SELECT set_config(
  'test.catalog_category_a',
  (SELECT id::text FROM public.catalog_categories
   WHERE business_id = current_setting('test.catalog_business_a')::uuid
     AND name = 'General'),
  true
);
INSERT INTO public.catalog_items (business_id, category_id, name, description, price_minor, currency, is_available, sort_order)
VALUES
  (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Owner A available item', 'Private because the storefront is unpublished', 1200, 'ARS', true, 1),
  (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Owner A unavailable item', NULL, 1300, 'ARS', false, 2);
SELECT set_config(
  'test.catalog_item_a',
  (SELECT id::text FROM public.catalog_items
   WHERE business_id = current_setting('test.catalog_business_a')::uuid
     AND name = 'Owner A available item'),
  true
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Catalog Owner B Business');
SELECT set_config('test.catalog_business_b', (SELECT id::text FROM public.businesses WHERE name = 'Catalog Owner B Business'), true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.catalog_business_b')::uuid, 'catalog-owner-b', 'Catalog Owner B', true);
INSERT INTO public.catalog_categories (business_id, name, sort_order)
VALUES (current_setting('test.catalog_business_b')::uuid, 'General', 0);
SELECT set_config(
  'test.catalog_category_b',
  (SELECT id::text FROM public.catalog_categories
   WHERE business_id = current_setting('test.catalog_business_b')::uuid
     AND name = 'General'),
  true
);
INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency, is_available, sort_order)
VALUES
  (current_setting('test.catalog_business_b')::uuid, current_setting('test.catalog_category_b')::uuid, 'Published available item', 1600, 'ARS', true, 1),
  (current_setting('test.catalog_business_b')::uuid, current_setting('test.catalog_category_b')::uuid, 'Published unavailable item', 1700, 'ARS', false, 2);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_items
    WHERE business_id = current_setting('test.catalog_business_a')::uuid ORDER BY sort_order$$,
  ARRAY['Owner A available item', 'Owner A unavailable item'],
  'owner A sees their available and unavailable items in an unpublished storefront'
);
SELECT results_eq(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Owner A defaulted item', 900)
    RETURNING currency$$,
  ARRAY['ARS'],
  'owner A can create a catalog item and receives the currency default'
);
SELECT is(
  (SELECT is_available AND sort_order = 0 AND description IS NULL
   FROM public.catalog_items
   WHERE business_id = current_setting('test.catalog_business_a')::uuid
     AND name = 'Owner A defaulted item'),
  true,
  'new catalog items default to available, order zero, and no description'
);
SELECT results_eq(
  $$UPDATE public.catalog_items SET name = 'Owner A edited item', price_minor = 1450,
      description = 'Edited by its owner', currency = 'USD', is_available = false, sort_order = 3
    WHERE id = current_setting('test.catalog_item_a')::uuid
    RETURNING concat_ws('|', name, price_minor::text, description, currency,
                        is_available::text, sort_order::text)$$,
  ARRAY['Owner A edited item|1450|Edited by its owner|USD|false|3'],
  'owner A can update mutable catalog fields on their item'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency)
    VALUES (current_setting('test.catalog_business_b')::uuid, current_setting('test.catalog_category_b')::uuid, 'Forged foreign item', 100, 'ARS')$$,
  '42501', NULL,
  'owner A cannot create an item for owner B business'
);
SELECT throws_ok(
  $$UPDATE public.catalog_items SET business_id = current_setting('test.catalog_business_b')::uuid
    WHERE id = current_setting('test.catalog_item_a')::uuid$$,
  '42501', NULL,
  'owner A cannot transfer their item to owner B business'
);
SELECT throws_ok(
  $$UPDATE public.catalog_items SET id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    WHERE id = current_setting('test.catalog_item_a')::uuid$$,
  '42501', NULL,
  'owner A cannot change an item id'
);
SELECT throws_ok(
  $$UPDATE public.catalog_items SET created_at = now() + interval '1 day'
    WHERE id = current_setting('test.catalog_item_a')::uuid$$,
  '42501', NULL,
  'owner A cannot change an item creation timestamp'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, '   ', 100)$$,
  '23514', NULL,
  'blank item names are rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Negative price', -1)$$,
  '23514', NULL,
  'negative item prices are rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Lowercase currency', 100, 'ars')$$,
  '23514', NULL,
  'lowercase currency is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Long currency', 100, 'PESOS')$$,
  '23514', NULL,
  'currency longer than three letters is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, sort_order)
    VALUES (current_setting('test.catalog_business_a')::uuid, current_setting('test.catalog_category_a')::uuid, 'Negative order', 100, -1)$$,
  '23514', NULL,
  'negative item ordering is rejected'
);

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_items ORDER BY name$$,
  ARRAY['Published available item'],
  'anon sees only available items belonging to the published storefront'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.catalog_category_a')::uuid, 'Anonymous item', 100)$$,
  '42501', NULL,
  'anon cannot insert catalog items'
);
SELECT throws_ok(
  $$UPDATE public.catalog_items SET name = 'Anonymous edit'$$,
  '42501', NULL,
  'anon cannot update catalog items'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_items
    WHERE business_id = current_setting('test.catalog_business_b')::uuid ORDER BY name$$,
  ARRAY['Published available item'],
  'authenticated non-owner sees only available items in the published foreign storefront'
);
SELECT is(
  (SELECT count(*) FROM public.catalog_items
   WHERE business_id = current_setting('test.catalog_business_b')::uuid),
  1::bigint,
  'authenticated non-owner cannot see unavailable foreign items'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
SELECT is(
  (SELECT count(*) FROM public.catalog_items
   WHERE business_id = current_setting('test.catalog_business_a')::uuid),
  0::bigint,
  'owner B cannot read owner A private catalog items'
);
SELECT is_empty(
  $$UPDATE public.catalog_items SET name = 'Foreign attempted edit'
    WHERE id = current_setting('test.catalog_item_a')::uuid
    RETURNING id$$,
  'foreign item update affects zero rows'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT is(
  (SELECT name FROM public.catalog_items
   WHERE id = current_setting('test.catalog_item_a')::uuid),
  'Owner A edited item',
  'foreign zero-row update leaves owner A item unchanged'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
SELECT is(
  (SELECT count(*) FROM public.catalog_items
   WHERE business_id = current_setting('test.catalog_business_b')::uuid),
  2::bigint,
  'owner B sees available and unavailable items in their own published storefront'
);
SELECT results_eq(
  $$UPDATE public.catalog_items SET name = 'Published item edited by owner B'
    WHERE business_id = current_setting('test.catalog_business_b')::uuid
      AND name = 'Published available item'
    RETURNING name$$,
  ARRAY['Published item edited by owner B'],
  'owner B can update an item in their business'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
