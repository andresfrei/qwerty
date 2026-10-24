-- PREPARED ONLY. pgTAP must already exist; no extension or Storage installation.
-- Disposable DB / SET ROLE operator / all reviewed migrations / explicit T7 consent.
-- Synthetic Auth and receipt metadata only; fresh UUIDs, unconditional transaction rollback.
-- These single-session cases are NOT evidence of concurrent serialization.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = public, extensions, pg_temp;
SELECT no_plan();
CREATE TEMP TABLE po_fixture AS SELECT
  gen_random_uuid() AS owner, gen_random_uuid() AS buyer, gen_random_uuid() AS stranger,
  gen_random_uuid() AS business, gen_random_uuid() AS other_business,
  gen_random_uuid() AS category, gen_random_uuid() AS item,
  gen_random_uuid() AS old_request, gen_random_uuid() AS new_request,
  gen_random_uuid() AS old_receipt, gen_random_uuid() AS new_receipt,
  gen_random_uuid() AS third_receipt;
GRANT SELECT ON po_fixture TO anon, authenticated, service_role;
CREATE TEMP TABLE po_state(key text PRIMARY KEY, value jsonb);
GRANT SELECT, INSERT, UPDATE ON po_state TO authenticated, service_role;
INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,is_anonymous,raw_app_meta_data,raw_user_meta_data)
SELECT owner,'authenticated','authenticated',owner::text || '@fixture.invalid',now(),false,'{}','{}' FROM po_fixture
UNION ALL SELECT buyer,'authenticated','authenticated',NULL,NULL,true,'{}','{}' FROM po_fixture
UNION ALL SELECT stranger,'authenticated','authenticated',stranger::text || '@fixture.invalid',now(),false,'{}','{}' FROM po_fixture;
INSERT INTO public.businesses(id,owner_id,name)
SELECT business,owner,'Isolated pickup fixture' FROM po_fixture
UNION ALL SELECT other_business,stranger,'Other isolated pickup fixture' FROM po_fixture;
INSERT INTO public.business_storefronts(business_id,slug,display_name,is_published)
SELECT business,'po-' || business::text,'Isolated fixture',true FROM po_fixture;
INSERT INTO public.catalog_categories(id,business_id,name) SELECT category,business,'Fixture' FROM po_fixture;
INSERT INTO public.catalog_items(id,business_id,category_id,name,price_minor,currency)
SELECT item,business,category,'Fixture item',1000,'ARS' FROM po_fixture;
INSERT INTO public.guest_receipts(id,actor_id,business_id,object_path,content_type,size_bytes,sha256)
SELECT r.id,buyer,business,business::text || '/' || buyer::text || '/' || r.id::text,'image/png',1,repeat('a',64)
FROM po_fixture CROSS JOIN LATERAL (VALUES(old_receipt),(new_receipt),(third_receipt)) r(id);

