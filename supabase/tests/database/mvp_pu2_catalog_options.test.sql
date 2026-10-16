BEGIN;

SELECT no_plan();

SELECT has_table('public', 'business_catalog_settings', 'business_catalog_settings table exists');
SELECT has_table('public', 'catalog_option_groups', 'catalog_option_groups table exists');
SELECT has_table('public', 'catalog_options', 'catalog_options table exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_catalog_settings'::regclass),
  'business_catalog_settings has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.catalog_option_groups'::regclass),
  'catalog_option_groups has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.catalog_options'::regclass),
  'catalog_options has row-level security enabled'
);

SELECT is(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'business_catalog_settings'),
  ARRAY['business_id', 'two_flavor_surcharge_minor']::text[],
  'business_catalog_settings has the two-flavor surcharge columns'
);
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'business_catalog_settings'
     AND column_name = 'two_flavor_surcharge_minor'),
  '0',
  'two-flavor surcharge defaults to zero'
);
SELECT is(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'business_catalog_settings'
     AND column_name = 'two_flavor_surcharge_minor'),
  'NO',
  'two-flavor surcharge is required'
);
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_option_groups'),
  ARRAY['id', 'business_id', 'item_id', 'name', 'selection_mode',
        'min_select', 'max_select', 'sort_order']::text[],
  'catalog_option_groups has the option group columns'
);
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_options'),
  ARRAY['id', 'business_id', 'group_id', 'name', 'price_delta_minor',
        'is_available', 'sort_order']::text[],
  'catalog_options has the option columns'
);
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_options'
     AND column_name = 'price_delta_minor'),
  '0',
  'option price deltas default to zero'
);
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'catalog_options'
     AND column_name = 'is_available'),
  'true',
  'options default to available'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_items'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (business_id, id)%'
  ),
  'catalog_items has a unique business/id key for the option group FK'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_option_groups'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (business_id, id)%'
  ),
  'catalog_option_groups has a unique business/id key for the option FK'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_options'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (business_id, id)%'
  ),
  'catalog_options has a unique business/id key'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_option_groups'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (business_id, item_id)%'
  ),
  'catalog_option_groups uses a same-business composite item FK'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_options'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (business_id, group_id)%'
  ),
  'catalog_options uses a same-business composite group FK'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_options'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%ON DELETE CASCADE%'
  ),
  'option rows cascade away with their option group'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.catalog_option_groups'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%max_select >= min_select%'
  ),
  'catalog_option_groups constrains the maximum to the minimum'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_catalog_settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%two_flavor_surcharge_minor >= 0%'
  ),
  'two-flavor surcharge cannot be negative'
);
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'business_catalog_settings'
     AND policyname IN ('business_catalog_settings_public_select_anon',
                        'business_catalog_settings_public_select_authenticated')),
  2::bigint,
  'business_catalog_settings has two public select policies'
);

SELECT ok(has_table_privilege('anon', 'public.catalog_option_groups', 'SELECT'), 'anon can read option groups');
SELECT ok(has_table_privilege('authenticated', 'public.catalog_option_groups', 'SELECT'), 'authenticated can read option groups');
SELECT ok(has_table_privilege('anon', 'public.catalog_options', 'SELECT'), 'anon can read options');
SELECT ok(has_table_privilege('authenticated', 'public.catalog_options', 'SELECT'), 'authenticated can read options');
SELECT ok(has_table_privilege('anon', 'public.business_catalog_settings', 'SELECT'), 'anon can read catalog settings');
SELECT ok(has_table_privilege('authenticated', 'public.business_catalog_settings', 'SELECT'), 'authenticated can read catalog settings');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_option_groups', 'INSERT'), 'anon cannot insert option groups');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_option_groups', 'UPDATE'), 'anon cannot update option groups');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_options', 'INSERT'), 'anon cannot insert options');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_options', 'UPDATE'), 'anon cannot update options');
SELECT ok(NOT has_table_privilege('anon', 'public.business_catalog_settings', 'INSERT'), 'anon cannot insert catalog settings');
SELECT ok(NOT has_table_privilege('anon', 'public.business_catalog_settings', 'UPDATE'), 'anon cannot update catalog settings');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_option_groups', 'DELETE'), 'anon cannot delete option groups');
SELECT ok(NOT has_table_privilege('authenticated', 'public.catalog_option_groups', 'DELETE'), 'authenticated cannot delete option groups');
SELECT ok(NOT has_table_privilege('anon', 'public.catalog_options', 'DELETE'), 'anon cannot delete options');
SELECT ok(NOT has_table_privilege('authenticated', 'public.catalog_options', 'DELETE'), 'authenticated cannot delete options');
SELECT ok(NOT has_table_privilege('anon', 'public.business_catalog_settings', 'DELETE'), 'anon cannot delete catalog settings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_catalog_settings', 'DELETE'), 'authenticated cannot delete catalog settings');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_option_groups', 'name', 'INSERT'), 'owners can insert option group names');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_option_groups', 'min_select', 'UPDATE'), 'owners can update option group bounds');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_option_groups', 'item_id', 'UPDATE'), 'owners can reparent an option group');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_option_groups', 'business_id', 'UPDATE'), 'option group business ownership is not updateable');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_options', 'price_delta_minor', 'UPDATE'), 'owners can update option prices');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_options', 'is_available', 'UPDATE'), 'owners can update option availability');
SELECT ok(has_column_privilege('authenticated', 'public.catalog_options', 'group_id', 'UPDATE'), 'owners can reparent an option');
SELECT ok(NOT has_column_privilege('authenticated', 'public.catalog_options', 'business_id', 'UPDATE'), 'option business ownership is not updateable');
SELECT ok(has_column_privilege('authenticated', 'public.business_catalog_settings', 'two_flavor_surcharge_minor', 'UPDATE'), 'owners can update the two-flavor surcharge');
SELECT ok(NOT has_column_privilege('authenticated', 'public.business_catalog_settings', 'business_id', 'UPDATE'), 'catalog settings business ownership is not updateable');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test', '2026-01-01 00:00:00+00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'owner-c@example.test', NULL)
ON CONFLICT (id) DO NOTHING;

