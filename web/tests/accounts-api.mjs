// Personal accounts end to end: a real API process, a real browser, throwaway saves under test-results/.
// With DEEPFIELD_TEST_POSTGRES set (a disposable, empty database) it also runs the hosted configuration:
// Production, PostgreSQL, HTTPS required behind a trusted proxy.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

const root=resolve('..');
const folder=resolve(root,'test-results',`accounts-${Date.now()}`); await mkdir(folder,{recursive:true});
const save=resolve(folder,'campaign.json'),port=5098,base='http://127.0.0.1:'+port;
const setupKey=randomBytes(24).toString('hex');
const ownerPassword='owner test password',samPassword='sam first password',samNewPassword='sam second password';
let processHandle,browser,count=0;
function check(value,name){assert.ok(value,name);count++;console.log('PASS '+name);}
async function start(env){
 processHandle=spawn('dotnet',[resolve(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll')],{cwd:resolve(root,'src/Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_URLS:base,EmpireAi:'false',Teams__0__Key:'',Teams__1__Key:'',...env},stdio:['ignore','pipe','pipe']});
 let logs='';processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150;i++){if(processHandle.exitCode!==null)throw Error('API startup failed: '+logs);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('API startup timed out: '+logs);
}
async function stop(){if(processHandle&&processHandle.exitCode===null&&processHandle.signalCode===null){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await done;}}
// Plain HTTP with full control of the headers a proxy would add.
function raw(path,{method='GET',body,headers={}}={}){
 return new Promise((done,fail)=>{
  const text=body===undefined?undefined:JSON.stringify(body);
  const req=httpRequest({host:'127.0.0.1',port,path,method,headers:{...(text?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}:{}),...headers}},res=>{
   let data='';res.on('data',b=>data+=b);res.on('end',()=>{let json=null;try{json=JSON.parse(data);}catch{}done({status:res.statusCode,headers:res.headers,json});});
  });
  req.on('error',fail);if(text)req.write(text);req.end();
 });
}
const post={'X-Deepfield-Request':'1'};
// Runs a same-origin request inside the page, so it carries that browser's session cookie.
const inPage=(page,path,body,headers={'X-Deepfield-Request':'1'})=>page.evaluate(async({path,body,headers})=>{
 const res=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,json:await res.json().catch(()=>null)};
},{path,body,headers});
const deck=page=>page.getByRole('heading',{name:'The stars are within reach.'});

