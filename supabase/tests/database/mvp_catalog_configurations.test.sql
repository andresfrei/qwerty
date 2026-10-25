-- PREPARED ONLY: pgTAP, existing Supabase Auth schema and reviewed migrations required.
-- Run only in a disposable consented database, as a role able to SET ROLE and seed Auth.
-- No extensions installed; no Storage or existing tenant rows used. Not concurrency proof.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = public, extensions, pg_temp;
SELECT no_plan();

CREATE TEMP TABLE cc_fixture AS SELECT
  gen_random_uuid() AS owner, gen_random_uuid() AS stranger, gen_random_uuid() AS unconfirmed,
  gen_random_uuid() AS business, gen_random_uuid() AS other_business,
  gen_random_uuid() AS category, gen_random_uuid() AS other_category,
  gen_random_uuid() AS pizza, gen_random_uuid() AS dozen, gen_random_uuid() AS combo,
  gen_random_uuid() AS standard, gen_random_uuid() AS spare, gen_random_uuid() AS foreign_item,
  gen_random_uuid() AS size_group, gen_random_uuid() AS flavor_group,
  gen_random_uuid() AS variety_group, gen_random_uuid() AS spare_group,
  gen_random_uuid() AS size_option, gen_random_uuid() AS flavor_option,
  gen_random_uuid() AS variety_option, gen_random_uuid() AS spare_option,
  gen_random_uuid() AS component;
GRANT SELECT ON cc_fixture TO anon, authenticated, service_role;
INSERT INTO auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
SELECT owner, 'authenticated', 'authenticated', owner::text || '@fixture.invalid', now(), '{}'::jsonb, '{}'::jsonb FROM cc_fixture
UNION ALL SELECT stranger, 'authenticated', 'authenticated', stranger::text || '@fixture.invalid', now(), '{}'::jsonb, '{}'::jsonb FROM cc_fixture
UNION ALL SELECT unconfirmed, 'authenticated', 'authenticated', unconfirmed::text || '@fixture.invalid', NULL, '{}'::jsonb, '{}'::jsonb FROM cc_fixture;
INSERT INTO public.businesses(id, owner_id, name)
SELECT business, owner, 'Isolated configuration fixture' FROM cc_fixture
UNION ALL SELECT other_business, stranger, 'Other isolated fixture' FROM cc_fixture;
INSERT INTO public.business_storefronts(business_id, slug, display_name, is_published)
SELECT business, 'cc-' || business::text, 'Isolated fixture', true FROM cc_fixture;
INSERT INTO public.catalog_categories(id,business_id,name)
SELECT category,business,'Fixture' FROM cc_fixture
UNION ALL SELECT other_category,other_business,'Other fixture' FROM cc_fixture;
INSERT INTO public.catalog_items(id, business_id, category_id, name, price_minor, currency)
SELECT v.id, f.business, f.category, v.name, 1000, 'ARS' FROM cc_fixture f
CROSS JOIN LATERAL (VALUES (pizza,'Pizza'),(dozen,'Dozen'),(combo,'Combo'),(standard,'Legacy'),(spare,'Spare')) v(id,name)
UNION ALL SELECT foreign_item, other_business, other_category, 'Foreign fixture', 1000, 'ARS' FROM cc_fixture;
INSERT INTO public.catalog_option_groups(id, business_id, item_id, name, selection_mode, min_select, max_select)
SELECT v.id, f.business, v.item, v.name, v.mode, v.min, v.max FROM cc_fixture f
CROSS JOIN LATERAL (VALUES
  (size_group,pizza,'Size','distinct',1,1), (flavor_group,pizza,'Flavor','distinct',1,2),
  (variety_group,dozen,'Variety','quantity',12,12), (spare_group,spare,'Spare','distinct',0,1)
) v(id,item,name,mode,min,max);
INSERT INTO public.catalog_options(id, business_id, group_id, name)
SELECT v.id, f.business, v.grp, 'Option fixture' FROM cc_fixture f
CROSS JOIN LATERAL (VALUES (size_option,size_group),(flavor_option,flavor_group),
  (variety_option,variety_group),(spare_option,spare_group)) v(id,grp);

