DO $receipt_proof$
DECLARE
 v_tap text[] := ARRAY[]::text[]; v_line text; v_done boolean := false;
 v_pass integer; v_fail integer; v_clean boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM public.guest_receipts WHERE id='70c02b4c-ca79-4aba-907d-9556443cf245') OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='guest-receipts' AND name='5f0d1371-b3e5-4618-9d4d-6004a9af0162/0df67d8b-cdef-4427-b3cf-56c7d431d630/70c02b4c-ca79-4aba-907d-9556443cf245') THEN RAISE EXCEPTION 'fixture collision'; END IF;
 IF has_table_privilege('authenticated','public.guest_receipts','UPDATE') OR has_any_column_privilege('authenticated','public.guest_receipts','UPDATE') THEN RAISE EXCEPTION 'unsafe update denial probe'; END IF;
 BEGIN
 SET LOCAL search_path = pg_catalog, public, extensions;
 FOR v_line IN EXECUTE 'SELECT plan(29);' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT has_table(''public'', ''guest_receipts'', ''private staging metadata exists'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = ''public.guest_receipts''::regclass), ''RLS forced'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname = ''public'' AND tablename = ''guest_receipts''), 0, ''no browser metadata policies'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''anon'', ''public.guest_receipts'', ''SELECT''), ''anon cannot select metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''anon'', ''public.guest_receipts'', ''INSERT''), ''anon cannot insert metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''anon'', ''public.guest_receipts'', ''UPDATE''), ''anon cannot update metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''anon'', ''public.guest_receipts'', ''DELETE''), ''anon cannot delete metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''authenticated'', ''public.guest_receipts'', ''SELECT''), ''including anonymous Auth cannot select metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''authenticated'', ''public.guest_receipts'', ''INSERT''), ''including anonymous Auth cannot insert metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''authenticated'', ''public.guest_receipts'', ''UPDATE''), ''including anonymous Auth cannot update metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''authenticated'', ''public.guest_receipts'', ''DELETE''), ''including anonymous Auth cannot delete metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(has_schema_privilege(''service_role'', ''public'', ''USAGE''), ''service schema usage explicitly available'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(has_table_privilege(''service_role'', ''public.guest_receipts'', ''SELECT''), ''service SELECT available'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(has_table_privilege(''service_role'', ''public.guest_receipts'', ''INSERT''), ''service INSERT available'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(has_table_privilege(''service_role'', ''public.guest_receipts'', ''DELETE''), ''service exact-fixture DELETE available'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(NOT has_table_privilege(''service_role'', ''public.guest_receipts'', ''UPDATE''), ''no service attachment transition grant'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT is((SELECT public FROM storage.buckets WHERE id = ''guest-receipts''), false, ''bucket private'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = ''guest-receipts''), 10485760::bigint, ''bucket defense-in-depth byte cap'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = ''storage'' AND tablename = ''objects'' AND policyname = ''guest_receipts_no_browser_objects'' AND permissive = ''RESTRICTIVE'' AND roles @> ARRAY[''anon'',''authenticated'']::name[] AND cmd = ''ALL''), ''restrictive object fence covers all browser operations'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = ''storage'' AND tablename = ''buckets'' AND policyname = ''guest_receipts_no_browser_bucket_mutation'' AND permissive = ''RESTRICTIVE''), ''bucket cannot be publicized by browser'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ''public.guest_receipts''::regclass AND conname = ''guest_receipts_exact_object''), ''object bound to exact triple'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT is((SELECT count(*)::integer FROM pg_constraint WHERE conrelid = ''public.guest_receipts''::regclass AND contype = ''f''), 2, ''actor and business foreign keys'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 EXECUTE 'SET LOCAL ROLE anon;';
 FOR v_line IN EXECUTE 'SELECT throws_ok(''SELECT * FROM public.guest_receipts'', ''42501'', ''permission denied for table guest_receipts'', ''anon cannot enumerate metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT throws_ok($$INSERT INTO public.guest_receipts DEFAULT VALUES$$, ''42501'', ''permission denied for table guest_receipts'', ''anon cannot stage unvalidated metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 EXECUTE 'RESET ROLE;';
 EXECUTE 'SET LOCAL ROLE authenticated;';
 EXECUTE 'SELECT set_config(''request.jwt.claims'', ''{"sub":"0df67d8b-cdef-4427-b3cf-56c7d431d630","role":"authenticated","is_anonymous":true}'', true);';
 FOR v_line IN EXECUTE 'SELECT throws_ok(''SELECT * FROM public.guest_receipts'', ''42501'', ''permission denied for table guest_receipts'', ''guest cannot enumerate metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT throws_ok($$INSERT INTO public.guest_receipts DEFAULT VALUES$$, ''42501'', ''permission denied for table guest_receipts'', ''guest cannot stage unvalidated metadata'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT throws_ok($$UPDATE public.guest_receipts SET state = ''staged'' WHERE id = ''70c02b4c-ca79-4aba-907d-9556443cf245''$$, ''42501'', ''permission denied for table guest_receipts'', ''guest cannot overwrite'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 FOR v_line IN EXECUTE 'SELECT throws_ok($$INSERT INTO storage.objects(bucket_id,name) VALUES (''guest-receipts'',''5f0d1371-b3e5-4618-9d4d-6004a9af0162/0df67d8b-cdef-4427-b3cf-56c7d431d630/70c02b4c-ca79-4aba-907d-9556443cf245'')$$, ''42501'', NULL, ''guest direct Storage insert denied'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 EXECUTE 'SELECT set_config(''request.jwt.claims'', ''{"sub":"0df67d8b-cdef-4427-b3cf-56c7d431d630","role":"authenticated","email":"same@example.test","email_confirmed_at":"2026-01-01"}'', true);';
 FOR v_line IN EXECUTE 'SELECT throws_ok(''SELECT * FROM public.guest_receipts'', ''42501'', ''permission denied for table guest_receipts'', ''registered/owner/email claims do not grant staging access'');' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 EXECUTE 'RESET ROLE;';
 FOR v_line IN EXECUTE 'SELECT * FROM finish();' LOOP v_tap := array_append(v_tap, v_line); END LOOP;
 v_done := true;
 RAISE SQLSTATE 'QW001' USING MESSAGE='owned proof rollback';
 EXCEPTION WHEN SQLSTATE 'QW001' THEN
  IF NOT v_done THEN RAISE; END IF;
 END;
 v_clean := NOT EXISTS(SELECT 1 FROM public.guest_receipts WHERE id='70c02b4c-ca79-4aba-907d-9556443cf245') AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='guest-receipts' AND name='5f0d1371-b3e5-4618-9d4d-6004a9af0162/0df67d8b-cdef-4427-b3cf-56c7d431d630/70c02b4c-ca79-4aba-907d-9556443cf245');
 SELECT count(*) FILTER(WHERE l ~ '^ok [0-9]+'), count(*) FILTER(WHERE l ~ '^not ok') INTO v_pass,v_fail FROM unnest(v_tap) AS u(l);
 PERFORM set_config('qwerty.receipt_sql_proof',jsonb_build_object('target','jxebudqzcmxgdsegrrqw','planned',29,'passed',v_pass,'failed',v_fail,'tap',v_tap,'rollbackCompleted',v_done,'noFixtureResidue',v_clean,'accepted',v_pass=29 AND v_fail=0 AND v_clean AND array_position(v_tap,'1..29') IS NOT NULL)::text,true);
END $receipt_proof$;
SELECT current_setting('qwerty.receipt_sql_proof')::jsonb AS receipt_proof;
