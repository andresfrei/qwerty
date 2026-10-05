BEGIN;

SELECT no_plan();

SELECT has_table('public', 'business_storefronts', 'business_storefronts table exists');
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'business_storefronts'),
  ARRAY['business_id', 'slug', 'display_name', 'is_published']::text[],
  'business_storefronts has only the MVP columns'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_storefronts'::regclass),
  'business_storefronts has row-level security enabled'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_storefronts'::regclass
      AND contype = 'p'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                         WHERE attrelid = 'public.business_storefronts'::regclass
                           AND attname = 'business_id')]::smallint[]
  ),
  'business_storefronts uses business_id as its primary key'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_storefronts'::regclass
      AND contype = 'f'
      AND confrelid = 'public.businesses'::regclass
  ),
  'business_storefronts references businesses'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_storefronts'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                         WHERE attrelid = 'public.business_storefronts'::regclass
                           AND attname = 'slug')]::smallint[]
  ),
  'storefront slugs are unique'
);
SELECT ok(has_table_privilege('anon', 'public.business_storefronts', 'SELECT'), 'anon has storefront read access');
SELECT ok(NOT has_table_privilege('anon', 'public.business_storefronts', 'INSERT'), 'anon has no storefront insert grant');
SELECT ok(NOT has_table_privilege('anon', 'public.business_storefronts', 'UPDATE'), 'anon has no storefront update grant');
SELECT ok(NOT has_table_privilege('anon', 'public.business_storefronts', 'DELETE'), 'anon has no storefront delete grant');
SELECT ok(has_column_privilege('authenticated', 'public.business_storefronts', 'business_id', 'INSERT'), 'authenticated can insert storefronts');
SELECT ok(has_column_privilege('authenticated', 'public.business_storefronts', 'slug', 'UPDATE'), 'authenticated can update storefronts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_storefronts', 'DELETE'), 'authenticated cannot delete storefronts');
SELECT ok(NOT has_column_privilege('authenticated', 'public.business_storefronts', 'business_id', 'UPDATE'), 'storefront business ownership is not updateable');
SELECT ok(NOT has_table_privilege('anon', 'public.businesses', 'SELECT'), 'anon cannot read private business rows');
SELECT ok(NOT has_table_privilege('public', 'public.business_storefronts', 'SELECT'), 'PUBLIC has no storefront grant');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test', '2026-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A food business');
SELECT set_config('test.business_a_id', (SELECT id::text FROM public.businesses WHERE name = 'A food business'), true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A second food business');
SELECT set_config('test.business_a2_id', (SELECT id::text FROM public.businesses WHERE name = 'A second food business'), true);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
INSERT INTO public.businesses (owner_id, name)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B food business');
SELECT set_config('test.business_b_id', (SELECT id::text FROM public.businesses WHERE name = 'B food business'), true);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.business_a_id')::uuid, 'alpha-kitchen', 'Alpha Kitchen', false);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.business_a2_id')::uuid, 'alpha-second', 'Alpha Second', false);

SELECT results_eq(
  $$SELECT slug FROM public.business_storefronts WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  ARRAY['alpha-kitchen'],
  'owner A can read their unpublished storefront'
);
SELECT results_eq(
  $$UPDATE public.business_storefronts SET display_name = 'Alpha Kitchen Updated'
    WHERE business_id = current_setting('test.business_a_id')::uuid
    RETURNING display_name$$,
  ARRAY['Alpha Kitchen Updated'],
  'owner A can update their storefront'
);
SELECT throws_ok(
  $$DELETE FROM public.business_storefronts WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  '42501', NULL,
  'owner A cannot delete their storefront'
);
SELECT throws_ok(
  $$UPDATE public.business_storefronts SET business_id = current_setting('test.business_a2_id')::uuid
    WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  '42501', NULL,
  'owner A cannot move a storefront to another business'
);
SELECT throws_ok(
  $$INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
    VALUES (current_setting('test.business_b_id')::uuid, 'forged-storefront', 'Forged', true)$$,
  '42501', NULL,
  'owner A cannot create a storefront for business B'
);
SELECT throws_ok(
  $$INSERT INTO public.business_storefronts (business_id, slug, display_name)
    VALUES (current_setting('test.business_a2_id')::uuid, 'Alpha-Unsafe', 'Unsafe')$$,
  '23514', NULL,
  'uppercase storefront slugs are rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.business_storefronts (business_id, slug, display_name)
    VALUES (current_setting('test.business_a2_id')::uuid, 'alpha-kitchen', 'Duplicate')$$,
  '23505', NULL,
  'duplicate storefront slugs are rejected'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
INSERT INTO public.business_storefronts (business_id, slug, display_name, is_published)
VALUES (current_setting('test.business_b_id')::uuid, 'bravo-kitchen', 'Bravo Kitchen', true);

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT results_eq(
  $$SELECT slug FROM public.business_storefronts ORDER BY slug$$,
  ARRAY['bravo-kitchen'],
  'anon sees only published storefronts'
);
SELECT throws_ok(
  $$DELETE FROM public.business_storefronts$$,
  '42501', NULL,
  'anon cannot delete storefronts'
);
SELECT throws_ok(
  $$INSERT INTO public.business_storefronts (business_id, slug, display_name)
    VALUES (gen_random_uuid(), 'anon-write', 'Anon')$$,
  '42501', NULL,
  'anon cannot insert storefronts'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT results_eq(
  $$SELECT slug FROM public.business_storefronts
    WHERE business_id = current_setting('test.business_b_id')::uuid$$,
  ARRAY['bravo-kitchen'],
  'authenticated non-owner sees the published storefront'
);
SELECT is(
  (SELECT count(*) FROM public.business_storefronts
   WHERE business_id = current_setting('test.business_a_id')::uuid),
  1::bigint,
  'owner A retains their unpublished storefront'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
SELECT is(
  (SELECT count(*) FROM public.business_storefronts
   WHERE business_id = current_setting('test.business_a_id')::uuid),
  0::bigint,
  'owner B cannot read owner A storefronts'
);
SELECT results_eq(
  $$UPDATE public.business_storefronts SET display_name = 'B attempted update'
    WHERE business_id = current_setting('test.business_a_id')::uuid
    RETURNING business_id$$,
  ARRAY[]::uuid[],
  'owner B foreign storefront update touches zero rows'
);
SELECT throws_ok(
  $$DELETE FROM public.business_storefronts WHERE business_id = current_setting('test.business_a_id')::uuid$$,
  '42501', NULL,
  'owner B cannot delete owner A storefronts'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