CREATE FUNCTION pg_temp.cc_document(p_kind text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT CASE p_kind
  WHEN 'pizza' THEN jsonb_build_object('schemaVersion',1,'kind','pizza','sizeGroupId',size_group,'flavorGroupId',flavor_group,
    'matrix',jsonb_build_array(jsonb_build_object('sizeOptionId',size_option,'flavorOptionId',flavor_option,'priceMinor',1000,'available',true)))
  WHEN 'dozen' THEN jsonb_build_object('schemaVersion',1,'kind','dozen','varietyGroupId',variety_group)
  WHEN 'combo' THEN jsonb_build_object('schemaVersion',1,'kind','combo','components',jsonb_build_array(jsonb_build_object(
    'componentId',component,'itemId',pizza,'quantity',2,'order',0,
    'fixedGroupPicks',jsonb_build_array(jsonb_build_object('groupId',flavor_group,'picks',jsonb_build_array(jsonb_build_object('optionId',flavor_option,'quantity',1)))),
    'allowedOptions',jsonb_build_array(jsonb_build_object('groupId',flavor_group,'optionIds',jsonb_build_array(flavor_option))))))
  ELSE '{"schemaVersion":1,"kind":"standard"}'::jsonb END FROM cc_fixture;
$$;
CREATE FUNCTION pg_temp.cc_save(p_item uuid, p_document jsonb, p_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.save_catalog_item_configuration(f.business,p_item,coalesce((
    SELECT version FROM public.catalog_item_configurations WHERE business_id=f.business AND item_id=p_item),0),p_active,p_document)
  FROM cc_fixture f;
$$;

SELECT ok(NOT has_column_privilege('authenticated','public.catalog_item_configurations','version','INSERT'), 'version not insertable');
SELECT ok(NOT has_column_privilege('authenticated','public.catalog_item_configurations','version','UPDATE'), 'version not assignable');
SELECT ok(NOT has_table_privilege('authenticated','public.catalog_item_configurations','DELETE'), 'owner no DELETE');
SELECT ok(NOT has_table_privilege('service_role','public.catalog_item_configurations','INSERT'), 'service no configuration writes');
SELECT ok(NOT has_column_privilege('authenticated','public.catalog_items','id','INSERT'), 'legacy INSERT(id) grant unchanged');
SELECT ok(NOT has_function_privilege('anon','public.save_catalog_item_configuration(uuid,uuid,bigint,boolean,jsonb)','EXECUTE'), 'anonymous cannot save');

SELECT set_config('request.jwt.claim.sub', owner::text, true) FROM cc_fixture;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',owner,'role','authenticated')::text, true) FROM cc_fixture;
SET LOCAL ROLE authenticated;
SELECT is((pg_temp.cc_save(pizza,pg_temp.cc_document('pizza'))->'profile'->>'version')::bigint,1::bigint,'verified owner creates at version 1') FROM cc_fixture;
SELECT is(pg_temp.cc_save(dozen,pg_temp.cc_document('dozen'))->>'code','saved','dozen valid') FROM cc_fixture;
SELECT is(pg_temp.cc_save(combo,pg_temp.cc_document('combo'))->>'code','saved','fixed pizza combo valid') FROM cc_fixture;
SELECT is((pg_temp.cc_save(pizza,pg_temp.cc_document('pizza'))->'profile'->>'version')::bigint,2::bigint,'CAS success advances even identical document') FROM cc_fixture;
SELECT is(public.save_catalog_item_configuration(business,pizza,1,true,pg_temp.cc_document('pizza'))->>'code',
  'configuration_version_conflict','stale CAS known zero-write conflict') FROM cc_fixture;
SELECT is((SELECT version FROM public.catalog_item_configurations WHERE item_id=pizza),2::bigint,'stale CAS version unchanged') FROM cc_fixture;
SELECT is((SELECT count(*) FROM public.catalog_item_configurations WHERE business_id=f.business),3::bigint,'stale CAS creates zero rows') FROM cc_fixture f;
SELECT is(public.save_catalog_item_configuration(business,pizza,0,true,pg_temp.cc_document('pizza'))->>'code',
  'configuration_version_conflict','duplicate create zero changes') FROM cc_fixture;
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,'null'::jsonb) FROM cc_fixture$$,'23514','invalid_catalog_configuration','active JSON null rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,NULL) FROM cc_fixture$$,'23514','invalid_catalog_configuration','SQL null rejected');
SELECT throws_ok($$UPDATE public.catalog_item_configurations SET document='{}' WHERE item_id=(SELECT pizza FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','direct owner invalid JSON cannot bypass RPC');
SELECT throws_ok($$INSERT INTO public.catalog_item_configurations(business_id,item_id,is_active,document)
  SELECT business,foreign_item,false,'null' FROM cc_fixture$$,'23503',NULL,'same-business composite item FK');
SELECT throws_ok($$UPDATE public.catalog_item_configurations SET document=document || '{"extra":true}' WHERE item_id=(SELECT pizza FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','unknown document keys rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{sizeGroupId}',to_jsonb(variety_group))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','wrong-item group rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix,0,sizeOptionId}',to_jsonb(flavor_option))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','wrong-group option rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix}','[]')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','matrix must cover size x flavor');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix}',
  (pg_temp.cc_document('pizza')->'matrix') || (pg_temp.cc_document('pizza')->'matrix'))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','duplicate matrix pair rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix,0,priceMinor}','9007199254740992')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','unsafe price rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix,0,priceMinor}','-1')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','negative price rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix,0,priceMinor}','1.5')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','fractional price rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,jsonb_set(pg_temp.cc_document('pizza'),'{matrix,0,available}','"true"')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','boolean is typed');
