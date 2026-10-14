import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

const root=resolve('..');
const artifacts=resolve(root,'test-results'); await mkdir(artifacts,{recursive:true});
const save=resolve(artifacts,`smoke-${Date.now()}.json`);
const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
const base='http://127.0.0.1:5087';
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
try{
 await start();
 check((await fetch(base+'/api/campaign')).status===401,'Unauthenticated campaign denied');
 check((await state()).stars[11].ships===null,'API omits hidden fleet data');
 check((await api('local/advance',{method:'POST',body:{turn:1},headers:{'X-Forwarded-For':'8.8.8.8'}})).status===404,'Proxied acceleration denied');
 const publicHostStatus=await new Promise((done,fail)=>{const req=httpRequest(base+'/api/local/advance',{method:'POST',headers:{Host:'starzdeepfield.com',Authorization:'Bearer '+keys[0],'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>done(res.statusCode));});req.on('error',fail);req.end(JSON.stringify({turn:1}));});
 check(publicHostStatus===404,'Public hostname acceleration denied');
 const initial=await state();
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
 const snapshot=JSON.parse(await readFile(save,'utf8'));snapshot.Deadline='2026-01-01T00:00:00Z';await writeFile(save,JSON.stringify(snapshot));
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
 await page.getByRole('button',{name:'Resolve one test turn'}).click();await page.getByRole('status').filter({hasText:'One test turn resolved.'}).waitFor();
 check((await state()).energy===2,'Browser commit and test turn update campaign');
 await page.screenshot({path:resolve(artifacts,'command-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(artifacts,'command-mobile.png'),fullPage:true});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout has no horizontal overflow');
 check(errors.length===0,'Browser has no uncaught application errors');
 await browser.close();browser=null;
 await stop(); await start({LocalTest:'false'});
 check((await api('local/advance',{method:'POST',body:{turn:4}})).status===404,'Acceleration disabled without explicit opt-in');
 await stop();
 // Production must refuse the local-only persistence fallback entirely.
 let rejected=false;try{await start({ASPNETCORE_ENVIRONMENT:'Production'});}catch(e){rejected=String(e).includes('PostgreSQL connection required');}
 check(rejected,'Production refuses development file store and test endpoint');
 console.log(`${count} API/browser checks passed; screenshots in ${artifacts}`);
}finally{if(browser)await browser.close();await stop();}
