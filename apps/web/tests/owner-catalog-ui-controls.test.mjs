import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,nodes,category,item,group,option,storefront} from './owner-first-store-fixtures.mjs';
test('catalog has real category/product/group/option/surcharge/publication forms',()=>{
 const h=harness('catalog/catalog-editor-client.tsx',{categories:[category],items:[item],groups:[group],options:[option],storefront,surchargeMinor:0});
 const actions=nodes(h.render()).filter(n=>n.type==='input'&&n.props.name==='action').map(n=>n.props.value);
 for(const a of ['create_category','rename_category','reorder_category','create_product','update_product','create_option_group','update_option_group','create_option','update_option','set_two_flavor_surcharge','set_published'])assert.ok(actions.includes(a),a);
});