SELECT throws_ok($$SELECT pg_temp.cc_save(dozen,jsonb_set(pg_temp.cc_document('dozen'),'{varietyGroupId}','"not-a-uuid"')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','UUID syntax rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,itemId}',to_jsonb(combo))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','self reference rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,itemId}',to_jsonb(foreign_item))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','foreign business component rejected');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,quantity}','101')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','instance ceiling');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks,0,picks,0,quantity}','2')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','fixed distinct quantity must be one');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,allowedOptions,0,optionIds}','[]')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','fixed picks must obey allowlist');
SELECT throws_ok($$UPDATE public.catalog_item_configurations SET version=99 WHERE item_id=(SELECT pizza FROM cc_fixture)$$,
  '42501',NULL,'direct version metadata assignment denied');
SELECT throws_ok($$UPDATE public.catalog_item_configurations SET item_id=(SELECT spare FROM cc_fixture) WHERE item_id=(SELECT pizza FROM cc_fixture)$$,
  '42501',NULL,'direct record reparent denied');
SELECT throws_ok($$INSERT INTO public.catalog_option_groups(business_id,item_id,name,selection_mode,min_select,max_select)
  SELECT business,pizza,'Third group','distinct',0,1 FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','pizza must have exactly two groups');
SELECT throws_ok($$SELECT pg_temp.cc_save(combo,jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks,0,picks}','[]')) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','fixed complete selection must satisfy group minimum');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components}',
  (SELECT jsonb_agg(pg_temp.cc_document('combo')->'components'->0) FROM generate_series(1,33))))$$,
  '23514','invalid_catalog_configuration','component definition ceiling 32');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('pizza'),'{matrix}',
  (SELECT jsonb_agg(pg_temp.cc_document('pizza')->'matrix'->0) FROM generate_series(1,4097))))$$,
  '23514','invalid_catalog_configuration','matrix row ceiling 4096 (byte cap may bind first)');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks}',
  (SELECT jsonb_agg(jsonb_build_object('groupId',gen_random_uuid(),'picks','[]'::jsonb)) FROM generate_series(1,101))))$$,
  '23514','invalid_catalog_configuration','restriction group ceiling 100');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks,0,picks}',
  (SELECT jsonb_agg(jsonb_build_object('optionId',gen_random_uuid(),'quantity',1)) FROM generate_series(1,1001))))$$,
  '23514','invalid_catalog_configuration','fixed pick ceiling 1000');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,allowedOptions,0,optionIds}',
  (SELECT jsonb_agg(to_jsonb(gen_random_uuid())) FROM generate_series(1,1001))))$$,
  '23514','invalid_catalog_configuration','allowlist ID ceiling 1000');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,allowedOptions,0,optionIds}',
  jsonb_build_array(flavor_option,upper(flavor_option::text)))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','duplicate normalized allowlist IDs');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks,0,picks}',
  jsonb_build_array(jsonb_build_object('optionId',flavor_option,'quantity',1),jsonb_build_object('optionId',upper(flavor_option::text),'quantity',1)))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','duplicate normalized fixed options');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components,0,fixedGroupPicks}',
  (pg_temp.cc_document('combo')#>'{components,0,fixedGroupPicks}') || (pg_temp.cc_document('combo')#>'{components,0,fixedGroupPicks}')))$$,
  '23514','invalid_catalog_configuration','duplicate fixed groups');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components}',
  (pg_temp.cc_document('combo')->'components') || jsonb_build_array(
    jsonb_set(pg_temp.cc_document('combo')#>'{components,0}','{order}','1')
  )))$$,
  '23514','invalid_catalog_configuration','duplicate component IDs');
