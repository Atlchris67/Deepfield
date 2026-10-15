// Actual React application, synthetic intercepted responses. No .NET/API process or saved campaign.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
let browser,checks=0;function check(value,name){assert.ok(value,name);checks++;console.log('PASS '+name);}
function campaign(team=0){return {turn:1,deadline:'2099-01-01T00:00:00Z',winner:null,team,name:team?'Ember fixture':'Aurora fixture',credits:60,revision:0,orders:[],reports:[],messages:[],stars:[0,1].map(id=>({id,name:id?'Lumen':'Hearth',x:20+id*20,y:40,known:true,visible:true,owner:team,collectors:1,ships:team?[0,8]:[8,0],scouts:[0,0],defense:0,fleets:null})),energy:2,goal:8,intelligence:[],reconRates:{distant:90},economyVersion:0,nextIncome:30,combatVersion:0};}
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();const states=[campaign(),campaign(1)],puts=[],reads=[],putTeams=[];let pending=[];let putMode='hold',readMode='normal';
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,team=request.headers().authorization?.includes('ember')?1:0;
  if(path==='/api/campaign'){
   reads.push(team);
   if(readMode==='hold'){pending.push(()=>route.fulfill({json:{campaign:states[team],localTest:false}}));return;}
   if(readMode==='fail'){readMode='normal';await route.fulfill({status:503,json:{error:'Synthetic refresh failure'}});return;}
   await route.fulfill({json:{campaign:states[team],localTest:false}});return;
  }
  if(path==='/api/orders'){
   const body=request.postDataJSON();puts.push(body);putTeams.push(team);
   if(putMode==='hold'){pending.push(()=>route.fulfill({json:{revision:1}}));return;}
   if(putMode==='reject'){await route.fulfill({status:409,json:{error:'Synthetic definitive rejection'}});return;}
   if(putMode==='network'){await route.abort('failed');return;}
   if(putMode==='server'){await route.fulfill({status:503,json:{error:'Synthetic uncertain failure'}});return;}
   states[team].orders=body.orders;states[team].revision=1;
   await route.fulfill({json:{revision:1}});return;
  }
  throw Error('Unexpected synthetic request '+path);
 });
 const login=async(key='aurora')=>{await page.getByLabel('Clan access key').fill(key);await page.getByRole('button',{name:'Enter command deck'}).click();await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();};
 const add=async()=>{await page.getByLabel('Action at Hearth').selectOption('collector');await page.getByRole('button',{name:'+ Add to draft'}).click();};
 const commit=()=>page.getByRole('button',{name:'Commit orders',exact:true});
 const retry=()=>page.getByRole('button',{name:'Retry submission',exact:true});
 const flush=async()=>{const callbacks=pending;pending=[];await Promise.all(callbacks.map(fn=>fn()));};
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await login();await add();
 await commit().evaluate(button=>{button.click();button.click();});
 await page.waitForFunction(()=>document.querySelector('.orderFooter button')?.disabled);
 // A subsequent roundtrip gives both synchronous event handlers time to reach interception.
 await page.getByRole('button',{name:'Leave',exact:true}).focus();
 check(puts.length===1,'Repeated same-tick Commit events send one request (observed '+puts.length+')');
 await flush();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 // Rejection unlocks editing; uncertain responses retain exact retry identity.
 await add();putMode='reject';await commit().click();await page.getByRole('alert').filter({hasText:'definitive rejection'}).waitFor();
 check(await page.getByRole('button',{name:'Remove order 1',exact:true}).isEnabled(),'Definitive rejection unlocks the retained draft');
 putMode='network';await commit().click();await retry().waitFor();await page.getByRole('alert').waitFor();const original=puts.at(-1);
 check(await page.getByRole('button',{name:'Remove order 1',exact:true}).isDisabled(),'Network ambiguity locks draft edits');
 putMode='server';await retry().click();await page.getByRole('alert').filter({hasText:'uncertain failure'}).waitFor();
 check(JSON.stringify(puts.at(-1))===JSON.stringify(original)&&await retry().isEnabled(),'Server uncertainty preserves identical retry payload');
 putMode='success';readMode='fail';await retry().click();await page.getByRole('alert').filter({hasText:'refresh failure'}).waitFor();
 check(await retry().isVisible()&&await page.getByRole('button',{name:'Remove order 1',exact:true}).isDisabled(),'Successful PUT followed by failed refresh retains retry lock');
 await retry().click();await page.getByRole('status').filter({hasText:'Orders committed.'}).waitFor();
 check(JSON.stringify(puts.at(-1))===JSON.stringify(original),'Refresh failure retry preserves exact request identity');
 readMode='hold';await page.getByRole('button',{name:'Refresh clan orders',exact:true}).click();
 if(await page.getByRole('button',{name:'Remove order 1',exact:true}).isEnabled()){
  await page.getByRole('button',{name:'Remove order 1',exact:true}).click();const removed=await page.locator('.queue li').count();await flush();await page.getByRole('status').filter({hasText:'Latest clan orders loaded'}).waitFor();
  check(false,'Pending refresh allowed removal then restored it: before response '+removed+', afterward '+await page.locator('.queue li').count());
 }
 check(await page.getByRole('button',{name:'Remove order 1',exact:true}).isDisabled(),'Draft removal locks while refresh is pending');
 await flush();await page.getByRole('status').filter({hasText:'Latest clan orders loaded'}).waitFor();readMode='normal';
 // Late previous-session response must neither restore old UI nor start another private fetch.
 putMode='hold';await commit().click();await page.getByLabel('Call sign').fill('Old clan identity');await page.getByLabel('Message',{exact:true}).fill('Old clan unsent text');
 await page.getByRole('button',{name:'Leave',exact:true}).click();await login('ember');const readsBefore=reads.length;
 await flush();await page.getByRole('button',{name:'Refresh clan orders',exact:true}).focus();
 check(await page.getByLabel('Call sign').inputValue()==='Commander'&&await page.getByLabel('Message',{exact:true}).inputValue()===''&&await page.locator('.queue li').count()===0,'Clan switch clears old private editor and draft despite late response');
 check(reads.length===readsBefore,'Late old-session submission does not issue another private refresh');
 // A pending login must not let the displayed clan and later request credential diverge.
 await page.getByRole('button',{name:'Leave',exact:true}).click();readMode='hold';await page.getByLabel('Clan access key').fill('aurora');await page.getByRole('button',{name:'Enter command deck'}).click();
 if(await page.getByLabel('Clan access key').isEnabled()){
  await page.getByLabel('Clan access key').fill('ember');readMode='normal';await flush();await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();await add();putMode='hold';await commit().click();await page.getByRole('button',{name:'Leave',exact:true}).focus();
  check(false,'Pending login accepted another key: displayed '+await page.locator('.live').innerText()+', order authenticated as team '+putTeams.at(-1));
 }
 check(await page.getByLabel('Clan access key').isDisabled(),'Login credential locks until its response resolves');readMode='normal';await flush();await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 // Recovery must release both UI locks and the synchronous action guard.
 readMode='fail';await page.getByRole('button',{name:'Refresh clan orders',exact:true}).click();await page.getByRole('alert').filter({hasText:'refresh failure'}).waitFor();
 check(await page.getByRole('button',{name:'Refresh clan orders',exact:true}).isEnabled(),'Failed standalone refresh releases action guard');
 await page.getByRole('button',{name:'Refresh clan orders',exact:true}).click();await page.getByRole('status').filter({hasText:'Latest clan orders loaded'}).waitFor();
 check(await commit().isEnabled(),'Successful refresh retry leaves Commit enabled');
 await page.getByRole('button',{name:'Leave',exact:true}).click();readMode='fail';await page.getByLabel('Clan access key').fill('aurora');await page.getByRole('button',{name:'Enter command deck'}).click();await page.getByRole('alert').filter({hasText:'refresh failure'}).waitFor();
 check(await page.getByLabel('Clan access key').isEnabled()&&await page.getByRole('button',{name:'Enter command deck'}).isEnabled(),'Failed login unlocks credentials and action guard');
 await login('ember');check((await page.locator('.live').innerText()).includes('Ember fixture'),'Login failure permits another clan login without stale credentials');
 console.log(`${checks} synthetic draft/session checks passed; no .NET or live API involved.`);
}finally{if(browser)await browser.close();await server.close();}
