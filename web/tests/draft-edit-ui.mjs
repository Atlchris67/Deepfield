// Actual application with synthetic responses only. No Deepfield process or saved game.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
let browser,checks=0;const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const star=(id,n)=>({id,name:['Hearth','Lumen'][id],x:20+id*30,y:40,known:true,visible:true,owner:0,ships:[n+2,0],fleets:[[n,0,2,0,0],[0,0,0,0,0]],scouts:[1,0],defense:0,collectors:1});
let state={turn:1,deadline:'2099-01-01T00:00:00Z',winner:null,team:0,name:'Edit fixture',credits:60,revision:0,orders:[],reports:[],messages:[],stars:[star(0,8),star(1,4)],energy:2,goal:8,intelligence:[],reconRates:{distant:100,close:65,deep:35},economyVersion:1,nextIncome:36,combatVersion:1};
const unseen=(id,name)=>({...star(id,0),id,name,visible:false,owner:1,ships:null,fleets:null,scouts:null,collectors:null,defense:null});
state.stars.push(unseen(2,'Unsurveyed world'),unseen(3,'Surveyed world'),unseen(4,'Outer world'));
state.links=[{from:0,to:1},{from:0,to:2},{from:0,to:3},{from:2,to:4}];
state.turn=4;
state.intelligence=[{id:'record',star:3,turn:2,at:'2026-10-20T12:00:00Z',phase:'arrival / before combat',mission:'deep',returned:true,enemyPresent:false,ownerObserved:true,owner:null,fleetBand:'0',enemyShips:0,enemyScouts:0,collectors:0,defense:0,enemyComposition:null,materialSurvey:[0,0,0,0,0,0],habitabilityScore:83,habitabilityFactors:{thermalStress:20,gravityStress:20,radiationStress:2}}];
const survey=state.intelligence[0];
state.intelligence.push(
 {...survey,id:'new-close',turn:3,mission:'close',ownerObserved:false,materialSurvey:null,habitabilityScore:99},
 {...survey,id:'older-survey',turn:1,ownerObserved:false,materialSurvey:null,habitabilityScore:21,habitabilityFactors:null},
 {...survey,id:'lost-survey',star:2,turn:3,returned:false,ownerObserved:false,materialSurvey:null,habitabilityScore:92},
 {...survey,id:'zero-survey',star:4,turn:3,ownerObserved:false,materialSurvey:null,habitabilityScore:0,habitabilityFactors:{thermalStress:100,gravityStress:100}});