SET ROLE postgres;
INSERT INTO public.businesses (id, owner_id, name)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Options A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Options B'),
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Options C');
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'options-a', 'Options A', false),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'options-b', 'Options B', true);
INSERT INTO public.catalog_categories (id, business_id, name, sort_order)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Options A category', 0),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Options B category', 0),
  ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Options C category', 0);
INSERT INTO public.catalog_items (id, business_id, category_id, name, price_minor, currency, is_available, sort_order)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'A pizza', 1000, 'ARS', true, 0),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B pizza available', 1000, 'ARS', true, 0),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B pizza unavailable', 1000, 'ARS', false, 1),
  ('cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'C pizza', 1000, 'ARS', true, 0);
INSERT INTO public.catalog_option_groups (id, business_id, item_id, name, selection_mode, min_select, max_select, sort_order)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'B flavors', 'distinct', 1, 2, 0),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004', 'B hidden flavors', 'distinct', 1, 2, 0);
INSERT INTO public.catalog_options (id, business_id, group_id, name, price_delta_minor, is_available, sort_order)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'B napolitana', 0, true, 0),
  ('bbbbbbbb-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000006', 'B hidden option', 0, true, 0);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

SELECT lives_ok(
  $$INSERT INTO public.business_catalog_settings (business_id, two_flavor_surcharge_minor)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 500)$$,
  'owner A can insert their catalog settings'
);
SELECT is(
  (SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
   WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  500,
  'owner A catalog settings store the surcharge'
);
SELECT lives_ok(
  $$UPDATE public.business_catalog_settings SET two_flavor_surcharge_minor = 700
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'owner A can update their two-flavor surcharge'
);
SELECT throws_ok(
  $$UPDATE public.business_catalog_settings SET two_flavor_surcharge_minor = -1
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', NULL,
  'two-flavor surcharge cannot be negative'
);

SELECT lives_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select, sort_order)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'A flavors', 'distinct', 1, 2, 0)$$,
  'owner A can create an option group for their item'
);
SELECT set_config(
  'test.group_a_id',
  (SELECT id::text FROM public.catalog_option_groups
   WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND name = 'A flavors'),
  true
);
SELECT is(
  (SELECT selection_mode FROM public.catalog_option_groups
   WHERE id = current_setting('test.group_a_id')::uuid),
  'distinct',
  'owner A option group keeps its selection mode'
);
SELECT lives_ok(
  $$INSERT INTO public.catalog_options (business_id, group_id, name, price_delta_minor, is_available, sort_order)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', current_setting('test.group_a_id')::uuid, 'A muzzarella', 0, true, 0)$$,
  'owner A can create an option inside their group'
);
SELECT results_eq(
  $$UPDATE public.catalog_options SET is_available = false
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    RETURNING name$$,
  ARRAY['A muzzarella'],
  'owner A can toggle option availability'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_options (business_id, group_id, name, price_delta_minor)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', current_setting('test.group_a_id')::uuid, 'A negative', -1)$$,
  '23514', NULL,
  'option price deltas cannot be negative'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '   ', 'distinct', 0, 1)$$,
  '23514', NULL,
  'option group names cannot be blank'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'A invalid mode', 'free', 0, 1)$$,
  '23514', NULL,
  'option groups require a supported selection mode'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'A bad range', 'distinct', 2, 1)$$,
  '23514', NULL,
  'option groups reject a maximum below the minimum'
);

SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'A forged group', 'distinct', 0, 1)$$,
  '42501', NULL,
  'owner A cannot create a group for another business'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'A forged item group', 'distinct', 0, 1)$$,
  '23503', NULL,
  'same-business composite FK blocks owner A from binding a B item'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_options (business_id, group_id, name)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'A forged option')$$,
  '23503', NULL,
  'same-business composite FK blocks owner A from binding a B group'
);
SELECT results_eq(
  $$SELECT name FROM public.catalog_option_groups
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    ORDER BY name$$,
  ARRAY['B flavors'],
  'owner A reads only the publicly published option groups of another business'
);
SELECT results_eq(
  $$UPDATE public.catalog_option_groups SET name = 'A forged update'
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    RETURNING name$$,
  ARRAY[]::text[],
  'owner A cannot update another business option groups'
);
SELECT throws_ok(
  $$DELETE FROM public.catalog_option_groups
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', NULL,
  'owners have no delete grant for option groups'
);
SELECT throws_ok(
  $$DELETE FROM public.catalog_options
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', NULL,
  'owners have no delete grant for options'
);
SELECT throws_ok(
  $$DELETE FROM public.business_catalog_settings
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', NULL,
  'owners have no delete grant for catalog settings'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
SELECT is(
  (SELECT count(*) FROM public.business_catalog_settings
   WHERE business_id = 'cccccccc-0000-0000-0000-000000000001'),
  0::bigint,
  'unconfirmed owner cannot read catalog settings'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'C unconfirmed', 'distinct', 0, 1)$$,
  '42501', NULL,
  'unconfirmed owner cannot create option groups'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
SELECT lives_ok(
  $$INSERT INTO public.business_catalog_settings (business_id)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001')$$,
  'owner B can insert their catalog settings'
);
SELECT is(
  (SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
   WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'owner B two-flavor surcharge defaults to zero'
);
SELECT results_eq(
  $$UPDATE public.business_catalog_settings SET two_flavor_surcharge_minor = 250
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    RETURNING two_flavor_surcharge_minor$$,
  ARRAY[250],
  'owner B can update their own two-flavor surcharge'
);
SELECT is(
  (SELECT count(*) FROM public.business_catalog_settings
   WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0::bigint,
  'another owner cannot read catalog settings'
);
SELECT results_eq(
  $$UPDATE public.business_catalog_settings SET two_flavor_surcharge_minor = 1
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    RETURNING two_flavor_surcharge_minor$$,
  ARRAY[]::integer[],
  'another owner cannot update catalog settings'
);
SELECT lives_ok(
  $$INSERT INTO public.catalog_options (business_id, group_id, name, sort_order)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'B owner option', 1)$$,
  'owner B can create an option inside the group of their own item'
);

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT results_eq(
  $$SELECT name FROM public.catalog_option_groups
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    ORDER BY name$$,
  ARRAY['B flavors'],
  'public readers see option groups only for available items of a published storefront'
);
SELECT results_eq(
  $$SELECT name FROM public.catalog_option_groups
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  ARRAY[]::text[],
  'public readers cannot see option groups of an unpublished storefront'
);
SELECT results_eq(
  $$SELECT name FROM public.catalog_options
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    ORDER BY name$$,
  ARRAY['B napolitana', 'B owner option'],
  'public readers see options only for available items of a published storefront'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_option_groups (business_id, item_id, name, selection_mode, min_select, max_select)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'Anon group', 'distinct', 0, 1)$$,
  '42501', NULL,
  'anonymous clients cannot create option groups'
);
SELECT throws_ok(
  $$UPDATE public.catalog_option_groups SET name = 'Anon update'$$,
  '42501', NULL,
  'anonymous clients cannot update option groups'
);
SELECT throws_ok(
  $$INSERT INTO public.catalog_options (business_id, group_id, name)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'Anon option')$$,
  '42501', NULL,
  'anonymous clients cannot create options'
);
SELECT throws_ok(
  $$DELETE FROM public.catalog_option_groups$$,
  '42501', NULL,
  'anonymous clients cannot delete option groups'
);
SELECT throws_ok(
  $$INSERT INTO public.business_catalog_settings (business_id, two_flavor_surcharge_minor)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 1)$$,
  '42501', NULL,
  'anonymous clients cannot write catalog settings'
);
SELECT results_eq(
  $$SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
    WHERE business_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  ARRAY[250],
  'public readers see the surcharge of a published storefront'
);
SELECT results_eq(
  $$SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
    WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  ARRAY[]::integer[],
  'public readers cannot see the surcharge of an unpublished storefront'
);

RESET ROLE;
SELECT is(
  (SELECT two_flavor_surcharge_minor FROM public.business_catalog_settings
   WHERE business_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  700,
  'catalog settings survive denied cross-business writes'
);

SELECT * FROM finish();
ROLLBACK;
