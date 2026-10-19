import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

const root=resolve('..');
const artifacts=resolve(root,'test-results'); await mkdir(artifacts,{recursive:true});
let save=resolve(artifacts,`smoke-${Date.now()}.json`);
const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
const base='http://127.0.0.1:5097';
let processHandle,browser;
let count=0;
function check(value,name){assert.ok(value,name);count++;console.log('PASS '+name);}
async function start(extra={}){
 processHandle=spawn('dotnet',[resolve(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll')],{cwd:resolve(root,'src/Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:save,EmpireAi:'false',LocalTest:'true',...extra},stdio:['ignore','pipe','pipe']});
 let logs='';processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);
 for(let i=0;i<100;i++){if(processHandle.exitCode!==null)throw Error('API startup failed: '+logs);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('API startup timed out: '+logs);
}
async function stop(){if(processHandle&&processHandle.exitCode===null){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await done;}}
async function api(path,{team=0,method='GET',body,headers={}}={}){return fetch(base+'/api/'+path,{method,headers:{Authorization:'Bearer '+keys[team],...body?{'Content-Type':'application/json'}:{},...headers},body:body?JSON.stringify(body):undefined});}
async function state(team=0){const res=await api('campaign',{team});assert.equal(res.status,200);return (await res.json()).campaign;}
async function expedition(page,counts,target='1'){
 await page.getByRole('button',{name:'Select expedition fleet',exact:true}).click();
 await page.getByLabel('Expedition destination').selectOption(target);
 for(const [name,count] of Object.entries(counts))await page.getByLabel('Send '+name,{exact:true}).fill(String(count));
 await page.getByRole('button',{name:'Add expedition to draft',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'detached'});
}
try{
 await start();
 check((await fetch(base+'/api/campaign')).status===401,'Unauthenticated campaign denied');
 check((await state()).stars[11].ships===null,'API omits hidden fleet data');
 const previewRequest={seed:42,systemCount:24,width:1000,height:700,minimumSeparation:45,nearestNeighborLinks:2,playerCount:2};
 const previewResponse=await api('local/star-map/preview',{method:'POST',body:previewRequest});const mapPreview=await previewResponse.json();
 const replayPreview=await (await api('local/star-map/preview',{method:'POST',body:previewRequest})).json();
 check(previewResponse.status===200&&mapPreview.systems.length===24&&mapPreview.homeworlds.length===2&&JSON.stringify(mapPreview)===JSON.stringify(replayPreview),'Local host preview returns an exact deterministic map replay');
 const campaignBeforePreview=JSON.stringify(await state());
 check((await api('local/star-map/preview',{method:'POST',body:{...previewRequest,systemCount:1}})).status===409&&JSON.stringify(await state())===campaignBeforePreview,'Invalid preview fails without mutating the campaign');
 check((await api('local/advance',{method:'POST',body:{turn:1},headers:{'X-Forwarded-For':'8.8.8.8'}})).status===404,'Proxied acceleration denied');
 const publicHostStatus=await new Promise((done,fail)=>{const req=httpRequest(base+'/api/local/advance',{method:'POST',headers:{Host:'starzdeepfield.com',Authorization:'Bearer '+keys[0],'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>done(res.statusCode));});req.on('error',fail);req.end(JSON.stringify({turn:1}));});
 check(publicHostStatus===404,'Public hostname acceleration denied');
 const initial=await state();
 check(!JSON.stringify(initial).toLowerCase().includes('reconentropy'),'Campaign API omits private reconnaissance entropy');
 for(const [name,orders] of [['ten',[{kind:'move',source:0,target:1,ships:10}]],['split',[{kind:'move',source:0,target:1,ships:3},{kind:'move',source:0,target:6,ships:6}]],['new-build',[{kind:'build',source:0,ships:2},{kind:'move',source:0,target:1,ships:10}]]]){
  const before=await state();const response=await api('orders',{method:'PUT',body:{turn:before.turn,revision:before.revision,requestId:'invalid-'+name,orders}});
  check(response.status===409&&JSON.stringify(await state())===JSON.stringify(before),'Server atomically rejects 8 ships overspent by '+name+' without partial plan, fleet or treasury mutation');
 }
 const order={turn:initial.turn,revision:initial.revision,requestId:'http-retry',orders:[{kind:'move',source:0,target:1,ships:4}]};
 check((await api('orders',{method:'PUT',body:order})).status===200,'HTTP order accepted');
 check((await api('orders',{method:'PUT',body:order})).status===200&&(await state()).revision===1,'HTTP retry idempotent');
 check((await api('orders',{method:'PUT',body:{...order,orders:[]}})).status===409,'HTTP retry content conflict rejected');
 check((await api('orders',{method:'PUT',body:{...order,requestId:'stale'}})).status===409,'Concurrent teammate stale revision rejected');
 const post={id:'message-1',author:'Scout',text:'Private route: Lumen.'};
 await api('messages',{method:'POST',body:post}); await api('messages',{method:'POST',body:post});
 check((await state()).messages.length===1&&(await state(1)).messages.length===0,'Private board isolation and idempotent message retry');
 await stop(); await start();
 check((await state()).revision===1&&(await state()).orders.length===1,'Process restart preserves pending orders');
 const advances=await Promise.all(Array.from({length:8},()=>api('local/advance',{method:'POST',body:{turn:1}}).then(r=>r.json())));
 check(advances.filter(r=>r.advanced).length===1&&(await state()).turn===2,'Concurrent HTTP resolution advances once');
 check((await state()).stars[1].owner===0,'HTTP resolution creates colony');
 await stop();
 const snapshot=JSON.parse(await readFile(save,'utf8'));snapshot.Deadline='2026-01-01T00:00:00Z';
 // Isolated deterministic browser fixture; never edits the live playtest save.
 snapshot.ReconRates={Distant:100,Close:100,Deep:100};snapshot.Stars[6].Owner=1;snapshot.Stars[6].Ships[1]=7;snapshot.Stars[6].Scouts[1]=2;
 await writeFile(save,JSON.stringify(snapshot));
 await start();
 for(let i=0;i<30&&(await state()).turn===2;i++)await new Promise(r=>setTimeout(r,100));
 check((await state()).turn===3&&Date.parse((await state()).deadline)>Date.now()+23*3600000,'Overdue process restart resolves once with future deadline');
 await stop(); await start();
 check((await state()).turn===3,'Second restart does not advance again');
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Clan access key').fill(keys[0]);await page.getByRole('button',{name:'Enter command deck'}).click();
 await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 await page.getByLabel('Action at Hearth').selectOption('collector');await page.getByRole('button',{name:'+ Add to draft'}).click();
 await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 await page.getByLabel('Message',{exact:true}).fill('Coordinate collectors after the expedition.');await page.getByRole('button',{name:'Send to clan'}).click();await page.getByText('Coordinate collectors after the expedition.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Run turn'}).click();await page.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 check((await state()).energy===2,'Browser commit and test turn update campaign');
 await page.screenshot({path:resolve(artifacts,'command-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(artifacts,'command-mobile.png'),fullPage:true});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout has no horizontal overflow');
 check(errors.length===0,'Browser has no uncaught application errors');
 const submissions=[];page.on('request',request=>{if(request.url().endsWith('/api/orders')&&request.method()==='PUT')submissions.push(request.postDataJSON());});
 await page.getByLabel('Action at Hearth').selectOption('move');await expedition(page,{Ships:2});
 await page.route('**/api/orders',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Not enough existing ships. Fixture simulates a definitive rejection.'})}),{times:1});
 await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('alert').filter({hasText:'Not enough existing ships'}).waitFor();
 check(await page.getByRole('button',{name:'Remove order 1',exact:true}).isEnabled()&&await page.getByRole('button',{name:'Select expedition fleet',exact:true}).isEnabled()&&await page.locator('.queue li').count()===1,'Definitive 409 preserves draft and unlocks editing');
 await page.getByRole('button',{name:'Remove order 1',exact:true}).click();await expedition(page,{Ships:2});
 // Let the server commit, then lose its response: retry must reuse the exact ID/payload.
 await page.route('**/api/orders',async route=>{await route.fetch();await route.abort('failed');},{times:1});
 await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('alert').waitFor();
 check(await page.getByRole('button',{name:'Retry submission',exact:true}).isVisible()&&await page.getByRole('button',{name:'Remove order 1',exact:true}).isDisabled(),'Ambiguous network failure retains pending request and locks edits');
 const committedRevision=(await state()).revision;
 await page.getByRole('button',{name:'Retry submission',exact:true}).click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 check(submissions[0].requestId!==submissions[1].requestId&&JSON.stringify(submissions[1])===JSON.stringify(submissions[2])&&(await state()).revision===committedRevision,'Corrected draft uses fresh ID; lost-response retry is identical and commits once');
 await page.getByRole('button',{name:'Remove order 1',exact:true}).click();
 await page.getByLabel('Action at Hearth').selectOption('scoutbuild');await page.getByLabel('Ships',{exact:true}).fill('2');await page.getByRole('button',{name:'+ Add to draft'}).click();
 await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 await page.getByRole('button',{name:'Run turn'}).click();await page.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 check((await state()).stars[0].scouts[0]===2,'Browser builds dedicated 3-credit scouts');
 await page.getByLabel('Action at Hearth').selectOption('recon');await page.getByLabel('Destination').selectOption('6');await page.getByLabel('Recon mission').selectOption('deep');await page.getByRole('button',{name:'+ Add to draft'}).click();
 await page.route('**/api/orders',async route=>{await route.fetch();await route.abort('failed');},{times:1});
 await page.getByRole('button',{name:'Commit orders',exact:true}).click();await page.getByRole('alert').waitFor();
 await page.getByRole('button',{name:'Retry submission',exact:true}).click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 check((await state()).orders.length===1&&(await state()).orders[0].mission==='deep','Interrupted recon submission preserves mission and commits once');
 await page.getByRole('button',{name:'Run turn'}).click();await page.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 await page.getByText('Exact at observation: 7 enemy combat ships',{exact:false}).waitFor();
 const observed=await state();const observedTurn=observed.intelligence[0].turn;
 check(observed.intelligence.length===1&&observed.intelligence[0].returned&&observed.stars[6].ships===null&&(await state(1)).intelligence.length===0,'Deep ISR is private historical intelligence, never live enemy vision');
 await page.getByRole('button',{name:'Run turn'}).click();await page.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 check((await state()).intelligence[0].turn===observedTurn&&await page.getByText('Last observed turn '+observedTurn,{exact:false}).count()===1,'Browser retains dated intelligence as turns age');
 await page.screenshot({path:resolve(artifacts,'scout-intelligence-mobile.png'),fullPage:true});
 await page.getByLabel('Call sign').fill('Private Aurora identity');
 await page.getByLabel('Message',{exact:true}).fill('Unsent Aurora invasion plan');
 await page.getByRole('button',{name:'+ Add to draft'}).click();
 await page.getByRole('button',{name:'Leave',exact:true}).click();
 check(await page.getByLabel('Clan access key').inputValue()==='', 'Leave clears the previous clan key');
 await page.getByLabel('Clan access key').fill(keys[1]);await page.getByRole('button',{name:'Enter command deck'}).click();
 await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check(await page.getByLabel('Message',{exact:true}).inputValue()===''&&await page.getByLabel('Call sign').inputValue()==='Commander','Switching clans clears private unsent message and author');
 check(await page.getByRole('status').innerText()===''&&await page.locator('.queue li').count()===0&&await page.getByRole('alert').count()===0,'Switching clans clears orders, notices and errors');
 check(await page.locator('.intelReport').count()===0,'Switching clans clears previous clan reconnaissance reports');
 check(await page.getByRole('button',{name:'Select expedition fleet',exact:true}).count()===1&&await page.getByRole('dialog').count()===0,'Switching clans resets order editor state');
 await browser.close();browser=null;
 await stop(); await start({LocalTest:'false'});
 check((await api('local/advance',{method:'POST',body:{turn:4}})).status===404,'Acceleration disabled without explicit opt-in');
 check((await api('local/star-map/preview',{method:'POST',body:previewRequest})).status===404,'Star-map setup is disabled without local preview permission');
 await stop();
 // Isolated preview grants local turn capability without the legacy test flag.
 await start({IsolatedPreview:'true',LocalTest:'false',SavePath:'',ConnectionStrings__Deepfield:''});
 const preview=await (await api('campaign')).json();check(preview.localTest===true,'Isolated preview enables local Run turn');
 check((await api('local/star-map/preview',{method:'POST',body:previewRequest})).status===200,'Isolated preview enables the host map lab');
 const previewTurn=preview.campaign.turn;
 check((await (await api('local/advance',{method:'POST',body:{turn:previewTurn}})).json()).advanced===true,'Preview uses normal resolver');
 check((await (await api('local/advance',{method:'POST',body:{turn:previewTurn}})).json()).advanced===false,'Preview repeated expected turn is a no-op');
 await stop();
 // Production must refuse the local-only persistence fallback entirely.
 let rejected=false;try{await start({ASPNETCORE_ENVIRONMENT:'Production'});}catch(e){rejected=String(e).includes('PostgreSQL connection required');}
 check(rejected,'Production refuses development file store and test endpoint');
 await stop();save=resolve(artifacts,`economy-${Date.now()}.json`);await start({EconomyVersion:'1'});
 check((await state()).economyVersion===1&&(await state()).nextIncome===18,'New economy preview starts with collector income; previous save untouched');
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const economyPage=await browser.newPage({viewport:{width:1440,height:1100}});await economyPage.goto(base);
 await economyPage.getByLabel('Clan access key').fill(keys[0]);await economyPage.getByRole('button',{name:'Enter command deck'}).click();await economyPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 await economyPage.getByLabel('Action at Hearth').selectOption('defense');await economyPage.getByRole('button',{name:'+ Add to draft'}).click();
 await economyPage.getByLabel('Action at Hearth').selectOption('collector');await economyPage.getByRole('button',{name:'+ Add to draft'}).click();
 await economyPage.getByRole('button',{name:'Commit orders',exact:true}).click();await economyPage.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 await economyPage.getByRole('button',{name:'Run turn'}).click();await economyPage.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 const economicState=await state();check(economicState.stars[0].defense===2&&economicState.credits===42&&economicState.nextIncome===20,'Browser builds fixed defenses and collector with correct income/cost');
 check((await state(1)).stars[0].defense===null,'Enemy fixed defenses remain hidden through API');
 await economyPage.screenshot({path:resolve(artifacts,'economy-defense-desktop.png'),fullPage:true});
 await browser.close();browser=null;await stop();save=resolve(artifacts,`typed-${Date.now()}.json`);await start({EconomyVersion:'1',CombatVersion:'1'});
 check((await state()).combatVersion===1&&(await state()).stars[0].fleets[0][0]===8,'Typed preview starts with explicit interceptor inventory');
 await stop();const typedFixture=JSON.parse(await readFile(save,'utf8'));typedFixture.Stars[1].Owner=1;typedFixture.Stars[1].Fleets[1]=[0,0,0,4,0];typedFixture.Stars[1].Ships[1]=4;typedFixture.ReconRates={Distant:100,Close:100,Deep:100};await writeFile(save,JSON.stringify(typedFixture));await start({EconomyVersion:'1',CombatVersion:'1'});
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const fleetPage=await browser.newPage({viewport:{width:1440,height:1100}});const fleetErrors=[];fleetPage.on('pageerror',error=>fleetErrors.push(error.message));await fleetPage.goto(base);
 await fleetPage.getByLabel('Clan access key').fill(keys[0]);await fleetPage.getByRole('button',{name:'Enter command deck'}).click();await fleetPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();
 await fleetPage.getByLabel('Expedition destination').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('10');
 check(await fleetPage.getByTestId('available-interceptor').innerText()==='8'&&await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).isDisabled(),'Modal blocks 10 requested from 8 existing ships before drafting');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 check(await fleetPage.locator('.queue li').count()===0,'Cancel leaves no expedition orders');
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.keyboard.press('Escape');await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 check(await fleetPage.locator('.queue li').count()===0,'Escape discards selection');
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.goBack();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 check(await fleetPage.getByRole('heading',{name:'The stars are within reach.'}).isVisible(),'Browser Back closes modal without leaving command deck');
 await expedition(fleetPage,{Interceptor:3});await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('6');
 check(await fleetPage.getByTestId('available-interceptor').innerText()==='5'&&await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).isDisabled(),'Drafted 3 reserves inventory and blocks a second 6 from 8');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});await fleetPage.getByRole('button',{name:'Remove order 1',exact:true}).click();
 await fleetPage.getByLabel('Action at Hearth').selectOption('build');await fleetPage.getByLabel('Ships',{exact:true}).fill('2');await fleetPage.getByRole('button',{name:'+ Add to draft'}).click();await fleetPage.getByLabel('Action at Hearth').selectOption('move');
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('10');
 check(await fleetPage.getByTestId('available-interceptor').innerText()==='8'&&await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).isDisabled(),'Same-turn construction never increases dispatch availability');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});await fleetPage.getByRole('button',{name:'Remove order 1',exact:true}).click();
 // Return a changed inventory on the confirmation read: revalidation must prevent drafting.
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Expedition destination').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('8');
 await fleetPage.route('**/api/campaign',async route=>{const response=await route.fetch();const body=await response.json();body.campaign.stars[0].fleets[0][0]=2;body.campaign.stars[0].ships[0]=2;await route.fulfill({response,json:body});},{times:1});
 await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await fleetPage.getByRole('alert').filter({hasText:'Fleet availability changed'}).waitFor();
 check(await fleetPage.locator('.queue li').count()===0&&await fleetPage.getByTestId('available-interceptor').innerText()==='2','Stale inventory is refreshed and rejects overreservation');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});await fleetPage.getByRole('button',{name:'Refresh clan orders',exact:true}).click();await fleetPage.getByRole('status').filter({hasText:'Latest clan orders loaded'}).waitFor();
 // Revalidate teammate revision rather than replacing a plan from an old view.
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Expedition destination').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('1');
 await fleetPage.route('**/api/campaign',async route=>{const response=await route.fetch();const body=await response.json();body.campaign.revision++;await route.fulfill({response,json:body});},{times:1});
 await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await fleetPage.getByRole('alert').filter({hasText:'Clan orders or turn changed'}).waitFor();check(await fleetPage.locator('.queue li').count()===0,'Stale teammate revision cannot append expedition to an obsolete draft');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 // Cancel an in-flight availability read; its later response must not append orders.
 let release;const gate=new Promise(resolve=>release=resolve);let received;const reading=new Promise(resolve=>received=resolve);
 await fleetPage.route('**/api/campaign',async route=>{const response=await route.fetch();received();await gate;await route.fulfill({response});},{times:1});
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Expedition destination').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('1');await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).click();await reading;
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});const delivered=fleetPage.waitForResponse('**/api/campaign');release();await delivered;
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();check(await fleetPage.locator('.queue li').count()===0,'Cancel during availability read cannot create a delayed order');await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 // Programmatic repeated clicks exercise the synchronous submission latch.
 await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Expedition destination').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('1');
 await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).evaluate(button=>{button.click();button.click();});await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 check(await fleetPage.locator('.queue li').count()===1,'Repeated Add clicks create one expedition');await fleetPage.getByRole('button',{name:'Remove order 1',exact:true}).click();
 await fleetPage.getByLabel('Action at Hearth').selectOption('build');await fleetPage.getByLabel('Hull class').selectOption('cruiser');await fleetPage.getByLabel('Ships',{exact:true}).fill('2');await fleetPage.getByRole('button',{name:'+ Add to draft'}).click();
 await fleetPage.getByLabel('Action at Hearth').selectOption('scoutbuild');await fleetPage.getByLabel('Ships',{exact:true}).fill('1');await fleetPage.getByRole('button',{name:'+ Add to draft'}).click();
 await fleetPage.getByRole('button',{name:'Commit orders',exact:true}).click();await fleetPage.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();await fleetPage.getByRole('button',{name:'Run turn'}).click();await fleetPage.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 check((await state()).stars[0].fleets[0][2]===2&&(await state()).credits===45,'Hull editor builds cruisers at correct cost alongside scout');
 await fleetPage.getByLabel('Action at Hearth').selectOption('move');await expedition(fleetPage,{Interceptor:4,Cruiser:2});
 await fleetPage.getByLabel('Action at Hearth').selectOption('recon');await fleetPage.getByLabel('Destination').selectOption('1');await fleetPage.getByLabel('Recon mission').selectOption('deep');await fleetPage.getByRole('button',{name:'+ Add to draft'}).click();
 await fleetPage.route('**/api/orders',async route=>{await route.fetch();await route.abort('failed');},{times:1});await fleetPage.getByRole('button',{name:'Commit orders',exact:true}).click();await fleetPage.getByRole('alert').waitFor();await fleetPage.getByRole('button',{name:'Retry submission',exact:true}).click();await fleetPage.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 check((await state()).orders.length===3&&(await state()).orders[1].hull==='cruiser','Interrupted mixed-fleet order retains selected hulls and one scout mission');
 await fleetPage.getByRole('button',{name:'Run turn'}).click();await fleetPage.getByRole('status').filter({hasText:'Turn resolved. Reports refreshed.'}).waitFor();
 const result=await state();check(result.stars[1].owner===0&&result.stars[1].fleets[0][2]===2&&result.stars[1].fleets[1].every(n=>n===0),'Mixed fleet counters bombers and establishes colony with interceptor escorts');
 check(result.intelligence.find(i=>i.mission==='deep').enemyComposition[3]===4&&result.intelligence.find(i=>i.mission==='battle').enemyComposition[3]===4,'Deep and surviving battle reports retain actual opening composition');
 check((await state(1)).intelligence.find(i=>i.mission==='battle').enemyComposition===null,'Destroyed rival fleet receives no exact survivor/composition report');
 const battleText=await fleetPage.locator('.intelReport').filter({has:fleetPage.getByRole('heading',{name:/battle$/})}).innerText();
 check(battleText.includes('4 enemy combat ships')&&battleText.includes('Unknown enemy scouts')&&battleText.includes('Unknown collectors'),'Battle intelligence renders unobserved scout and collector counts explicitly Unknown');
 const deepText=await fleetPage.locator('.intelReport').filter({has:fleetPage.getByRole('heading',{name:/deep$/})}).innerText();
 check(deepText.includes('0 enemy scouts')&&deepText.includes('0 collectors')&&!deepText.includes('Unknown'),'Deep intelligence preserves observed zero counts rather than labeling them Unknown');
 await fleetPage.getByRole('button',{name:'Lumen, observed',exact:true}).click();await fleetPage.screenshot({path:resolve(artifacts,'typed-fleet-desktop.png'),fullPage:true});await fleetPage.setViewportSize({width:390,height:844});await fleetPage.screenshot({path:resolve(artifacts,'typed-fleet-mobile.png'),fullPage:true});
 check(await fleetPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)&&fleetErrors.length===0,'Typed fleet editor/report UI has no mobile overflow or uncaught errors');
 check(await fleetPage.getByLabel('Selected system collectors').innerText().then(t=>t.includes('0')),'New colony prominently shows zero collectors');
 check(await fleetPage.locator('.settlementHelp').innerText().then(t=>t.includes('turn after settlement')),'Colony help explains habitat consumption and first legal collector turn');
 await fleetPage.getByLabel('Action at Lumen').selectOption('collector');check(await fleetPage.getByRole('button',{name:'+ Add to draft'}).isEnabled(),'Collector construction becomes available at settled colony in following turn');
 await fleetPage.getByLabel('Action at Lumen').selectOption('move');await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.getByLabel('Send Cruiser',{exact:true}).fill('3');
 check(await fleetPage.getByTestId('available-cruiser').innerText()==='2'&&await fleetPage.getByRole('button',{name:'Add expedition to draft',exact:true}).isDisabled(),'Per-hull inventory cannot be replaced by other ship types');
 await fleetPage.getByLabel('Send Cruiser',{exact:true}).fill('1');await fleetPage.getByLabel('Expedition source').selectOption('0');
 check(await fleetPage.getByLabel('Send Cruiser',{exact:true}).inputValue()==='0'&&await fleetPage.getByTestId('available-interceptor').innerText()==='4','Changing source resets all selections and recalculates source inventory');
 await fleetPage.getByLabel('Expedition source').selectOption('1');await fleetPage.getByLabel('Send Interceptor',{exact:true}).fill('1');await fleetPage.screenshot({path:resolve(artifacts,'expedition-modal-mobile.png')});
 check(await fleetPage.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'Mobile fleet modal has no horizontal overflow');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 await fleetPage.setViewportSize({width:1440,height:1100});await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();await fleetPage.screenshot({path:resolve(artifacts,'expedition-modal-desktop.png')});
 // Force session unmount while open, proving no old selection survives a clan switch.
 await fleetPage.getByRole('button',{name:'Leave',exact:true}).evaluate(button=>button.click());await fleetPage.getByLabel('Clan access key').fill(keys[1]);await fleetPage.getByRole('button',{name:'Enter command deck'}).click();await fleetPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check(await fleetPage.getByRole('dialog').count()===0&&await fleetPage.locator('.queue li').count()===0,'Clan switch unmounts modal and clears all private selection/draft state');
 await fleetPage.getByRole('button',{name:'Dawn, observed',exact:true}).click();await fleetPage.getByRole('button',{name:'Select expedition fleet',exact:true}).click();
 check(await fleetPage.getByLabel('Send Interceptor',{exact:true}).inputValue()==='0'&&await fleetPage.getByTestId('available-interceptor').innerText()==='8','New clan sees only its own inventory and a fresh zeroed selection');
 await fleetPage.getByRole('button',{name:'Cancel',exact:true}).click();await fleetPage.getByRole('dialog').waitFor({state:'detached'});
 await browser.close();browser=null;await stop();await start({EconomyVersion:'1',CombatVersion:'1'});
 check((await state()).turn===3&&(await state()).stars[1].fleets[0][2]===2&&(await state()).intelligence.length===2,'Process restart preserves typed fleet, reports and exactly one resolved turn');
 console.log(`${count} API/browser checks passed; screenshots in ${artifacts}`);
}finally{if(browser)await browser.close();await stop();}