let hold=false,waiting=[],gets=0,puts=[],reject=false;
try{
 await server.listen();browser=await chromium.launch({channel:process.env.DEEPFIELD_TEST_BROWSER??'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
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
 const add=async n=>{const composer=page.locator('.orderComposer');if((await composer.getAttribute('open'))===null)await composer.locator('summary').click();await page.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await page.getByLabel('Send Interceptor',{exact:true}).fill(String(n));await page.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});};
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await login();
 await page.locator('.orderComposer summary').click();
 const orderAction=page.getByLabel('Action at Hearth'),mission=page.getByLabel('Recon mission');
 await orderAction.selectOption('recon');
 check(await page.getByText(/Guaranteed safe return \(100%\).*contact and ownership only/).isVisible(),'Distant recon shows its guaranteed return and limited intelligence');
 await mission.selectOption('close');check(await page.getByText(/Safe-return target: 65%/).isVisible(),'Close recon still shows the 65% default');
 await mission.selectOption('deep');check(await page.getByText(/Safe-return target: 35%/).isVisible(),'Deep recon still shows the 35% default');
 await orderAction.selectOption('move');
 const plannerButton=page.getByRole('button',{name:'Colonization planner',exact:true});
 const planner=page.getByRole('dialog',{name:'Colonization planner'});
 const plannerOpen=async()=>{await plannerButton.click();await planner.waitFor();};
 await plannerOpen();
 const unknownRow=planner.getByRole('row',{name:/Unsurveyed world/}),surveyedRow=planner.getByRole('row',{name:/Surveyed world/});
 const unknownCells=await unknownRow.getByRole('cell').allTextContents(),surveyedCells=await surveyedRow.getByRole('cell').allTextContents();
 check(unknownCells[0]==='1 turn'&&unknownCells[1].includes('Unknown')&&unknownCells[2]==='Unknown'&&unknownCells[3].startsWith('Unknown')&&
       await unknownRow.getByRole('button',{name:/Plan colony expedition/}).isEnabled(),'Planner shows charted travel and unknown data without leaking hidden ownership or blocking a valid route');
 check(surveyedCells[2].includes('No cataloged sites')&&surveyedCells[2].includes('Deep survey, turn 2')&&surveyedCells[3].includes('Unclaimed')&&surveyedCells[3].includes('2 turns ago')&&surveyedCells[3].includes('May be stale'),'Confirmed no mineral sites differs from unknown; historical ownership and survey keep separate dated provenance');
 const outerRow=planner.getByRole('row',{name:/Outer world/});
 check(surveyedCells[1].includes('83/100')&&surveyedCells[1].includes('Deep survey, turn 2'),
       'Newest successful Deep environmental survey stays dated; shallower and older scores are not used');
 check((await outerRow.getByRole('cell').nth(1).innerText()).includes('0/100')&&unknownCells[1].includes('No environmental survey on record'),
       'An observed zero is distinct from Unknown, and a lost scout cannot reveal a score');
 const details=surveyedRow.getByLabel('Environmental stress for Surveyed world');
 check(await surveyedRow.getByText('Main limits (tied): Temperature, Gravity',{exact:true}).isVisible()&&!(await surveyedRow.getByText('Radiation: 2/100',{exact:true}).isVisible()),
       'Tied highest stresses are announced without relying on color; details are collapsed by default');
 await details.focus();await details.press('Enter');
 check(await surveyedRow.getByText('Temperature: 20/100',{exact:true}).isVisible()&&
       await surveyedRow.getByText('Gravity: 20/100',{exact:true}).isVisible()&&
       await surveyedRow.getByText('Radiation: 2/100',{exact:true}).isVisible(),
       'Native details expands all three factors by keyboard');
 await details.press('Enter');
 check(await outerRow.getByText('No factor breakdown recorded',{exact:true}).isVisible()&&
       await outerRow.locator('summary').count()===0&&await unknownRow.locator('summary').count()===0,
       'Incomplete, failed, and non-Deep surveys cannot donate a factor breakdown');
 check(await planner.getByText(/Habitability is simulated, advisory only/).isVisible(),'Habitability is labeled as a simulation, not an eligibility rule');
 await planner.getByLabel('Sort candidates').selectOption('habitability');
 const ranking=(await planner.locator('tbody th').allTextContents()).map(name=>name.replace(/Shortlist$/,''));
 check(ranking[0]==='Surveyed world'&&ranking[1]==='Outer world','Suitability sorting ranks measured values first, including zero');
 check((await outerRow.getByRole('cell').first().innerText())==='2 turns'&&await outerRow.getByRole('button',{name:/Plan colony expedition/}).count()===0,'Multi-hop travel is an estimate, never an invalid direct expedition');
 await planner.getByLabel('Departure colony').selectOption('1');
 check((await unknownRow.getByRole('cell').first().innerText())==='2 turns','Changing the departure colony recalculates charted travel');
 await planner.getByLabel('Departure colony').selectOption('0');
 await planner.getByLabel('Sort candidates').selectOption('survey');
 check((await planner.locator('tbody tr').first().innerText()).includes('Surveyed world'),'Newest-scan sorting prioritizes the dated mineral survey');
 await surveyedRow.getByRole('button',{name:'Shortlist Surveyed world'}).click();await planner.getByLabel(/Shortlist only/).check();
 check(await unknownRow.count()===0&&await surveyedRow.isVisible(),'Shortlist filters the comparison');
 await page.keyboard.press('Escape');await planner.waitFor({state:'detached'});
 check(await plannerButton.evaluate(button=>button===document.activeElement)&&await queue().count()===0,'Closing the planner restores focus without changing orders');
 await page.getByRole('tab',{name:'Intelligence',exact:true}).click();
 const oldScore=page.getByRole('article').filter({hasText:'21/100 habitability'});
 check(await oldScore.getByText('No factor breakdown recorded',{exact:true}).isVisible()&&
       await oldScore.locator('summary').count()===0,
       'Earlier score-only reports retain the score but do not invent any factor data');
 await plannerOpen();
 check(await surveyedRow.getByRole('button',{name:'Shortlist Surveyed world'}).getAttribute('aria-pressed')==='true','Shortlist survives reopening the planner in the current campaign session');
 await unknownRow.getByRole('button',{name:'Prepare scout order to Unsurveyed world'}).click();await planner.waitFor({state:'detached'});
 check(await orderAction.inputValue()==='recon'&&await page.getByLabel('Destination',{exact:true}).inputValue()==='2'&&await mission.inputValue()==='distant'&&await queue().count()===0,'Planner prepares a safe scout in the existing composer without adding it');
 await plannerOpen();await unknownRow.getByRole('button',{name:'Plan colony expedition to Unsurveyed world'}).click();
 const expedition=page.getByRole('dialog',{name:'Select expedition fleet'});
 await expedition.waitFor();
 check(await expedition.getByLabel('Expedition source').inputValue()==='0'&&await expedition.getByLabel('Expedition destination').inputValue()==='2'&&await expedition.getByLabel('Send Interceptor',{exact:true}).inputValue()==='2','Planner prefills a legal colony route and two available interceptors for review');
 await expedition.getByRole('button',{name:'Cancel',exact:true}).click();await expedition.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.activeElement?.textContent==='Colonization planner');
 check(await queue().count()===0&&puts.length===0,'Canceling a planner expedition restores navigation and adds or submits nothing');
 await plannerOpen();await unknownRow.getByRole('button',{name:'Plan colony expedition to Unsurveyed world'}).click();await expedition.waitFor();
 await expedition.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await expedition.waitFor({state:'detached'});
 check(await queue().count()===1&&puts.length===0&&(await queue().innerText()).includes('Unsurveyed world'),'Reviewing and adding a planner expedition drafts it but does not submit');
 await page.getByRole('button',{name:'Remove order 1',exact:true}).click();
 await page.getByLabel('Choose star system').selectOption({label:'Hearth'});
 await add(3);await add(2);
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