SELECT throws_ok($$SELECT private.catalog_configuration_shape(jsonb_set(pg_temp.cc_document('combo'),'{components}',
  (pg_temp.cc_document('combo')->'components') || jsonb_build_array(
    jsonb_set(pg_temp.cc_document('combo')#>'{components,0}','{componentId}',to_jsonb(gen_random_uuid()))
  )))$$,
  '23514','invalid_catalog_configuration','duplicate component orders');
SELECT throws_ok($$UPDATE public.catalog_option_groups SET item_id=(SELECT spare FROM cc_fixture) WHERE id=(SELECT flavor_group FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','legacy group reparent guarded');
SELECT throws_ok($$UPDATE public.catalog_options SET group_id=(SELECT spare_group FROM cc_fixture) WHERE id=(SELECT flavor_option FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','legacy option reparent guarded');
SELECT throws_ok($$UPDATE public.catalog_option_groups SET max_select=3 WHERE id=(SELECT flavor_group FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','legacy semantic bounds guarded');
SELECT throws_ok($$UPDATE public.catalog_items SET currency='USD' WHERE id=(SELECT pizza FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','child currency transition guarded');
SELECT throws_ok($$UPDATE public.catalog_items SET currency='USD' WHERE id=(SELECT combo FROM cc_fixture)$$,
  '23514','invalid_catalog_configuration','parent currency transition guarded');
SELECT lives_ok($$UPDATE public.catalog_options SET is_available=false WHERE id=(SELECT flavor_option FROM cc_fixture)$$,
  'agotado fixed option is not a structural invalidation');
SELECT lives_ok($$UPDATE public.catalog_items SET is_available=false WHERE id=(SELECT pizza FROM cc_fixture)$$,
  'agotado child item is not a structural invalidation');
SELECT lives_ok($$UPDATE public.catalog_items SET name='Renamed',price_minor=1200 WHERE id=(SELECT dozen FROM cc_fixture)$$,
  'unrelated name and normal price remain editable');
SELECT lives_ok($$UPDATE public.catalog_options SET name='Renamed option',price_delta_minor=100 WHERE id=(SELECT flavor_option FROM cc_fixture)$$,
  'normal option names and delta prices remain editable');
SELECT is(pg_temp.cc_save(standard,'null',false)->>'code','saved','inactive JSON null is bounded draft, not active profile') FROM cc_fixture;
SELECT throws_ok($$SELECT pg_temp.cc_save(standard,to_jsonb(repeat('x',262145)),false) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','inactive draft byte ceiling enforced');
SELECT throws_ok($$SELECT pg_temp.cc_save(standard,'[[[[[[[[[[[[[0]]]]]]]]]]]]]',false) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','draft depth ceiling enforced');
-- Nested transition: parent now depends on an ungrouped legacy leaf, then attempt
-- to turn that leaf into a combo. Parent must make the otherwise-valid edit fail.
SELECT is(pg_temp.cc_save(combo,jsonb_build_object('schemaVersion',1,'kind','combo','components',jsonb_build_array(
  jsonb_build_object('componentId',component,'itemId',standard,'quantity',1,'order',0,'fixedGroupPicks','[]'::jsonb,'allowedOptions','[]'::jsonb))))->>'code',
  'saved','parent may depend on legacy leaf') FROM cc_fixture;
SELECT throws_ok($$SELECT pg_temp.cc_save(standard,jsonb_build_object('schemaVersion',1,'kind','combo','components',jsonb_build_array(
  jsonb_build_object('componentId',gen_random_uuid(),'itemId',pizza,'quantity',1,'order',0,'fixedGroupPicks','[]'::jsonb,'allowedOptions','[]'::jsonb)))) FROM cc_fixture$$,
  '23514','invalid_catalog_configuration','child profile transition cannot introduce nesting');
SELECT is(pg_temp.cc_save(combo,pg_temp.cc_document('combo'))->>'code','saved','restore parent document via owner save') FROM cc_fixture;
RESET ROLE;

-- Confirmed nonowner and unconfirmed owner cannot adopt the known business ID.
SELECT set_config('request.jwt.claim.sub',stranger::text,true) FROM cc_fixture;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,pg_temp.cc_document('pizza')) FROM cc_fixture$$,
  '42501','configuration_forbidden','confirmed nonowner denied');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id=(SELECT owner FROM cc_fixture);
SELECT set_config('request.jwt.claim.sub',owner::text,true) FROM cc_fixture;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.cc_save(pizza,pg_temp.cc_document('pizza')) FROM cc_fixture$$,
  '42501','configuration_forbidden','unconfirmed owner denied independently in SQL');
SELECT throws_ok($$INSERT INTO public.catalog_item_configurations(business_id,item_id,is_active,document)
  SELECT business,spare,true,'{"schemaVersion":1,"kind":"standard"}' FROM cc_fixture$$,
  '42501',NULL,'unconfirmed direct write denied by RLS');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM public.catalog_item_configurations WHERE item_id=(SELECT combo FROM cc_fixture)),1::bigint,
  'published available parent profile visible despite unavailable child');
SELECT is((SELECT count(*) FROM public.catalog_item_configurations WHERE item_id=(SELECT pizza FROM cc_fixture)),0::bigint,
  'unavailable parent profile private');
SELECT is((SELECT count(*) FROM public.catalog_item_configurations WHERE item_id=(SELECT standard FROM cc_fixture)),0::bigint,
  'inactive draft private');
SELECT is((SELECT version FROM public.catalog_configuration_capabilities()),2,'public capability version typed');
SELECT is((SELECT "schemaVersion" FROM public.catalog_configuration_capabilities()),1,'public schema version typed');
RESET ROLE;
UPDATE public.business_storefronts SET is_published=false WHERE business_id=(SELECT business FROM cc_fixture);
SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM public.catalog_item_configurations WHERE business_id=(SELECT business FROM cc_fixture)),0::bigint,
  'unpublished profiles private');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