CREATE FUNCTION pg_temp.po_intent(p_version integer,p_request uuid,p_receipt uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('version',p_version,'slug','po-' || business::text,
    'requestId',p_request,'receiptId',p_receipt,
    'contact',jsonb_build_object('name','Fixture buyer','email','buyer@fixture.invalid','telephone','111'),
    'expected',jsonb_build_object('currency','ARS','totalMinor',1000),
    'lines',jsonb_build_array(jsonb_build_object('itemId',item,'quantity',1,'selection',
      CASE WHEN p_version=1 THEN '[]'::jsonb ELSE
        jsonb_build_object('kind','leaf','profileVersion',1,'groups','[]'::jsonb) END))) FROM po_fixture;
$$;
CREATE FUNCTION pg_temp.po_quote(p_intent jsonb,p_fingerprint text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('version',p_intent->'version','businessId',business,'snapshotFingerprint',p_fingerprint,
    'contact',p_intent->'contact','currency','ARS','totalMinor',1000,
    'lines',jsonb_build_array(jsonb_build_object('itemId',item,'quantity',1,'selection',p_intent->'lines'->0->'selection',
      'name','Fixture item','currency','ARS','unitPriceMinor',1000,'lineTotalMinor',1000,'surchargeMinor',0,
      'selectionText','','groups','[]'::jsonb,'components','[]'::jsonb))) FROM po_fixture;
$$;
SELECT ok(NOT has_function_privilege('anon','public.pickup_order_catalog_v2(uuid,text)','EXECUTE'),'anonymous snapshot denied');
SELECT ok(NOT has_function_privilege('authenticated','public.pickup_order_catalog_v2(uuid,text)','EXECUTE'),'owner snapshot denied');
SELECT ok(NOT has_function_privilege('authenticated','public.finalize_pickup_order_v2(uuid,uuid,jsonb,jsonb)','EXECUTE'),'browser finalizer denied');
SELECT ok(has_function_privilege('service_role','public.finalize_pickup_order_v2(uuid,uuid,jsonb,jsonb)','EXECUTE'),'service finalizer allowed');
SELECT ok(NOT has_table_privilege('service_role','public.pickup_orders','UPDATE'),'historical order immutability unchanged');
SET LOCAL ROLE service_role;
INSERT INTO po_state VALUES ('v1intent',(SELECT pg_temp.po_intent(1,old_request,old_receipt) FROM po_fixture));
INSERT INTO po_state VALUES ('v1quote',(SELECT pg_temp.po_quote((SELECT value FROM po_state WHERE key='v1intent'),
  public.pickup_order_catalog(business,'po-' || business::text)->>'fingerprint') FROM po_fixture));
INSERT INTO po_state VALUES ('v1created',(SELECT public.finalize_pickup_order(buyer,business,
  (SELECT value FROM po_state WHERE key='v1intent'),(SELECT value FROM po_state WHERE key='v1quote')) FROM po_fixture));
SELECT is((SELECT value->>'code' FROM po_state WHERE key='v1created'),'created','legacy v1 normal order still creates');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',owner::text,true) FROM po_fixture;
SET LOCAL ROLE authenticated;
SELECT is(public.save_catalog_item_configuration(business,item,0,true,'{"schemaVersion":1,"kind":"standard"}')->>'code',
  'saved','activate optional standard profile') FROM po_fixture;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is(public.finalize_pickup_order(buyer,business,(SELECT value FROM po_state WHERE key='v1intent'),
  (SELECT value FROM po_state WHERE key='v1quote'))->>'code','replayed','historical v1 replay survives activation') FROM po_fixture;
SELECT throws_ok($$SELECT public.finalize_pickup_order(buyer,business,pg_temp.po_intent(1,new_request,new_receipt),
  pg_temp.po_quote(pg_temp.po_intent(1,new_request,new_receipt),public.pickup_order_catalog(business,'po-' || business::text)->>'fingerprint')) FROM po_fixture$$,
  '23514','profile_required','OLD RPC cannot create a new profiled v1 order');
SELECT throws_ok($$INSERT INTO public.pickup_orders(actor_id,business_id,request_id,receipt_id,intent,quote,currency,total_minor)
  SELECT buyer,business,new_request,new_receipt,pg_temp.po_intent(1,new_request,new_receipt),
  pg_temp.po_quote(pg_temp.po_intent(1,new_request,new_receipt),'irrelevant'),'ARS',1000 FROM po_fixture$$,
  '23514','profile_required','direct old writer cannot downgrade');
INSERT INTO po_state VALUES ('snapshot',(SELECT public.pickup_order_catalog_v2(business,'po-' || business::text) FROM po_fixture));
SELECT is((SELECT (value->>'version')::integer FROM po_state WHERE key='snapshot'),2,'snapshot v2');
SELECT is((SELECT (value->>'schemaVersion')::integer FROM po_state WHERE key='snapshot'),1,'document schema1');
SELECT is((SELECT value->'profiles'->0->>'item_id' FROM po_state WHERE key='snapshot'),item::text,'exact profile item projection') FROM po_fixture;
SELECT is((SELECT value->'profiles'->0->'document' FROM po_state WHERE key='snapshot'),'{"schemaVersion":1,"kind":"standard"}'::jsonb,'exact T1 document projection');
SELECT is(public.pickup_order_catalog_v2(business,'po-' || business::text),(SELECT value FROM po_state WHERE key='snapshot'),'stable ordered snapshot') FROM po_fixture;
INSERT INTO po_state VALUES ('intent',(SELECT pg_temp.po_intent(2,new_request,new_receipt) FROM po_fixture));
INSERT INTO po_state VALUES ('quote',pg_temp.po_quote((SELECT value FROM po_state WHERE key='intent'),(SELECT value->>'fingerprint' FROM po_state WHERE key='snapshot')));
SELECT is(public.finalize_pickup_order_v2(stranger,business,(SELECT value FROM po_state WHERE key='intent'),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'invalid_receipt','receipt actor binding') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,other_business,(SELECT value FROM po_state WHERE key='intent'),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'invalid_receipt','receipt business binding') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),NULL)->>'code',
  'invalid_quote','missing quote rejected') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),
  jsonb_set((SELECT value FROM po_state WHERE key='quote'),'{totalMinor}','999'))->>'code','invalid_quote','expected total mismatch') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),
  jsonb_set((SELECT value FROM po_state WHERE key='quote'),'{lines}','[]'))->>'code','invalid_quote','quote line length mismatch') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),
  jsonb_set((SELECT value FROM po_state WHERE key='quote'),'{lines,0,currency}','"USD"'))->>'code','mixed_currency','line currency mismatch') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),
  jsonb_set((SELECT value FROM po_state WHERE key='quote'),'{snapshotFingerprint}',to_jsonb(repeat('b',64))))->>'code','catalog_changed','changed hash rejected') FROM po_fixture;
SELECT is((SELECT count(*) FROM public.pickup_orders WHERE business_id=f.business),1::bigint,'all rejected attempts created zero orders') FROM po_fixture f;
RESET ROLE;
-- Unavailable rows stay in service fingerprints, even though public projection
-- must later withhold their private details. This is a freshness test, not pricing.
UPDATE public.catalog_items SET is_available=false WHERE id=(SELECT item FROM po_fixture);
SET LOCAL ROLE service_role;
SELECT is((public.pickup_order_catalog_v2(business,'po-' || business::text)->'items'->0->>'is_available')::boolean,false,
  'snapshot includes unavailable item') FROM po_fixture;
