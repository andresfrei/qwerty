BEGIN;

SELECT plan(47);

SELECT has_table('public', 'businesses', 'businesses table exists');
SELECT has_table('public', 'business_memberships', 'business_memberships table exists');

SELECT ok(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'businesses')
  = ARRAY['id', 'owner_id', 'name', 'created_at']::text[],
  'businesses has only the MVP columns'
);
SELECT ok(
  (SELECT array_agg(column_name::text ORDER BY ordinal_position)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'business_memberships')
  = ARRAY['business_id', 'user_id', 'created_at']::text[],
  'business_memberships has only future-membership columns'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.businesses'::regclass),
  'businesses has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_memberships'::regclass),
  'business_memberships has row-level security enabled'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_memberships'
      AND column_name IN ('role', 'status')
  ),
  'business_memberships has no role or status semantics'
);
SELECT ok(
  (SELECT array_agg(a.attname ORDER BY key.ord)
   FROM pg_constraint c
   CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS key(attnum, ord)
   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
   WHERE c.conrelid = 'public.business_memberships'::regclass
     AND c.contype = 'p')
  = ARRAY['business_id', 'user_id']::name[],
  'business_memberships primary key is the business/user pair'
);

SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'id', 'SELECT'), 'authenticated can select business IDs');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'owner_id', 'SELECT'), 'authenticated can select business owners');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'name', 'SELECT'), 'authenticated can select business names');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'created_at', 'SELECT'), 'authenticated can select business timestamps');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'owner_id', 'INSERT'), 'authenticated can insert an owner ID');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'name', 'INSERT'), 'authenticated can insert a business name');
SELECT ok(has_column_privilege('authenticated', 'public.businesses', 'name', 'UPDATE'), 'authenticated can update business names');
SELECT ok(NOT has_column_privilege('authenticated', 'public.businesses', 'owner_id', 'UPDATE'), 'authenticated cannot update business owners');
SELECT ok(NOT has_table_privilege('authenticated', 'public.businesses', 'DELETE'), 'authenticated cannot delete businesses');
SELECT ok(NOT has_table_privilege('anon', 'public.businesses', 'SELECT'), 'anon cannot select businesses');
SELECT ok(NOT has_table_privilege('public', 'public.businesses', 'SELECT'), 'PUBLIC cannot select businesses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_memberships', 'SELECT'), 'authenticated cannot select memberships');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_memberships', 'INSERT'), 'authenticated cannot insert memberships');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_memberships', 'UPDATE'), 'authenticated cannot update memberships');
SELECT ok(NOT has_table_privilege('authenticated', 'public.business_memberships', 'DELETE'), 'authenticated cannot delete memberships');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_memberships'),
  'business_memberships has no client policies'
);
SELECT is(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'businesses'),
  3::bigint,
  'businesses has exactly select, insert, and update policies'
);
SELECT ok(
  (SELECT bool_and(roles = ARRAY['authenticated']::name[] AND (
    coalesce(qual, '') LIKE '%owner_id%' OR coalesce(with_check, '') LIKE '%owner_id%'
  )) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'businesses') IS TRUE,
  'business policies target authenticated owners'
);
SELECT ok(
  (SELECT bool_and(
    (coalesce(qual, '') LIKE '%auth.uid()%' OR coalesce(with_check, '') LIKE '%auth.uid()%')
    AND (coalesce(qual, '') LIKE '%owner_id%' OR coalesce(with_check, '') LIKE '%owner_id%')
  ) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'businesses') IS TRUE,
  'business policies anchor authorization directly to owner_id and auth.uid'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'businesses' AND cmd = 'DELETE'),
  'businesses has no delete policy'
);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test', '2026-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A first business');
INSERT INTO public.businesses (owner_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A second business');
SELECT set_config(
  'test.business_a_id',
  (SELECT id::text FROM public.businesses WHERE name = 'A first business'),
  true
);
SELECT is(
  (SELECT count(*) FROM public.businesses),
  2::bigint,
  'owner A can own multiple businesses'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
SELECT is(
  (SELECT count(*) FROM public.businesses),
  0::bigint,
  'owner B cannot read owner A businesses'
);
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE id = current_setting('test.business_a_id')::uuid),
  0::bigint,
  'owner B cannot read a known cross-business ID'
);
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE id = current_setting('test.business_a_id')::uuid),
  0::bigint,
  'owner B cannot address a cross-business row for update'
);
SELECT lives_ok(
  $$UPDATE public.businesses SET name = 'B attempted update' WHERE id = current_setting('test.business_a_id')::uuid$$,
  'owner B update against a cross-business ID is harmless'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT throws_ok(
  $$INSERT INTO public.businesses (owner_id, name) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'forged owner')$$,
  '42501',
  NULL,
  'owner A cannot insert a business owned by B'
);
SELECT throws_ok(
  $$INSERT INTO public.businesses (owner_id, name) VALUES (NULL, 'null owner')$$,
  '42501',
  NULL,
  'owner A cannot insert a business with a null owner'
);
SELECT throws_ok(
  $$UPDATE public.businesses SET owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  'owner A cannot transfer ownership to B'
);
SELECT throws_ok(
  $$UPDATE public.businesses SET owner_id = NULL WHERE owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  'owner A cannot set owner_id to null'
);
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2::bigint,
  'owner A retains both ownership rows after forgery attempts'
);
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE name = 'B attempted update'),
  0::bigint,
  'owner B update did not change any business'
);
UPDATE public.businesses SET name = 'A renamed business' WHERE name = 'A first business';
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE name = 'A renamed business'),
  1::bigint,
  'owner A can update the mutable name field'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT auth.uid()), NULL::uuid, 'a missing UID resolves to NULL');
SELECT is((SELECT count(*) FROM public.businesses), 0::bigint, 'a NULL UID cannot read businesses');
SELECT throws_ok(
  $$INSERT INTO public.businesses (owner_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'null uid')$$,
  '42501',
  NULL,
  'a NULL UID cannot insert a business'
);

SET ROLE anon;
SELECT throws_ok(
  $$SELECT id FROM public.businesses LIMIT 1$$,
  '42501',
  NULL,
  'anon cannot read businesses'
);
SELECT throws_ok(
  $$INSERT INTO public.businesses (owner_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'anon write')$$,
  '42501',
  NULL,
  'anon cannot write businesses'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
SELECT throws_ok(
  $$INSERT INTO public.business_memberships (business_id, user_id) VALUES (current_setting('test.business_a_id')::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '42501',
  NULL,
  'even an owner cannot forge a membership row'
);

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.businesses WHERE owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND name = 'A renamed business'),
  1::bigint,
  'owner update changed only the business name'
);

SELECT * FROM finish();
ROLLBACK;
