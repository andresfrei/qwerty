BEGIN;

SELECT no_plan();

SELECT has_table('public', 'catalog_categories', 'catalog_categories table exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.catalog_categories'::regclass),
  'catalog_categories has row-level security enabled'
);
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_categories'),
  ARRAY['id', 'business_id', 'name', 'sort_order', 'created_at']::text[],
  'catalog_categories has the ordered category columns'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_categories'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (business_id, id)%'
  ),
  'catalog_categories has a unique business/id key for the composite item FK'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_items'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (business_id, category_id)%'
  ),
  'catalog_items uses a same-business composite category FK'
);
SELECT ok(
  (SELECT is_nullable = 'NO' FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_items'
     AND column_name = 'category_id'),
  'catalog_items.category_id is required'
);
SELECT ok(has_table_privilege('anon', 'public.catalog_categories', 'SELECT'), 'anon can read categories');
SELECT ok(has_table_privilege('authenticated', 'public.catalog_categories', 'SELECT'), 'authenticated can read categories');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_categories', 'INSERT'), 'anon cannot insert categories');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_categories', 'UPDATE'), 'anon cannot update categories');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_categories', 'DELETE'), 'anon cannot delete categories');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_categories', 'name', 'INSERT'), 'owners can insert category names');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_categories', 'sort_order', 'UPDATE'), 'owners can update category order');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_categories', 'business_id', 'UPDATE'), 'category business ownership is not updateable');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'category_id', 'INSERT'), 'owners must provide an item category');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_items', 'category_id', 'UPDATE'), 'owners can update item category order');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_items', 'business_id', 'UPDATE'), 'item business ownership remains immutable');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test', '2026-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Category A');
SELECT set_config('test.business_a_id', (SELECT id::text FROM public.businesses WHERE name = 'Category A'), true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.business_a_id')::uuid, 'category-a', 'Category A', false);

INSERT INTO public.catalog_categories (business_id, name, sort_order)
VALUES
  (current_setting('test.business_a_id')::uuid, 'A first', 10),
  (current_setting('test.business_a_id')::uuid, 'A second', 20);
SELECT set_config(
  'test.category_a_first_id',
  (SELECT id::text FROM public.catalog_categories
   WHERE business_id = current_setting('test.business_a_id')::uuid AND name = 'A first'),
  true
);
SELECT set_config(
  'test.category_a_second_id',
  (SELECT id::text FROM public.catalog_categories
   WHERE business_id = current_setting('test.business_a_id')::uuid AND name = 'A second'),
  true
);
INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency, sort_order)
VALUES
  (current_setting('test.business_a_id')::uuid, current_setting('test.category_a_first_id')::uuid, 'A first item', 100, 'ARS', 10),
  (current_setting('test.business_a_id')::uuid, current_setting('test.category_a_second_id')::uuid, 'A second item', 200, 'ARS', 20),
  (current_setting('test.business_a_id')::uuid, current_setting('test.category_a_second_id')::uuid, 'A second later item', 250, 'ARS', 30);
SELECT is(
  (SELECT count(*) FROM public.catalog_items
   WHERE business_id = current_setting('test.business_a_id')::uuid AND category_id IS NOT NULL),
  3::bigint,
  'owner-created items always have a category'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, name, price_minor, currency)
    VALUES (current_setting('test.business_a_id')::uuid, 'Missing category', 100, 'ARS')$$,
  '23502', NULL,
  'new items cannot omit a category'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_categories (business_id, name, sort_order)
    VALUES (current_setting('test.business_a_id')::uuid, '   ', 0)$$,
  '23514', NULL,
  'category names cannot be blank'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_categories (business_id, name, sort_order)
    VALUES (current_setting('test.business_a_id')::uuid, 'Bad order', -1)$$,
  '23514', NULL,
  'category order cannot be negative'
);
SELECT results_eq(
  $$UPDATE public.catalog_categories SET sort_order = 0
    WHERE id = current_setting('test.category_a_second_id')::uuid
    RETURNING name$$,
  ARRAY['A second'],
  'owner A can reorder categories'
);
SELECT results_eq(
  $$UPDATE public.catalog_categories SET sort_order = 0
    WHERE id = current_setting('test.category_a_first_id')::uuid
    RETURNING name$$,
  ARRAY['A first'],
  'owner A can create a category-order tie'
);
SELECT is(
  (SELECT array_agg(name ORDER BY sort_order, id)
   FROM public.catalog_categories
   WHERE business_id = current_setting('test.business_a_id')::uuid),
  CASE WHEN current_setting('test.category_a_first_id')::uuid
             < current_setting('test.category_a_second_id')::uuid
       THEN ARRAY['A first', 'A second']::text[]
       ELSE ARRAY['A second', 'A first']::text[]
  END,
  'category readers use sort order with stable ID tie-breaking'
);
SELECT results_eq(
  $$UPDATE public.catalog_items SET sort_order = 0
    WHERE name = 'A second item'
    RETURNING name$$,
  ARRAY['A second item'],
  'owner A can reorder products within a category'
);
SELECT results_eq(
  $$SELECT name FROM public.catalog_items
    WHERE category_id = current_setting('test.category_a_second_id')::uuid
    ORDER BY sort_order, id$$,
  ARRAY['A second item', 'A second later item'],
  'readers see products in deterministic category order'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Category B');
SELECT set_config('test.business_b_id', (SELECT id::text FROM public.businesses WHERE name = 'Category B'), true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.business_b_id')::uuid, 'category-b', 'Category B', true);
INSERT INTO public.catalog_categories (business_id, name, sort_order)
VALUES (current_setting('test.business_b_id')::uuid, 'B public', 0);
SELECT set_config(
  'test.category_b_id',
  (SELECT id::text FROM public.catalog_categories
   WHERE business_id = current_setting('test.business_b_id')::uuid),
  true
);
INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency, sort_order)
VALUES (current_setting('test.business_b_id')::uuid, current_setting('test.category_b_id')::uuid, 'B public item', 300, 'ARS', 0);

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_categories
    WHERE business_id = current_setting('test.business_b_id')::uuid
    ORDER BY name$$,
  ARRAY['B public'],
  'public readers see categories in the published storefront'
);
SELECT results_eq(
  $$SELECT name FROM public.catalog_categories
    WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  ARRAY[]::text[],
  'public readers cannot see categories in a private storefront'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_categories (business_id, name, sort_order)
    VALUES (gen_random_uuid(), 'Anon category', 0)$$,
  '42501', NULL,
  'public readers cannot insert categories'
);
SELECT throws_ok(
  $$UPDATE public.catalog_categories SET sort_order = 1$$,
  '42501', NULL,
  'public readers cannot update categories'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_categories
    WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  ARRAY[]::text[],
  'another owner cannot read private categories'
);
SELECT results_eq(
  $$UPDATE public.catalog_categories SET name = 'B attempted update'
    WHERE id = current_setting('test.category_a_first_id')::uuid
    RETURNING id$$,
  ARRAY[]::uuid[],
  'another owner cannot modify a private category'
);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT throws_ok(
  $$INSERT INTO public.catalog_items (business_id, category_id, name, price_minor, currency)
    VALUES (current_setting('test.business_a_id')::uuid, current_setting('test.category_b_id')::uuid, 'Forged category', 100, 'ARS')$$,
  '23503', NULL,
  'same-business FK blocks owner A from assigning a B category'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