SELECT isnt(public.pickup_order_catalog_v2(business,'po-' || business::text)->>'fingerprint',
  (SELECT value->>'fingerprint' FROM po_state WHERE key='snapshot'),'unavailability changes hash') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'catalog_changed','stale quote rejected after catalog change') FROM po_fixture;
RESET ROLE;
UPDATE public.catalog_items SET is_available=true WHERE id=(SELECT item FROM po_fixture);
SET LOCAL ROLE authenticated;
SELECT is(public.save_catalog_item_configuration(business,item,1,false,'null')->>'code','saved','deactivation recorded') FROM po_fixture;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT isnt(public.pickup_order_catalog_v2(business,'po-' || business::text)->>'fingerprint',
  (SELECT value->>'fingerprint' FROM po_state WHERE key='snapshot'),'inactive state/version/document changes hash') FROM po_fixture;
SELECT is((public.pickup_order_catalog_v2(business,'po-' || business::text)->'profiles'->0->>'is_active')::boolean,false,
  'service snapshot retains inactive profile state') FROM po_fixture;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT is(public.save_catalog_item_configuration(business,item,2,true,'{"schemaVersion":1,"kind":"standard"}')->>'code','saved','reactivate at new version') FROM po_fixture;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE po_state SET value=jsonb_set(value,'{lines,0,selection,profileVersion}','3') WHERE key='intent';
UPDATE po_state SET value=pg_temp.po_quote((SELECT value FROM po_state WHERE key='intent'),
  (SELECT public.pickup_order_catalog_v2(business,'po-' || business::text)->>'fingerprint' FROM po_fixture)) WHERE key='quote';
INSERT INTO po_state VALUES ('created',(SELECT public.finalize_pickup_order_v2(buyer,business,
  (SELECT value FROM po_state WHERE key='intent'),(SELECT value FROM po_state WHERE key='quote')) FROM po_fixture));
SELECT is((SELECT value->>'code' FROM po_state WHERE key='created'),'created','v2 accepted with fresh snapshot');
SELECT is((SELECT value->'order'->'intent'->>'version' FROM po_state WHERE key='created'),'2','same order table stores version2');
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),NULL)->>'code',
  'replayed','v2 replay before quote validation') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,
  jsonb_set((SELECT value FROM po_state WHERE key='intent'),'{contact,name}','"Other"'),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'idempotency_conflict','same attempt with different intent conflicts') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,
  jsonb_set((SELECT value FROM po_state WHERE key='intent'),'{requestId}',to_jsonb(gen_random_uuid())),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'receipt_used','receipt uniqueness independent of new attempt') FROM po_fixture;
SELECT throws_ok($$INSERT INTO public.pickup_orders(actor_id,business_id,request_id,receipt_id,intent,quote,currency,total_minor)
  SELECT buyer,business,gen_random_uuid(),new_receipt,(SELECT value FROM po_state WHERE key='intent'),
  (SELECT value FROM po_state WHERE key='quote'),'ARS',1000 FROM po_fixture$$,'23505',NULL,'durable receipt uniqueness for non-RPC writer');
SELECT throws_ok($$INSERT INTO public.pickup_orders(actor_id,business_id,request_id,receipt_id,intent,quote,currency,total_minor)
  SELECT buyer,business,new_request,third_receipt,(SELECT value FROM po_state WHERE key='intent'),
  (SELECT value FROM po_state WHERE key='quote'),'ARS',1000 FROM po_fixture$$,'23505',NULL,'durable attempt uniqueness for non-RPC writer');
RESET ROLE;
UPDATE public.business_storefronts SET is_published=false WHERE business_id=(SELECT business FROM po_fixture);
SET LOCAL ROLE service_role;
SELECT is(public.finalize_pickup_order_v2(buyer,business,(SELECT value FROM po_state WHERE key='intent'),NULL)->>'code',
  'replayed','v2 replay before publication/catalog lookup') FROM po_fixture;
SELECT is(public.finalize_pickup_order(buyer,business,(SELECT value FROM po_state WHERE key='v1intent'),NULL)->>'code',
  'replayed','historical v1 replay also before publication/quote') FROM po_fixture;
SELECT is(public.finalize_pickup_order_v2(buyer,business,
  pg_temp.po_intent(2,gen_random_uuid(),third_receipt),(SELECT value FROM po_state WHERE key='quote'))->>'code',
  'unavailable','new v2 order cannot use unpublished catalog') FROM po_fixture;
SELECT is((SELECT count(*) FROM public.pickup_orders WHERE business_id=f.business),2::bigint,'exactly legacy plus v2 order remain') FROM po_fixture f;
SELECT is((SELECT to_jsonb(o) FROM public.pickup_orders o WHERE request_id=f.old_request),
  (SELECT value->'order' FROM po_state WHERE key='v1created'),'historical v1 row byte-equivalent JSON') FROM po_fixture f;
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
