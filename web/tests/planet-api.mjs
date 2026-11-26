// Runs only an owned API process with fresh keys, temporary content root and isolated storage.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const root=resolve('..'),content=await mkdtemp(join(tmpdir(),'deepfield-planet-api-'));
const builtAssets=process.env.DEEPFIELD_TEST_BUILT_ASSETS==='true';
const webroot=resolve(root,builtAssets?'test-results/vs-project/Deepfield.Api/wwwroot':'test-results/planet-web');
const manifest=join(content,'isolated-static-assets.json');
await writeFile(manifest,JSON.stringify({ContentRoots:[webroot],Root:{Children:{},Asset:null,Patterns:[{ContentRootIndex:0,Pattern:'**',Depth:0}]}}));
const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
const env={...process.env};for(const name of Object.keys(env))if(/^(SavePath|ConnectionStrings__Deepfield|DEEPFIELD_TEST_POSTGRES|ASPNETCORE_CONTENTROOT|ASPNETCORE_WEBROOT)$/i.test(name))delete env[name];
Object.assign(env,{ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:'http://127.0.0.1:0',IsolatedPreview:'true',Teams__0__Key:keys[0],Teams__1__Key:keys[1],EmpireAi:'false',EconomyVersion:'1',CombatVersion:'1'});
let processHandle,browser,checks=0,logs='';const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
try{
 processHandle=spawn('dotnet',[resolve(root,builtAssets?'test-results/vs-build/bin/Deepfield.Api/debug/Deepfield.Api.dll':'test-results/planet-build/bin/Deepfield.Api/debug/Deepfield.Api.dll'),'--contentRoot',content,...(builtAssets?[]:['--staticWebAssets',manifest]),'--webroot',webroot],{cwd:content,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);
 let base;
 for(let i=0;i<100;i++){if(processHandle.exitCode!==null)throw Error('Disposable API failed: '+logs);base=logs.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];if(base)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(base,'Disposable API listening');
 const state=async team=>{const response=await fetch(base+'/api/campaign',{headers:{Authorization:'Bearer '+keys[team]}});assert.equal(response.status,200);return (await response.json()).campaign;};
 check((await fetch(base+'/api/campaign')).status===401,'Unauthorized client cannot request planet projections');
 const a=await state(0),b=await state(1);
 // The isolated preview starts a real-star campaign, so homeworld ids and names come from the campaign rather than fixed slots.
 const home=[a,b].map((view,team)=>view.stars.find(star=>star.owner===team));
 check(home[0]&&home[1]&&home[0].id!==home[1].id&&a.realCatalogVersion!=null,'Isolated preview starts a real-star campaign with two distinct homeworlds');
 check(a.stars[home[0].id].statistics.knowledge==='current'&&a.stars[home[1].id].statistics.knowledge==='unknown'&&a.stars[home[1].id].statistics.fleets.length===0&&a.stars[home[1].id].owner===null,'API filters rival homeworld statistics');
 check(b.stars[home[1].id].statistics.knowledge==='current'&&b.stars[home[0].id].statistics.fleets.length===0,'API derives projection from authenticated clan');
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Clan access key').fill(keys[0]);await page.getByRole('button',{name:'Enter command deck'}).click();
 const panel=page.getByRole('region',{name:/^Selected system:/});await panel.waitFor();
 check((await panel.getAttribute('aria-label'))==='Selected system: '+home[0].name&&await panel.getByRole('img',{name:'Spacekit orbital view of '+home[0].name}).isVisible(),'Command deck opens on the clan homeworld with its orbital view');
 const statsButton=panel.getByRole('button',{name:'Open full system statistics',exact:true});await statsButton.waitFor();
 check(await statsButton.isVisible(),'Statistics opener is visible in the selected system panel');
 await page.screenshot({path:resolve(root,'test-results/planet-command-deck.png'),fullPage:true});
 await statsButton.click();let dialog=page.getByRole('dialog');await dialog.waitFor();
 check((await dialog.innerText()).includes(home[0].name)&&(await dialog.innerText()).includes(a.stars[home[0].id].statistics.colonyIncome+' credits / turn')&&(await dialog.innerText()).includes('Aurora Federation'),'Actual command deck opens own colony dossier');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 check(await statsButton.evaluate(e=>e===document.activeElement),'Statistics opener regains keyboard focus');
 const chooser=page.getByLabel('Choose star system');
 await chooser.selectOption(String(home[1].id));
 check((await panel.innerText()).includes('Uncharted; statistics unknown.'),'Selecting the rival homeworld shows it as uncharted');
 await statsButton.click();await dialog.waitFor();
 let text=await dialog.innerText();
 check(text.includes('Uncharted')&&!text.includes('Ember Empire')&&!text.includes('credits / turn')&&!text.includes('Current observation'),'Rival homeworld dossier does not expose hidden ownership or statistics');
 await page.getByRole('button',{name:'Close planet statistics'}).click();await page.getByRole('button',{name:'Leave',exact:true}).click();
 await page.getByLabel('Clan access key').fill(keys[1]);await page.getByRole('button',{name:'Enter command deck'}).click();await panel.waitFor();
 check(await dialog.count()===0&&(await panel.getAttribute('aria-label'))==='Selected system: '+home[1].name,'Changing clan clears the previous dossier and selects the new clan homeworld');
 await statsButton.click();await dialog.waitFor();text=await dialog.innerText();
 check(text.includes(home[1].name)&&text.includes('Current observation')&&text.includes('Ember Empire'),'Changing clan uses new authorized data');
 check((await state(0)).turn===1&&(await state(0)).orders.length===0,'Viewing statistics submits no orders and advances no turns');
 check(errors.length===0,'Integrated command deck has no browser errors');
 console.log(`${checks} disposable API/browser planet checks passed.`);
}finally{if(browser)await browser.close();if(processHandle&&processHandle.exitCode===null){const exited=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await exited;}}
