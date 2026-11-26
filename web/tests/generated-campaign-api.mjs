import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const root=resolve(import.meta.dirname,'../..');
await mkdir(resolve(root,'test-results'),{recursive:true});
const fixture=await mkdtemp(resolve(root,'test-results','generated-api-'));
const webroot=resolve(process.env.DEEPFIELD_TEST_WEBROOT??resolve(root,'test-results','deepfield-web'));
const manifest=resolve(fixture,'isolated-static-assets.json');
await writeFile(manifest,JSON.stringify({ContentRoots:[webroot],Root:{Children:{},Asset:null,Patterns:[{ContentRootIndex:0,Pattern:'**',Depth:0}]}}));
const save=resolve(fixture,'original.json');
const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const base=`http://127.0.0.1:${port}`;
const dll=resolve(process.env.DEEPFIELD_TEST_API_DLL??resolve(root,'src','Deepfield.Api','bin','Release','net10.0','Deepfield.Api.dll'));
const previewRequest={seed:0,systemCount:24,width:1000,height:700,minimumSeparation:1,nearestNeighborLinks:2,playerCount:2,real:true};
let child,browser,logs='',checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS '+label);};
const id=()=>randomUUID().replaceAll('-','');
async function api(path,{body,method='GET',campaign,headers={}}={}){
 return fetch(`${base}/api/${path}`,{method,headers:{Authorization:`Bearer ${keys[0]}`,...(body?{'Content-Type':'application/json'}:{}),...(campaign?{'X-Deepfield-Campaign':campaign}:{}),...headers},body:body?JSON.stringify(body):undefined});
}
try{
 child=spawn('dotnet',[dll,'--contentRoot',fixture,'--staticWebAssets',manifest,'--webroot',webroot],{cwd:fixture,windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:save,LocalTest:'true',EmpireAi:'false',CombatVersion:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 let ready=false;for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw Error('API exited: '+logs);try{if((await fetch(`${base}/health`)).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,100));}
 if(!ready)throw Error('API did not start: '+logs);
 check((await fetch(`${base}/api/campaign`)).status===401,'Unauthenticated campaign view is denied');
 const original=JSON.stringify((await (await api('campaign')).json()).campaign);
 const previewResponse=await api('local/star-map/preview',{method:'POST',body:previewRequest});
 const preview=await previewResponse.json();
 check(previewResponse.status===200&&preview.realCatalogVersion===1&&preview.systems.length===24,'Preview returns the pinned real catalog');
 check((await fetch(`${base}/api/local/campaigns`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id(),generatorVersion:preview.generatorVersion,preview:previewRequest})})).status===401,'Unauthenticated campaign start is denied');
 const campaignId=id(),startBody={id:campaignId,generatorVersion:preview.generatorVersion,preview:previewRequest,combatVersion:1,logisticsVersion:1,industrialFocus:[2,0]};
 const start=await api('local/campaigns',{method:'POST',body:startBody});
 const result=await start.json();
 check(start.status===200&&result.campaign.stars.length===24&&result.campaign.combatVersion===1&&result.campaign.logisticsVersion===1,
  'New real campaign starts with typed hulls and optional local logistics');
 const stored=JSON.parse(await readFile(resolve(fixture,'generated-campaigns',`${campaignId}.json`),'utf8'));
 check(stored.GeneratedMap.RealCatalogVersion===1&&stored.CombatVersion===1&&stored.LogisticsVersion===1&&stored.Clans[0].IndustrialFocus===2,
  'New campaign persists selected fleet, logistics and trait rules');
 check((await api('local/campaigns',{method:'POST',body:startBody})).status===200,'Identical start retry returns the saved campaign');
 check((await api('local/campaigns',{method:'POST',body:{...startBody,combatVersion:0}})).status===409,'Retry cannot change the saved fleet rules');
 check((await api('local/campaigns',{method:'POST',body:{...startBody,id:id(),preview:{...previewRequest,real:false}}})).status===409,'New fictional campaign is rejected');
 check((await api('local/campaigns',{method:'POST',body:{...startBody,id:id(),generatorVersion:preview.generatorVersion+1}})).status===409,'Stale generator version is rejected');
 check((await api('local/campaigns',{method:'POST',body:{...startBody,id:id()},headers:{'X-Forwarded-For':'8.8.8.8'}})).status===404,'Forwarded start is denied');
 const simpleId=id(),simpleBody={id:simpleId,generatorVersion:preview.generatorVersion,preview:previewRequest,mode:'simple'};
 const simpleStart=await api('local/campaigns',{method:'POST',body:simpleBody}),simpleGame=(await simpleStart.json()).campaign;
 check(simpleStart.status===200&&simpleGame.mode==='simple'&&simpleGame.combatVersion===0&&simpleGame.logisticsVersion===0&&simpleGame.economyVersion===0&&simpleGame.materials===null&&simpleGame.stars.length===24&&simpleGame.nextIncome===15,
  'A campaign can be started in simple mode: real stars, generic ships, credits only');
 check((await api('local/campaigns',{method:'POST',body:{...simpleBody,mode:'advanced'}})).status===409&&(await api('local/campaigns',{method:'POST',body:{...simpleBody,id:id(),mode:'expert'}})).status===409&&(await api('local/campaigns',{method:'POST',body:{...simpleBody,id:id(),industrialFocus:[1,0]}})).status===409,
  'A retry cannot change the saved mode, and an unknown mode or industrial focus in simple mode is rejected');
 const simpleHome=simpleGame.stars.find(star=>star.owner===simpleGame.team).id;
 check((await api('orders',{method:'PUT',body:{turn:1,revision:0,requestId:'simple-defense',orders:[{kind:'defense',source:simpleHome,target:-1,ships:0}]},campaign:simpleId})).status===409&&
       (await api('orders',{method:'PUT',body:{turn:1,revision:0,requestId:'simple-build',orders:[{kind:'build',source:simpleHome,target:-1,ships:3}]},campaign:simpleId})).status===200,
  'Simple mode refuses a fixed defense and accepts a plain ship build');
 const advancedStart=await api('local/campaigns',{method:'POST',body:{...simpleBody,id:id(),mode:'advanced',industrialFocus:[1,-1]}}),advancedGame=(await advancedStart.json()).campaign;
 check(advancedStart.status===200&&advancedGame.mode==='advanced'&&advancedGame.combatVersion===1&&advancedGame.logisticsVersion===1&&advancedGame.economyVersion===1&&advancedGame.industrialFocus===1&&advancedGame.nextIncome===18,
  'A campaign can be started in advanced mode with every advanced rule on');
 const home=preview.homeworlds[0].systemId;
 const refit={kind:'refit',source:home,target:-1,ships:0,hull:'torpedo',package:'assault'};
 const orderBody={turn:1,revision:0,requestId:'design-order',orders:[refit]};
 check((await api('orders',{method:'PUT',body:orderBody,campaign:campaignId})).status===200,'Typed real campaign accepts a ship package order');
 check((await api('local/advance',{method:'POST',body:{turn:1},campaign:campaignId})).status===200,'Local turn resolves the package order');
 const after=(await (await api('campaign',{campaign:campaignId})).json()).campaign;
 check(after.turn===2&&after.shipDesigns[1]==='assault','Active package is visible after turn resolution');
 check(JSON.stringify((await (await api('campaign')).json()).campaign)===original,'Separate campaign leaves the original save unchanged');

 if(!process.argv.includes('--api-only')){
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.getByLabel('Clan access key').fill(keys[0]);
  await page.getByRole('button',{name:'Enter command deck'}).click();
  await page.getByRole('button',{name:'Start new game'}).click();
  const dialog=page.getByRole('dialog',{name:'Configure star map'});
  check(await dialog.getByRole('combobox',{name:'Rules mode'}).inputValue()==='advanced'&&await dialog.getByRole('combobox',{name:'Rules mode'}).locator('option').count()===2,
   'Setup offers simple and advanced mode, with advanced selected in the local tool');
  await dialog.getByRole('button',{name:'Start new campaign'}).click();
  await dialog.waitFor({state:'detached'});
  const browserId=await page.evaluate(()=>sessionStorage.getItem('deepfieldCampaignId'));
  const browserSave=JSON.parse(await readFile(resolve(fixture,'generated-campaigns',`${browserId}.json`),'utf8'));
  check(browserSave.Mode==='advanced'&&browserSave.EconomyVersion===1&&browserSave.CombatVersion===1&&browserSave.LogisticsVersion===1,'Browser setup saves the chosen mode and its rules');
  await page.getByRole('tab',{name:'Ship design'}).click();
  const design=page.getByRole('region',{name:'Ship design'});
  const torpedo=design.locator('.shipDesignRow').filter({has:page.locator('strong').getByText('Torpedo boat',{exact:true})});
  await torpedo.getByRole('combobox',{name:'Torpedo boat package'}).selectOption('assault');
  await torpedo.getByRole('button',{name:'Add package change to draft'}).click();
  check((await page.locator('.queue').innerText()).includes('torpedo package: assault')&&await page.getByRole('button',{name:'Commit orders'}).isEnabled(),
   'Ship package can be drafted and shows beside Commit');
  check(errors.length===0,'Ship designer and setup render without browser errors');
 }
 console.log(`${checks} generated campaign and ship design checks passed.`);
}finally{
 if(browser)await browser.close();
 if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}
}
