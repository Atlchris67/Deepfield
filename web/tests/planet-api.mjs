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
 check(a.stars[0].statistics.knowledge==='current'&&a.stars[11].statistics.knowledge==='unknown'&&a.stars[11].statistics.fleets.length===0,'API filters rival homeworld statistics');
 check(b.stars[11].statistics.knowledge==='current'&&b.stars[0].statistics.fleets.length===0,'API derives projection from authenticated clan');
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Clan access key').fill(keys[0]);await page.getByRole('button',{name:'Enter command deck'}).click();
 const preview=page.getByRole('img',{name:'Rotatable model of Hearth'});await preview.waitFor();const previewBox=await preview.boundingBox();
 check(previewBox&&Math.round(previewBox.width)===250&&Math.round(previewBox.height)===250,'Selected system renders a 250px rotatable planet preview');
 await preview.focus();await preview.press('ArrowRight');
 await page.getByRole('button',{name:'View planet statistics'}).waitFor();
 check(await page.locator('.brief').getByRole('button',{name:'View planet statistics'}).isVisible(),'Planet CTA is visible beside the selected system summary');
 await page.screenshot({path:resolve(root,'test-results/planet-command-deck.png'),fullPage:true});
 await page.getByRole('button',{name:'View planet statistics'}).click();let dialog=page.getByRole('dialog');await dialog.waitFor();
 check((await dialog.innerText()).includes('Hearth')&&(await dialog.innerText()).includes('18 credits / turn'),'Actual command deck opens own colony dossier');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 check(await page.getByRole('button',{name:'View planet statistics'}).evaluate(e=>e===document.activeElement),'Actual map opener regains keyboard focus');
 await page.locator('.map button').nth(11).click();await page.getByRole('button',{name:'View planet statistics'}).click();await dialog.waitFor();
 check((await dialog.innerText()).includes('Uncharted')&&!(await dialog.innerText()).includes('Dawn'),'Map-selected enemy entry does not expose hidden name or stats');
 await page.getByRole('button',{name:'Close planet statistics'}).click();await page.getByRole('button',{name:'Leave',exact:true}).click();
 await page.getByLabel('Clan access key').fill(keys[1]);await page.getByRole('button',{name:'Enter command deck'}).click();await page.locator('.map button').nth(11).click();await page.getByRole('button',{name:'View planet statistics'}).click();await dialog.waitFor();
 check((await dialog.innerText()).includes('Dawn')&&(await dialog.innerText()).includes('Current observation'),'Changing clan clears previous modal and uses new authorized data');
 check((await state(0)).turn===1&&(await state(0)).orders.length===0,'Viewing statistics submits no orders and advances no turns');
 check(errors.length===0,'Integrated command deck has no browser errors');
 console.log(`${checks} disposable API/browser planet checks passed.`);
}finally{if(browser)await browser.close();if(processHandle&&processHandle.exitCode===null){const exited=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await exited;}}
