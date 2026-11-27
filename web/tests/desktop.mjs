// Desktop finish checks (milestone 6): the command deck and its dialogs at three desktop window sizes, in both modes.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve('..'),folder=resolve(root,'test-results','desktop');
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true});
const dll=process.env.DEEPFIELD_TEST_API_DLL??resolve(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll');
const sizes=[[1280,720],[1440,900],[1920,1080]],password='desktop check password';
// Spacekit 0.1.1 registers a sphere that has an orbit twice and logs this each time. It is harmless and the only message allowed.
const knownLibraryMessage=/^Object id is not unique: "planet-\d+-\d+"/;
let count=0,browser;
const check=(ok,label,detail='')=>{if(!ok)throw Error('FAIL '+label+(detail?' — '+detail:''));count++;console.log('PASS '+label);};

const measure=()=>{
 const scope=document.querySelector('dialog[open]')??document.body,out={overflowX:document.scrollingElement.scrollWidth-innerWidth,offscreen:[],small:[],unnamed:[]};
 const label=e=>e.tagName.toLowerCase()+'.'+String(e.className?.baseVal??e.className).replace(/\s+/g,'.')+' "'+(e.innerText||'').slice(0,30).replace(/\s+/g,' ')+'"';
 for(const e of scope.querySelectorAll('*')){
  const r=e.getBoundingClientRect(),style=getComputedStyle(e);if(!r.width||!r.height||style.visibility==='hidden'||e.closest('details:not([open])>:not(summary)'))continue;
  if(r.right>innerWidth+1&&!e.closest('svg,canvas'))out.offscreen.push(label(e));
  const size=parseFloat(style.fontSize);
  if(size>0&&size<11&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))out.small.push(label(e)+' '+style.fontSize);
  if(e.matches('button,a,select,input,textarea')&&!(e.innerText||'').trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.labels?.length&&!e.getAttribute('title'))out.unnamed.push(label(e));
 }
 return out;
};
const sky=()=>{
 const box=s=>document.querySelector(s)?.getBoundingClientRect(),galaxy=box('.inlineRealSky .spacekitGalaxy'),details=box('.inlineRealSky .realSystemDetails');
 const names=[...document.querySelectorAll('.spacekitGalaxyLabels .realStarName')].map(e=>({name:e.textContent,r:e.getBoundingClientRect()})).filter(n=>n.r.width>0);
 const overlaps=[];for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i].r,b=names[j].r;if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)overlaps.push(names[i].name+' / '+names[j].name);}
 const tabs=document.querySelector('.inlineRealSky .systemTabs'),controls=[...document.querySelectorAll('.inlineRealSky .orbitZoomControls button')];
 return {tabsFit:!!tabs&&tabs.scrollWidth<=tabs.clientWidth+1&&[...tabs.children].every(e=>e.getBoundingClientRect().height<52)&&controls.length===3&&controls.every(e=>e.getBoundingClientRect().height<48),beside:!!galaxy&&!!details&&Math.abs(galaxy.top-details.top)<2,gap:galaxy&&details?Math.round(details.bottom-galaxy.bottom):null,height:galaxy?Math.round(galaxy.height):0,shown:names.length,overlaps,
  heading:document.querySelector('.realSystemDetails h3')?.textContent,chosen:document.querySelector('.realSystemDetails select')?.selectedOptions[0]?.textContent,
  active:document.querySelector('.spacekitGalaxyLabels .realStar.active .realStarName')?.textContent,text:document.querySelector('#campaign-details')?.innerText??''};
};

