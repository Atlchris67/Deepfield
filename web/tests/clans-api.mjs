// Three and four clans end to end: choosing the number of clans, inviting a third clan's player, alliances and a shared win.
// A real API process and a real browser, with throwaway saves under test-results/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('..');
const folder=resolve(root,'test-results',`clans-${Date.now()}`); await mkdir(folder,{recursive:true});
const save=resolve(folder,'campaign.json'),base='http://127.0.0.1:5094';
const setupKey=randomBytes(24).toString('hex'),password='clan test password';
let processHandle,browser,count=0;
function check(value,name){assert.ok(value,name);count++;console.log('PASS '+name);}
async function start(env){
 processHandle=spawn('dotnet',[process.env.DEEPFIELD_TEST_API_DLL??resolve(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll'),...(process.env.DEEPFIELD_TEST_WEBROOT?['--webroot',process.env.DEEPFIELD_TEST_WEBROOT]:[])],{cwd:resolve(root,'src/Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,EmpireAi:'false',Teams__0__Key:'',Teams__1__Key:'',Teams__2__Key:'',Teams__3__Key:'',...env},stdio:['ignore','pipe','pipe']});
 let logs='';processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150;i++){if(processHandle.exitCode!==null)throw Error('API startup failed: '+logs);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('API startup timed out: '+logs);
}
async function stop(){if(processHandle&&processHandle.exitCode===null&&processHandle.signalCode===null){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await done;}}
function client(){
 let cookie='';
 const call=async(path,body,method=body===undefined?'GET':'POST')=>{
  const res=await fetch(base+'/api/'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-Deepfield-Request':'1'})},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const set=res.headers.getSetCookie?.()[0];if(set)cookie=set.split(';')[0];
  return {status:res.status,json:await res.json().catch(()=>null)};
 };
 return {call,cookie:()=>cookie,campaign:async()=>(await call('campaign')).json.campaign};
}
const accounts={Auth__Mode:'accounts',Owner__SetupKey:setupKey,SavePath:save,LocalTest:'true',MapSeed:'21'};
async function page(context,session){
 await context.addCookies([{name:'deepfield_session',value:session.cookie().split('=')[1],url:base}]);
 const tab=await context.newPage();await tab.goto(base);await tab.getByRole('heading',{name:'The stars are within reach.'}).waitFor();return tab;
}
const advance=async session=>{const turn=(await session.campaign()).turn;const result=await session.call('local/advance',{turn});assert.equal(result.status,200);assert.ok(result.json.advanced);};

try{
 await start(accounts);
 const owner=client(),sam=client(),kim=client();
 assert.equal((await owner.call('public/setup',{setupKey,email:'owner@example.com',displayName:'Admiral Chris',password,clan:0})).status,200);
 assert.equal((await sam.call('public/accept',{token:(await owner.call('admin/invitations',{clan:1})).json.token,email:'sam@example.com',displayName:'Sam',password})).status,200);
 const two=await owner.campaign();
 check(two.seats.length===2&&two.pacts.length===0&&(await owner.call('alliances',{action:'offer',clan:1})).status===409&&(await owner.call('admin/invitations',{clan:2})).status!==200,'A two-clan season has no alliances and no third clan to invite to');

 // The owner sets up the season for three clans in the browser.
 browser=await chromium.launch({channel:'msedge'});
 const ownerPage=await page(await browser.newContext(),owner);
 check(await ownerPage.getByRole('region',{name:'Alliances'}).count()===0,'With two clans the command deck shows no alliances panel');
 await ownerPage.getByRole('button',{name:'Season 1',exact:true}).click();
 const ownerDialog=ownerPage.getByRole('dialog');
 await ownerDialog.getByLabel('Number of clans').selectOption('3');
 await ownerDialog.getByRole('button',{name:'Use for season 1'}).click();await ownerPage.getByText('Winning condition saved for season 1.').waitFor();
 const three=await owner.campaign(),state=(await owner.call('public/state')).json;
 check(three.seats.length===3&&three.seats[2].name==='Tidal Concord'&&three.stars.filter(star=>star.owner===0).length===1&&state.clans.length===3&&three.mode==='simple','The owner changes season 1 to three clans before its first turn, and the third clan appears');
 check(await ownerDialog.locator('.seatFields label').count()===3,'The season dialog lists who plays each of the three clans');
 await ownerDialog.getByRole('button',{name:'Close'}).click();
 const invitation=await owner.call('admin/invitations',{clan:2});
 assert.equal((await kim.call('public/accept',{token:invitation.json.token,email:'kim@example.com',displayName:'Kim',password})).status,200);
 const kimFirst=await kim.campaign();
 check(invitation.status===200&&kimFirst.team===2&&kimFirst.name==='Tidal Concord'&&kimFirst.stars.filter(star=>star.owner===2).length===1&&kimFirst.stars.filter(star=>star.visible).length===1,'A player invited to the third clan joins it and sees only its own homeworld');
 check((await owner.call('admin/mode',{season:1,mode:'simple',clans:2})).status===409&&(await owner.campaign()).seats.length===3,'The season cannot drop a clan while a player belongs to it');

 // Alliances in the browser.
 const samPage=await page(await browser.newContext(),sam),kimPage=await page(await browser.newContext(),kim);
 await ownerPage.reload();await ownerPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 const panel=tab=>tab.getByRole('region',{name:'Alliances'});
 const row=(tab,name)=>panel(tab).locator('li').filter({hasText:name});
 await row(ownerPage,'Ember Empire').getByRole('button',{name:'Offer alliance'}).click();
 await ownerPage.getByText('Alliance offered to Ember Empire.').waitFor();
 const offered=await sam.campaign(),unseen=await kim.campaign();
 check(offered.allianceOffersReceived.join()==='0'&&unseen.allianceOffersReceived.length===0&&unseen.allianceOffersMade.length===0&&unseen.pacts.length===0&&(await row(ownerPage,'Ember Empire').innerText()).includes('Waiting for an answer'),'An alliance offer made in the browser reaches the other clan and is hidden from the third');
 await samPage.reload();await samPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 await row(samPage,'Aurora Federation').getByRole('button',{name:'Accept'}).click();
 await samPage.getByText('Your clan and Aurora Federation are allied from next turn.').waitFor();
 await kimPage.reload();await kimPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check((await row(samPage,'Aurora Federation').innerText()).includes('Allied from turn 2.')&&(await panel(kimPage).innerText()).includes('Aurora Federation and Ember Empire are allied from turn 2.')&&(await kim.campaign()).pacts.length===1,'Accepting makes the alliance, which every clan can see, starting next turn');
 const samHome=offered.stars.find(star=>star.owner===1).id;
 check(!(await owner.campaign()).stars[samHome].visible,'Before the alliance starts the allies do not yet share sight');
 await advance(owner);
 const allied=await owner.campaign(),outside=await kim.campaign();
 check(allied.turn===2&&allied.allies.join()==='1'&&allied.stars[samHome].visible&&allied.stars[samHome].owner===1&&!outside.stars[samHome].visible&&outside.allies.length===0,'From the next turn allies see each other\'s systems, and the third clan does not');
 await ownerPage.reload();await ownerPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 await ownerPage.locator('.realStar.ally').first().waitFor();
 check(await ownerPage.locator('.realStar.ally').count()===1&&(await ownerPage.locator('.realStar.ally').getAttribute('title')).includes('held by Ember Empire, your ally')&&await ownerPage.locator('.galaxyLegend .legendAlly').count()===1,'The map marks an ally\'s colony in its own colour and names the clan that holds it');
 await ownerPage.screenshot({path:resolve(folder,'alliances.png'),fullPage:true});
 check((await kim.call('alliances',{action:'end',clan:0})).status===409&&(await kim.call('alliances',{action:'sing',clan:0})).status===409&&(await kim.call('alliances',{action:'offer',clan:2})).status===409,'A clan cannot end an alliance it is not in, ally with itself, or send an unknown action');
 await row(ownerPage,'Ember Empire').getByRole('button',{name:'Give notice to end'}).click();
 await ownerPage.getByText('Notice given to Ember Empire.',{exact:false}).waitFor();
 check((await row(ownerPage,'Ember Empire').innerText()).includes('Allied until turn 4 begins')&&(await sam.campaign()).pacts[0].ends===4,'Giving notice in the browser ends the alliance after this turn and the next');
 await advance(owner);
 check((await owner.campaign()).allies.join()==='1','During the notice turn the clans are still allied');
 await advance(owner);
 const ended=await owner.campaign();
 check(ended.turn===4&&ended.pacts.length===0&&ended.allies.length===0&&!ended.stars[samHome].visible,'When the notice runs out the alliance and the shared sight end');

 // A win shared with an ally, decided by editing the throwaway save while the server is stopped.
 assert.equal((await sam.call('alliances',{action:'offer',clan:2})).status,200);assert.equal((await kim.call('alliances',{action:'offer',clan:1})).status,200);
 await advance(owner);
 await browser.close();browser=null;await stop();
 const saved=JSON.parse(await readFile(save,'utf8'));
 saved.Victory={Colonies:2,Collectors:2,TurnLimit:0};
 const free=saved.Stars.find(star=>star.Owner===null);free.Owner=1;free.Inhabitants=20;free.Collectors=2;
 await writeFile(save,JSON.stringify(saved));
 await start(accounts);
 await advance(owner);
 const final=await owner.campaign(),finalKim=await kim.campaign();
 check(final.winner===3&&final.winners.join()==='1,2'&&final.outcome.winners.join()==='1,2'&&finalKim.winners.join()==='1,2','When a clan wins, its ally shares the win and the other clan does not');
 browser=await chromium.launch({channel:'msedge'});
 const lost=await page(await browser.newContext(),owner),wonPage=await page(await browser.newContext(),kim);
 const lostDialog=lost.getByRole('dialog'),wonDialog=wonPage.getByRole('dialog');
 await lostDialog.getByRole('heading',{name:'Defeat'}).waitFor();await wonDialog.getByRole('heading',{name:'Shared victory'}).waitFor();
 check((await lostDialog.locator('.seasonLead').innerText()).includes('Ember Empire and Tidal Concord share the victory')&&await lostDialog.locator('.standings tr.won').count()===2&&(await lost.locator('.banner').innerText()).includes('An alliance of other clans achieved Type III.'),'The clan left out sees a defeat that names both winners');
 check((await wonDialog.locator('.seasonLead').innerText()).includes('Ember Empire and Tidal Concord share the victory')&&(await wonPage.locator('.banner').innerText()).includes('Shared victory'),'The winner\'s ally sees a shared victory');
 await wonPage.screenshot({path:resolve(folder,'shared-victory.png')});

 // The next season with four clans, then back to two.
 await lostDialog.getByLabel('Number of clans').selectOption('4');
 await lostDialog.getByRole('button',{name:/Start season 2/}).click();await lost.getByText('Season 2 has begun on a new map.').waitFor();
 const second=await owner.campaign();
 check(second.season===2&&second.seats.length===4&&second.seats[3].name==='Verdant League'&&second.pacts.length===0&&second.history[0].winners.join()==='1,2'&&second.history[0].standings.length===3&&second.stars.filter(star=>star.owner!==null&&star.visible).length===1,'The owner starts the next season with four clans; alliances do not carry over and the record keeps both winners');
 await lost.getByRole('button',{name:'Season 2',exact:true}).click();
 check((await lostDialog.locator('.seasonHistory li').first().innerText()).includes('Shared victory: Ember Empire and Tidal Concord'),'The season record names the clans that shared the win');
 const blocked=await owner.call('admin/season',{season:2,endEarly:true,clans:2});
 check(blocked.status===409&&blocked.json.error.includes('Kim')&&(await owner.campaign()).season===2,'A season with fewer clans is refused while a player is in a clan that would be left out, and says who');
 const players=(await owner.call('admin/players')).json.players;
 assert.equal((await owner.call(`admin/players/${players.find(player=>player.displayName==='Kim').id}/clan`,{clan:1})).status,200);
 const smaller=await owner.call('admin/season',{season:2,endEarly:true,clans:2});
 const third=await kim.campaign();
 check(smaller.status===200&&third.season===3&&third.seats.length===2&&third.team===1&&(await owner.call('public/state')).json.clans.length===2&&(await owner.call('alliances',{action:'offer',clan:1})).status===409,'Once the player is moved, the next season can go back to two clans, with no alliances');
 await browser.close();browser=null;await stop();

 // Clan keys: a third and fourth key are optional, and a key only works in a campaign that has its clan.
 const keys=[0,1,2].map(()=>randomBytes(24).toString('hex'));
 const keyed=async(team,path,body)=>{const res=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+keys[team],...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,json:await res.json().catch(()=>null)};};
 await start({Teams__0__Key:keys[0],Teams__1__Key:keys[1],Teams__2__Key:keys[2],SavePath:resolve(folder,'keys.json'),LocalTest:'true',Mode:'simple',MapSeed:'5'});
 check((await keyed(0,'campaign')).json.campaign.seats.length===2&&(await keyed(2,'campaign')).status===409,'With clan keys, a third key is refused while the campaign has two clans');
 const grown=await keyed(0,'admin/season',{season:1,endEarly:true,clans:3,mapSeed:6});
 const thirdSeat=(await keyed(2,'campaign')).json?.campaign;
 check(grown.status===200&&thirdSeat?.team===2&&thirdSeat.seats.length===3&&(await keyed(2,'alliances',{action:'offer',clan:0})).status===200&&(await keyed(0,'campaign')).json.campaign.allianceOffersReceived.join()==='2','After a season with three clans starts, the third key plays the third clan and can offer an alliance');
 await stop();
 await start({Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:resolve(folder,'keys-four.json'),Mode:'advanced',Clans:'4',MapSeed:'9'});
 const fourClans=(await keyed(0,'campaign')).json.campaign;
 check(fourClans.seats.length===4&&fourClans.mode==='advanced'&&fourClans.stars.filter(star=>star.owner===0).length===1,'A new campaign can be created with four clans from the Clans setting');
 await stop();
 console.log(`${count} clan and alliance API/browser checks passed; files in ${folder}`);
}finally{if(browser)await browser.close();await stop();}
