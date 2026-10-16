// Actual application with synthetic responses only. No Deepfield process or saved game.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
let browser,checks=0;const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const star=(id,n)=>({id,name:['Hearth','Lumen'][id],x:20+id*30,y:40,known:true,visible:true,owner:0,ships:[n+2,0],fleets:[[n,0,2,0,0],[0,0,0,0,0]],scouts:[1,0],defense:0,collectors:1});
let state={turn:1,deadline:'2099-01-01T00:00:00Z',winner:null,team:0,name:'Edit fixture',credits:60,revision:0,orders:[],reports:[],messages:[],stars:[star(0,8),star(1,4)],energy:2,goal:8,intelligence:[],reconRates:{distant:90},economyVersion:1,nextIncome:36,combatVersion:1};
let hold=false,waiting=[],gets=0,puts=[],reject=false;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/campaign'){gets++;const json={campaign:structuredClone(state),localTest:false};if(hold){waiting.push(()=>route.fulfill({json}));return;}await route.fulfill({json});return;}
  if(path==='/api/orders'){const body=route.request().postDataJSON();puts.push(body);if(reject){await route.abort();return;}state={...state,orders:body.orders,revision:state.revision+1};await route.fulfill({json:{revision:state.revision}});return;}
  throw Error('Unexpected request '+path);
 });
 const flush=async()=>{hold=false;const queue=waiting;waiting=[];await Promise.all(queue.map(f=>f()));};
 const login=async()=>{await page.getByLabel('Clan access key').fill('fixture-key');await page.getByRole('button',{name:'Enter command deck'}).click();await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();};
 const queue=()=>page.locator('.queue li'),edit=()=>page.getByRole('button',{name:'Edit order 1',exact:true}),save=()=>page.getByRole('button',{name:'Save maneuver',exact:true});
 const snapshot=()=>queue().allTextContents();
 const add=async n=>{await page.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await page.getByLabel('Send Interceptor',{exact:true}).fill(String(n));await page.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});};
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await login();await add(3);await add(2);
 const original=await snapshot(),ids=await queue().evaluateAll(items=>items.map(i=>i.dataset.draftId));await edit().click();
 check(await page.getByLabel('Maneuver ships').inputValue()==='3'&&await page.getByLabel('Maneuver source').inputValue()==='0'&&await page.getByLabel('Maneuver destination').inputValue()==='1'&&await page.getByLabel('Maneuver hull').inputValue()==='interceptor','Edit prefills existing source, target, hull and count');
 check(await page.getByText('6 ships available, excluding this item.',{exact:true}).isVisible(),'Editor releases own reservation but retains the other draft item');
 await page.getByLabel('Maneuver ships').fill('7');check(await save().isDisabled(),'Overspending other reservations disables Save');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();check(JSON.stringify(await snapshot())===JSON.stringify(original),'Cancel leaves draft unchanged');
 await edit().click();await page.getByLabel('Maneuver ships').fill('5');await page.keyboard.press('Escape');check(JSON.stringify(await snapshot())===JSON.stringify(original),'Escape leaves draft unchanged');
 await edit().click();await page.getByLabel('Maneuver ships').fill('5');await page.getByRole('button',{name:'Close edit',exact:true}).click();check(JSON.stringify(await snapshot())===JSON.stringify(original),'Close leaves draft unchanged');
 await edit().click();await page.goBack();check(await page.getByRole('dialog').count()===0&&JSON.stringify(await snapshot())===JSON.stringify(original),'Browser Back leaves draft unchanged');
 await edit().click();await page.getByLabel('Maneuver ships').fill('6');hold=true;const before=gets;await save().evaluate(b=>{b.click();b.click();});await page.getByRole('button',{name:'Cancel',exact:true}).focus();
 check(gets===before+1,'Repeated Save starts one validation request');await flush();await page.getByRole('dialog').waitFor({state:'detached'});
 check((await queue().nth(0).innerText()).includes('6 interceptor')&&await queue().count()===2&&JSON.stringify(await queue().evaluateAll(items=>items.map(i=>i.dataset.draftId)))===JSON.stringify(ids),'Save replaces same stable item without reordering or duplicating');
 await edit().click();await page.getByLabel('Maneuver hull').selectOption('cruiser');check(await save().isDisabled(),'Hull change recalculates availability');await page.getByLabel('Maneuver ships').fill('2');await save().click();await page.getByRole('dialog').waitFor({state:'detached'});
 check((await queue().first().innerText()).includes('2 cruiser'),'Changed hull saved in original position');
 await edit().click();await page.getByLabel('Maneuver hull').selectOption('interceptor');await page.getByLabel('Maneuver source').selectOption('1');await page.getByLabel('Maneuver ships').fill('5');check(await save().isDisabled()&&await page.getByLabel('Maneuver destination').inputValue()==='0','Source change resets linked destination and revalidates count');
 await page.getByLabel('Maneuver ships').fill('4');await save().click();await page.getByRole('dialog').waitFor({state:'detached'});
 await edit().click();await page.getByLabel('Maneuver action').selectOption('collector');await save().click();await page.getByRole('dialog').waitFor({state:'detached'});check((await queue().first().innerText()).includes('Collector at Lumen'),'Action type change replaces same item');
 await edit().click();await page.getByLabel('Maneuver action').selectOption('recon');await page.getByLabel('Maneuver mission').selectOption('deep');await save().click();await page.getByRole('dialog').waitFor({state:'detached'});
 check((await queue().first().innerText()).includes('deep recon'),'Recon type change validates and saves mission');
 await edit().click();const cancelBefore=await snapshot();hold=true;await save().click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await flush();check(JSON.stringify(await snapshot())===JSON.stringify(cancelBefore),'Cancel during validation prevents late replacement');
 await edit().click();state={...state,turn:2};await save().click();await page.getByRole('alert').filter({hasText:'Turn or clan orders changed'}).waitFor();check(JSON.stringify(await snapshot())===JSON.stringify(cancelBefore),'Changed server turn rejects edit without modifying draft');
 // Force background action to exercise invalidation even though native modal makes it inert to normal clicks.
 hold=true;await save().click();await page.getByRole('button',{name:'Refresh clan orders',exact:true}).evaluate(b=>b.click());await flush();await page.getByRole('status').filter({hasText:'Latest clan orders loaded'}).waitFor();check(await page.getByRole('dialog').count()===0&&await queue().count()===0,'Turn refresh closes editor and late validation cannot restore old draft');
 await add(2);await edit().click();hold=true;await save().click();await page.getByRole('button',{name:'Leave',exact:true}).evaluate(b=>b.click());await flush();await login();check(await queue().count()===0&&await page.getByRole('dialog').count()===0,'Leaving session discards editor and its late response');
 await add(2);reject=true;await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('alert').waitFor();check(await edit().isDisabled(),'Ambiguous submission locks Edit');
 reject=false;await page.getByRole('button',{name:'Retry submission',exact:true}).click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();check(await page.getByRole('button',{name:/Edit order/}).count()===0,'Committed orders cannot be edited');
 check(puts.every(p=>p.orders.every(o=>!('draftId'in o)&&!('editable'in o))),'Local metadata is never sent to the server');
 await add(1);await page.getByRole('button',{name:'Edit order 2',exact:true}).click();await mkdir('../test-results',{recursive:true});await page.screenshot({path:'../test-results/edit-draft.png',fullPage:true});
 check(errors.length===0,'Editor interactions have no uncaught browser errors');
 console.log(`${checks} synthetic draft edit interaction checks passed.`);
}finally{if(browser)await browser.close();await server.close();}