try{
 await start({ASPNETCORE_ENVIRONMENT:'Development',Auth__Mode:'accounts',Owner__SetupKey:setupKey,SavePath:save});
 const first=await raw('/api/public/state');
 check(first.status===200&&first.json.mode==='accounts'&&first.json.setupRequired===true&&first.json.setupAvailable===true&&first.json.clans.length===2&&first.json.account===null,'A new hosted campaign reports that owner setup is required');
 check((await raw('/api/campaign')).status===401&&(await raw('/api/campaign',{headers:{Authorization:'Bearer '+randomBytes(24).toString('hex')}})).status===401,'The campaign is closed without a signed-in account, and clan keys do not open it');
 const blocked=await raw('/api/public/setup',{method:'POST',body:{setupKey,email:'owner@example.com',displayName:'Owner',password:ownerPassword,clan:0}});
 check(blocked.status===403&&(await raw('/api/public/state')).json.setupRequired===true,'A state-changing request without the Deepfield request header is rejected');
 const wrongKey=await raw('/api/public/setup',{method:'POST',headers:post,body:{setupKey:randomBytes(24).toString('hex'),email:'owner@example.com',displayName:'Owner',password:ownerPassword,clan:0}});
 check(wrongKey.status===401&&(await raw('/api/public/state')).json.setupRequired===true,'Owner setup needs the server setup key');

 browser=await chromium.launch({channel:'msedge'});
 const ownerContext=await browser.newContext(),owner=await ownerContext.newPage();
 await owner.goto(base);
 await owner.getByLabel('Setup key').fill(setupKey);await owner.getByLabel('Email').fill('Owner@Example.com');await owner.getByLabel('Display name').fill('Admiral Chris');
 await owner.getByLabel('Your clan').selectOption('0');await owner.getByLabel('Password',{exact:true}).fill(ownerPassword);await owner.getByLabel('Repeat password').fill('a different password');
 await owner.getByRole('button',{name:/Create owner account/}).click();
 check((await owner.getByRole('alert').innerText()).includes('do not match'),'Mismatched passwords are caught before anything is sent');
 await owner.getByLabel('Repeat password').fill(ownerPassword);await owner.getByRole('button',{name:/Create owner account/}).click();
 await deck(owner).waitFor();
 const ownerCampaign=(await inPage(owner,'campaign')).json.campaign;
 check(ownerCampaign.team===0&&ownerCampaign.realCatalogVersion!=null,'The owner lands on the command deck of a real-star campaign as the chosen clan');
 const cookie=(await ownerContext.cookies()).find(c=>c.name==='deepfield_session');
 check(cookie&&cookie.httpOnly&&cookie.sameSite==='Strict'&&cookie.expires>Date.now()/1000+29*86400,'The session cookie is HttpOnly, SameSite=Strict and lasts thirty days');
 const stored=await readFile(resolve(folder,'accounts.json'),'utf8');
 check(!stored.includes(ownerPassword)&&!stored.includes(cookie.value)&&stored.includes('owner@example.com'),'The saved account file holds neither the password nor the session token');
 check((await raw('/api/public/setup',{method:'POST',headers:post,body:{setupKey,email:'second@example.com',displayName:'Second',password:ownerPassword,clan:1}})).status===404,'Owner setup is closed once the owner exists');

 await owner.getByRole('button',{name:'Players',exact:true}).click();
 await owner.getByLabel('Invite to clan').selectOption('1');await owner.getByLabel('Note for yourself (optional)').fill('For Sam');
 await owner.getByRole('button',{name:'Create invitation link'}).click();
 const inviteLink=await owner.getByLabel('Link to share').inputValue();
 check(/#invite=[A-Za-z0-9_-]{40,}$/.test(inviteLink)&&await owner.getByText('For Sam').count()>0,'The owner creates an invitation link for the other clan');

 const samContext=await browser.newContext(),sam=await samContext.newPage();
 await sam.goto(inviteLink);
 await sam.getByText(/You are invited to join/).waitFor();
 check((await sam.getByText(/You are invited to join/).innerText()).includes(first.json.clans[1]),'The invitation page names the clan the player will join');
 await sam.getByLabel('Email').fill('sam@example.com');await sam.getByLabel('Display name').fill('Sam');
 await sam.getByLabel('Password',{exact:true}).fill(samPassword);await sam.getByLabel('Repeat password').fill(samPassword);
 await sam.getByRole('button',{name:/Join the clan/}).click();await deck(sam).waitFor();
 check((await inPage(sam,'campaign')).json.campaign.team===1&&!sam.url().includes('#invite'),'Accepting the invitation signs the player in to the invited clan and clears the link');
 check(await sam.getByRole('button',{name:'Players',exact:true}).count()===0&&(await inPage(sam,'admin/players')).status===403&&(await inPage(sam,'admin/invitations',{clan:0})).status===403,'A player has no owner controls and the server refuses owner requests');
 const reuse=await browser.newContext(),reusePage=await reuse.newPage();await reusePage.goto(inviteLink);await reusePage.getByRole('alert').waitFor();
 check((await reusePage.getByRole('alert').innerText()).includes('not valid'),'A used invitation link no longer works');await reuse.close();

 await sam.getByRole('tab',{name:'Clan channel'}).click();
 check(await sam.getByText('Posting as Sam').isVisible()&&await sam.getByLabel('Call sign').count()===0,'The clan channel posts under the account name, with no call sign to type');
 await sam.getByLabel('Message',{exact:true}).fill('Scouting the near stars first.');await sam.getByRole('button',{name:/Send to c/}).click();
 await sam.getByText('Message sent to your clan.').waitFor();
 const forged=await inPage(sam,'messages',{id:'forged-author-check',author:'Admiral Chris',text:'Who wrote this?'});
 const samMessages=(await inPage(sam,'campaign')).json.campaign.messages;
 check(forged.status===200&&samMessages.length===2&&samMessages.every(m=>m.author==='Sam'),'Messages are always signed with the account name, even if the request claims another author');
 check((await inPage(owner,'campaign')).json.campaign.messages.length===0,'The other clan cannot read those messages');
 check((await inPage(sam,'messages',{id:'no-header',text:'x'},{})).status===403,'A signed-in request without the Deepfield request header is rejected');

 await sam.getByRole('button',{name:'Sign out',exact:true}).click();await sam.getByRole('button',{name:/Sign in/}).waitFor();
 check((await inPage(sam,'campaign')).status===401&&(await samContext.cookies()).every(c=>c.name!=='deepfield_session'),'Signing out ends the session on the server and removes the cookie');
 await sam.getByLabel('Email').fill('sam@example.com');await sam.getByLabel('Password',{exact:true}).fill('not the password');await sam.getByRole('button',{name:/Sign in/}).click();
 await sam.getByRole('alert').waitFor();
 const wrongText=await sam.getByRole('alert').innerText();
 const unknownLogin=await raw('/api/public/login',{method:'POST',headers:post,body:{email:'nobody@example.com',password:'not the password'}});
 check(unknownLogin.status===401&&unknownLogin.json.error===wrongText,'A wrong password and an unknown email get the same answer');
 await sam.getByLabel('Password',{exact:true}).fill(samPassword);await sam.getByRole('button',{name:/Sign in/}).click();await deck(sam).waitFor();
 check((await inPage(sam,'campaign')).json.campaign.team===1,'The player signs back in with email and password');

 await owner.getByRole('button',{name:'Refresh list'}).click();
 await owner.locator('li[data-player="sam@example.com"]').getByRole('button',{name:'Reset link'}).click();
 await owner.getByText('Password reset link for Sam').waitFor();
 const resetLink=await owner.getByLabel('Link to share').inputValue();
 check(/#reset=[A-Za-z0-9_-]{40,}$/.test(resetLink),'The owner creates a one-time password reset link');
 const fresh=await browser.newContext(),resetPage=await fresh.newPage();await resetPage.goto(resetLink);
 await resetPage.getByLabel('New password').fill(samNewPassword);await resetPage.getByLabel('Repeat password').fill(samNewPassword);
 await resetPage.getByRole('button',{name:/Set password/}).click();await deck(resetPage).waitFor();
 check((await inPage(sam,'campaign')).status===401,'Resetting a password signs out the earlier session');
 check((await raw('/api/public/login',{method:'POST',headers:post,body:{email:'sam@example.com',password:samPassword}})).status===401&&
  (await raw('/api/public/login',{method:'POST',headers:post,body:{email:'sam@example.com',password:samNewPassword}})).status===200,'Only the new password works after a reset');
 check((await raw('/api/public/reset',{method:'POST',headers:post,body:{token:resetLink.split('#reset=')[1],password:'another new password'}})).status===404,'A reset link works only once');

 await owner.locator('li[data-player="sam@example.com"]').getByLabel('Clan for Sam').selectOption('0');
 await owner.locator('li[data-player="sam@example.com"]').getByRole('button',{name:'Disable'}).waitFor();
 await owner.waitForFunction(()=>!document.querySelector('.playersDialog button[disabled]'));
 check((await inPage(resetPage,'campaign')).json.campaign.team===0,'Moving a player to another clan takes effect on their next request');
 await owner.locator('li[data-player="sam@example.com"]').getByRole('button',{name:'Disable'}).click();
 await owner.locator('li[data-player="sam@example.com"]').getByText('Disabled').waitFor();
 check((await inPage(resetPage,'campaign')).status===401&&(await raw('/api/public/login',{method:'POST',headers:post,body:{email:'sam@example.com',password:samNewPassword}})).status===401,'Disabling a player signs them out and blocks sign-in');
 await owner.screenshot({path:resolve(folder,'players-dialog.png')});

 await stop();await start({ASPNETCORE_ENVIRONMENT:'Development',Auth__Mode:'accounts',Owner__SetupKey:setupKey,SavePath:save});
 check((await inPage(owner,'campaign')).status===200&&(await raw('/api/public/state')).json.setupRequired===false,'Accounts and sessions survive a server restart');
 let limited=false;
 for(let i=0;i<30&&!limited;i++)limited=(await raw('/api/public/login',{method:'POST',headers:post,body:{email:`nobody${i}@example.com`,password:'not the password'}})).status===429;
 check(limited&&(await inPage(owner,'campaign')).status===200,'Repeated sign-in attempts from one address are rate limited without affecting signed-in play');
 await browser.close();browser=null;await stop();

 await start({ASPNETCORE_ENVIRONMENT:'Development',Teams__0__Key:randomBytes(24).toString('hex'),Teams__1__Key:randomBytes(24).toString('hex'),SavePath:resolve(folder,'keys-campaign.json')});
 const keysState=await raw('/api/public/state');
 check(keysState.status===200&&keysState.json.mode==='keys'&&(await raw('/api/public/login',{method:'POST',headers:post,body:{}})).status===401,'Local development still defaults to clan keys, with no account endpoints');
 await stop();

 const connection=process.env.DEEPFIELD_TEST_POSTGRES;
 if(connection){
  const hosted={ASPNETCORE_ENVIRONMENT:'Production',ConnectionStrings__Deepfield:connection,Owner__SetupKey:setupKey,Proxy__TrustForwardedHeaders:'true'};
  const viaProxy={'X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.7',Host:'deepfield.example'};
  await start(hosted);
  const plain=await raw('/api/public/state',{headers:{Host:'deepfield.example'}});
  check(plain.status===308&&plain.headers.location==='https://deepfield.example/api/public/state','Hosted: plain HTTP is redirected to HTTPS');
  check((await raw('/health')).status===200&&(await raw('/health/ready')).json?.status==='ok','Hosted: health and database readiness answer over plain HTTP for platform probes');
  const hostedState=await raw('/api/public/state',{headers:viaProxy});
  check(hostedState.status===200&&hostedState.json.mode==='accounts'&&hostedState.json.setupRequired&&/max-age=\d+/.test(hostedState.headers['strict-transport-security']??''),'Hosted: Production starts in accounts mode without clan keys and sends HSTS');
  const made=await raw('/api/public/setup',{method:'POST',headers:{...viaProxy,...post},body:{setupKey,email:'owner@example.com',displayName:'Owner',password:ownerPassword,clan:0}});
  const setCookie=(made.headers['set-cookie']??[])[0]??'';
  check(made.status===200&&setCookie.startsWith('__Host-deepfield_session=')&&/; secure/i.test(setCookie)&&/; httponly/i.test(setCookie)&&/samesite=strict/i.test(setCookie)&&/path=\//i.test(setCookie),'Hosted: the session cookie is __Host- prefixed, Secure, HttpOnly and SameSite=Strict');
  const session={...viaProxy,Cookie:setCookie.split(';')[0]};
  const hostedCampaign=await raw('/api/campaign',{headers:session});
  check(hostedCampaign.status===200&&hostedCampaign.json.campaign.realCatalogVersion!=null&&hostedCampaign.json.localTest===false,'Hosted: a new PostgreSQL campaign uses the real-star map and has no local test controls');
  check((await raw('/api/local/advance',{method:'POST',headers:{...session,...post},body:{turn:hostedCampaign.json.campaign.turn}})).status!==200,'Hosted: the local turn-advance endpoint is not available');
  await stop();await start(hosted);
  const after=await raw('/api/campaign',{headers:session});
  check(after.status===200&&after.json.campaign.turn===hostedCampaign.json.campaign.turn&&(await raw('/api/public/state',{headers:viaProxy})).json.setupRequired===false,'Hosted: campaign, accounts and sessions persist in PostgreSQL across a restart');
  await stop();
 }else console.log('SKIP hosted PostgreSQL configuration: DEEPFIELD_TEST_POSTGRES not configured.');
 console.log(`${count} account API/browser checks passed; files in ${folder}`);
}finally{if(browser)await browser.close();await stop();}