async function run(mode,port){
 const base='http://127.0.0.1:'+port,setupKey=randomBytes(24).toString('hex'),data=resolve(folder,mode);await mkdir(data,{recursive:true});
 let cookie='';
 const call=async(path,body)=>{const res=await fetch(base+'/api/'+path,{method:'POST',headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json','X-Deepfield-Request':'1'},body:JSON.stringify(body??{})});const set=res.headers.getSetCookie?.()[0];if(set)cookie=set.split(';')[0];return res.status;};
 const server=spawn('dotnet',[dll],{cwd:resolve(root,'src/Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,Teams__0__Key:'',Teams__1__Key:'',Auth__Mode:'accounts',Owner__SetupKey:setupKey,SavePath:resolve(data,'campaign.json'),LocalTest:'true',MapSeed:'77',Mode:mode},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 try{
  for(let i=0;;i++){if(server.exitCode!==null||i>150)throw Error('API startup failed: '+logs);try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),messages=[];
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')messages.push(m.text());});page.on('pageerror',e=>messages.push('pageerror: '+e.message));
  await page.goto(base);await page.getByLabel('Setup key').waitFor();
  const first=await page.evaluate(measure);
  check(first.overflowX<=0&&!first.small.length&&!first.unnamed.length,`[${mode}] The owner setup screen fits a desktop window, with no text under 11px and every control named`,JSON.stringify(first));
  if(await call('public/setup',{setupKey,email:'owner@example.com',displayName:'Admiral Chris',password,clan:0})!==200)throw Error('setup failed');
  // The computer plays four turns for the owner's clan so the deck shows colonies, reports and intelligence, then hands the clan back.
  await call('admin/clan',{team:0,computer:true});for(let turn=1;turn<=4;turn++)await call('local/advance',{turn});await call('admin/clan',{team:0,computer:false});
  await context.addCookies([{name:'deepfield_session',value:cookie.split('=')[1],url:base}]);
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.goto(base);await page.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('.spacekitGalaxyLabels .realStar')].some(e=>e.style.left));await page.waitForTimeout(700);
   await page.screenshot({path:resolve(folder,`${mode}-deck-${width}.png`),fullPage:true});
   const layout=await page.evaluate(measure),view=await page.evaluate(sky);
   check(layout.overflowX<=0&&!layout.offscreen.length,`[${mode}] At ${width}×${height} the command deck has no sideways scrolling and nothing off the edge`,JSON.stringify(layout.offscreen));
   check(!layout.small.length&&!layout.unnamed.length,`[${mode}] At ${width}×${height} no text is under 11px and every control has a name`,JSON.stringify([layout.small,layout.unnamed]));
   check(view.beside&&view.height>=370&&(Math.abs(view.gap)<=2||view.height>=Math.max(650,height-40)-1),`[${mode}] At ${width}×${height} the sky sits beside the system panel and fills its height, up to the height of the window`,JSON.stringify({...view,text:''}));
   check(view.tabsFit,`[${mode}] At ${width}×${height} the four system tabs and the orbit controls are fully visible, none cut off or broken inside a button`);
   check(view.shown>=8&&!view.overlaps.length,`[${mode}] At ${width}×${height} no star name covers another (${view.shown} of 24 names shown)`,JSON.stringify(view.overlaps));
   check(!!view.heading&&view.heading===view.chosen&&view.heading===view.active&&(mode==='simple'||view.text.includes('Selected system: '+view.heading+'.')),`[${mode}] At ${width}×${height} the sky, the system panel and (in advanced mode) the logistics panel start on the same system, one of the clan's colonies`,JSON.stringify([view.heading,view.chosen,view.active]));
  }
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(500);
  // A star whose name is hidden shows it when reached with the keyboard, and choosing it moves every panel.
  const crowded=page.locator('.spacekitGalaxyLabels .realStar.crowded').first();
  if(await crowded.count()){
   await crowded.focus();const name=await crowded.locator('.realStarName').textContent();
   check(await crowded.locator('.realStarName').isVisible(),`[${mode}] A star whose name is hidden shows it when it has keyboard focus`);
   await page.keyboard.press('Enter');await page.waitForFunction(n=>document.querySelector('.realSystemDetails h3')?.textContent===n,name);
   const view=await page.evaluate(sky);
   check(view.active===name&&view.chosen===name,`[${mode}] Choosing a star with the keyboard selects it in the sky and the system panel`);
  }
  for(const [name,title] of [['Players','Players and invitations'],[/^Season \d+$/,null],['Colonization planner','Colonization planner']]){
   const button=page.getByRole('button',{name,exact:typeof name==='string'}).first();await button.focus();await page.keyboard.press('Enter');
   const dialog=page.locator('dialog[open]');await dialog.waitFor();await page.waitForTimeout(300);
   const label=typeof name==='string'?name:'Season';await page.screenshot({path:resolve(folder,`${mode}-dialog-${label.replace(/\W+/g,'-')}.png`)});
   const fit=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}),inside=await page.evaluate(measure);
   check(fit&&!inside.small.length&&!inside.unnamed.length&&!inside.offscreen.length&&(!title||await dialog.getByRole('heading',{name:title}).count()===1),`[${mode}] The ${label} dialog opens from the keyboard, fits the window and has no small text or unnamed control`,JSON.stringify(inside));
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   check(await page.locator('dialog[open]').count()===0&&await button.evaluate(e=>e===document.activeElement),`[${mode}] Escape closes the ${label} dialog and returns focus to its button`);
  }
  const unexpected=[...new Set(messages)].filter(text=>!knownLibraryMessage.test(text));
  check(unexpected.length===0,`[${mode}] The browser console shows no errors or warnings`,JSON.stringify(unexpected));
  await context.close();
 }finally{if(server.exitCode===null&&server.signalCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}}
}
try{
 browser=await chromium.launch({channel:'msedge'});
 await run('simple',5093);await run('advanced',5094);
 console.log(`${count} desktop checks passed.`);
}finally{await browser?.close();}
