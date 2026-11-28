// Seasons end to end: victory screen, season history and starting the next season on a new map.
// A real API process and a real browser, with throwaway saves under test-results/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('..');
const folder=resolve(root,'test-results',`seasons-${Date.now()}`); await mkdir(folder,{recursive:true});
const save=resolve(folder,'campaign.json'),base='http://127.0.0.1:5096';
const setupKey=randomBytes(24).toString('hex'),password='season test password';
let processHandle,browser,count=0;
function check(value,name){assert.ok(value,name);count++;console.log('PASS '+name);}
async function start(env){
 processHandle=spawn('dotnet',[resolve(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll')],{cwd:resolve(root,'src/Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,EmpireAi:'false',Teams__0__Key:'',Teams__1__Key:'',...env},stdio:['ignore','pipe','pipe']});
 let logs='';processHandle.stdout.on('data',b=>logs+=b);processHandle.stderr.on('data',b=>logs+=b);
 for(let i=0;i<150;i++){if(processHandle.exitCode!==null)throw Error('API startup failed: '+logs);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('API startup timed out: '+logs);
}
async function stop(){if(processHandle&&processHandle.exitCode===null&&processHandle.signalCode===null){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill();await done;}}
// A signed-in API client that keeps its own session cookie.
function client(){
 let cookie='';
 const call=async(path,body,method=body===undefined?'GET':'POST',extra={})=>{
  const res=await fetch(base+'/api/'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-Deepfield-Request':'1'}),...extra},body:method==='GET'?undefined:JSON.stringify(body??{})});
  const set=res.headers.getSetCookie?.()[0];if(set)cookie=set.split(';')[0];
  return {status:res.status,json:await res.json().catch(()=>null)};
 };
 return {call,cookie:()=>cookie};
}
const accounts={ASPNETCORE_ENVIRONMENT:'Development',Auth__Mode:'accounts',Owner__SetupKey:setupKey,SavePath:save};
const homes=campaign=>campaign.stars.filter(star=>star.owner===campaign.team).map(star=>star.id);
const linkText=campaign=>campaign.links.map(link=>link.from+'-'+link.to).join(' ');
const classicLinks='0-1 0-3 0-6 1-10 1-11 1-18 2-6 2-8 2-12 2-21 3-16 3-23 4-5 4-11 5-7 5-8 7-9 7-19 8-12 9-14 9-17 9-19 10-13 10-18 10-22 12-21 13-22 14-15 14-17 14-20 15-16 16-23 19-20';
async function page(context,session){
 await context.addCookies([{name:'deepfield_session',value:session.cookie().split('=')[1],url:base}]);
 const tab=await context.newPage();await tab.goto(base);await tab.getByRole('heading',{name:'The stars are within reach.'}).waitFor();return tab;
}

try{
 await start(accounts);
 const owner=client(),sam=client();
 assert.equal((await owner.call('public/setup',{setupKey,email:'owner@example.com',displayName:'Admiral Chris',password,clan:0})).status,200);
 const invitation=await owner.call('admin/invitations',{clan:1});
 assert.equal((await sam.call('public/accept',{token:invitation.json.token,email:'sam@example.com',displayName:'Sam',password})).status,200);
 const firstOwner=(await owner.call('campaign')).json,firstSam=(await sam.call('campaign')).json;
 check(firstOwner.campaign.season===1&&firstOwner.campaign.outcome===null&&firstOwner.campaign.history.length===0&&firstOwner.campaign.winner===null,'A new campaign is season 1 with no result and no history');
 check(firstOwner.seasonControl===true&&firstSam.seasonControl===false,'Only the campaign owner is offered season control');
 check(linkText(firstOwner.campaign)!==classicLinks&&homes(firstOwner.campaign).length===1&&homes(firstSam.campaign).length===1&&homes(firstOwner.campaign)[0]!==homes(firstSam.campaign)[0],'A hosted campaign starts on a seeded map, not the fixed original layout');
 check((await sam.call('admin/season',{season:1,endEarly:true})).status===403&&(await owner.call('admin/season',{season:1})).status===409&&(await owner.call('campaign')).json.campaign.season===1,'A player cannot start a season, and the owner cannot replace an undecided season by accident');
 check(firstOwner.campaign.victory.colonies===5&&firstOwner.campaign.victory.collectors===12&&firstOwner.campaign.victory.turnLimit===0&&firstOwner.campaign.goal===12,'A new campaign starts with the standard winning condition');
 check((await sam.call('admin/victory',{season:1,victory:{colonies:3,collectors:6,turnLimit:0}})).status===403&&(await owner.call('admin/victory',{season:1,victory:{colonies:1,collectors:6,turnLimit:0}})).status===409&&(await owner.call('admin/victory',{season:2,victory:{colonies:3,collectors:6,turnLimit:0}})).status===409&&(await sam.call('campaign')).json.campaign.victory.colonies===5,'Only the owner can change the winning condition, and only to a valid one for the current season');
 const chosen=await owner.call('admin/victory',{season:1,victory:{colonies:3,collectors:6,turnLimit:30}}),seen=(await sam.call('campaign')).json.campaign;
 check(chosen.status===200&&seen.victory.colonies===3&&seen.victory.collectors===6&&seen.victory.turnLimit===30&&seen.goal===6&&seen.reports[0].includes('3 colonies and 6 collectors'),'The owner sets the winning condition before the first turn and the other clan is told');
 check(firstOwner.campaign.mode==='simple'&&firstOwner.campaign.materials===null&&firstOwner.campaign.combatVersion===0&&firstOwner.campaign.nextIncome===15,'A new hosted campaign starts in simple mode');
 check((await sam.call('admin/mode',{season:1,mode:'advanced'})).status===403&&(await owner.call('admin/mode',{season:1,mode:'expert'})).status===409&&(await owner.call('admin/mode',{season:2,mode:'advanced'})).status===409&&(await sam.call('campaign')).json.campaign.mode==='simple','Only the owner can change the mode, and only to a known mode for the current season');
 const linksBeforeMode=linkText(firstOwner.campaign),toAdvanced=await owner.call('admin/mode',{season:1,mode:'advanced'}),asAdvanced=(await sam.call('campaign')).json.campaign;
 check(toAdvanced.status===200&&asAdvanced.mode==='advanced'&&asAdvanced.combatVersion===1&&asAdvanced.logisticsVersion===1&&asAdvanced.economyVersion===1&&linkText(asAdvanced)===linksBeforeMode&&asAdvanced.victory.colonies===3&&asAdvanced.reports[0].includes('advanced mode'),
  'Before the first turn the owner can switch the season to advanced mode on the same map, keeping the winning condition');
 check((await owner.call('admin/mode',{season:1,mode:'simple'})).status===200&&(await sam.call('campaign')).json.campaign.mode==='simple','The owner can switch back to simple mode before the first turn');
 const seatsNow=async who=>(await who.call('campaign')).json.campaign.seats,pass=turn=>({turn,revision:0,requestId:'seat-'+Math.random(),orders:[]});
 check(JSON.stringify(await seatsNow(sam))===JSON.stringify([{name:'Aurora Federation',computer:false},{name:'Ember Empire',computer:false}]),'Both clans of a campaign of people are shown as played by their players');
 check((await sam.call('admin/clan',{team:0,computer:true})).status===403&&(await owner.call('admin/clan',{team:5,computer:true})).status===409&&(await seatsNow(owner)).every(seat=>!seat.computer),'Only the owner can hand a clan to the computer, and only an existing clan');
 const handed=await owner.call('admin/clan',{team:1,computer:true}),refusedOrders=await sam.call('orders',pass(1),'PUT');
 check(handed.status===200&&handed.json.seats[1].computer&&(await seatsNow(sam))[1].computer&&refusedOrders.status===409&&refusedOrders.json.error.includes('played by the computer'),'While the owner has set a clan to the computer, its players are told and their orders are refused');
 check((await owner.call('admin/clan',{team:1,computer:false})).status===200&&!(await seatsNow(sam))[1].computer&&(await sam.call('orders',pass(1),'PUT')).status===200,'Handed back, the clan takes orders from its players again');
 assert.equal((await sam.call('messages',{id:'before-the-end',text:'Good game, see you next season.'})).status,200);

 // Decide the season by editing the throwaway save while the server is stopped: clan 0 holds 4 colonies and 10 collectors.
 await stop();
 const saved=JSON.parse(await readFile(save,'utf8'));
 saved.Stars.filter(star=>star.Owner===null).slice(0,3).forEach(star=>{star.Owner=0;star.Collectors=3;});
 saved.Winner=0;saved.Turn=8;saved.Ended=new Date().toISOString();
 await writeFile(save,JSON.stringify(saved));
 await start(accounts);

 browser=await chromium.launch({channel:'msedge'});
 const ownerPage=await page(await browser.newContext(),owner),samPage=await page(await browser.newContext(),sam);
 const ownerDialog=ownerPage.getByRole('dialog'),samDialog=samPage.getByRole('dialog');
 await ownerDialog.getByRole('heading',{name:'Victory',exact:true}).waitFor();
 const winnerRow=ownerDialog.getByRole('row',{name:/Aurora Federation/}),loserRow=ownerDialog.getByRole('row',{name:/Ember Empire/});
 check((await winnerRow.innerText()).replace(/\s+/g,' ').includes('Aurora Federation (you) 4 10')&&(await loserRow.innerText()).replace(/\s+/g,' ').includes('Ember Empire 1 1')&&await ownerDialog.getByText('Decided in 7 turns').count()===1,'The winner sees a victory screen with both clans\' final standings and the season length');
 await ownerPage.screenshot({path:resolve(folder,'victory.png')});
 await samDialog.getByRole('heading',{name:'Defeat',exact:true}).waitFor();
 check((await samDialog.getByText(/reached Type III first/).innerText()).includes('Aurora Federation')&&(await samDialog.getByRole('row',{name:/Ember Empire/}).innerText()).includes('(you)')&&await samDialog.getByRole('button',{name:/Start season/}).count()===0&&await samDialog.getByText(/campaign owner starts season 2/).count()===1,'The other clan sees the defeat screen with the same standings and no start control');
 await samPage.screenshot({path:resolve(folder,'defeat.png')});
 check((await owner.call('orders',{turn:8,revision:0,requestId:'after-the-end',orders:[]},'PUT')).status===409,'A decided season accepts no more orders');
 await ownerDialog.getByRole('button',{name:'View final map'}).click();await ownerDialog.waitFor({state:'detached'});
 check((await ownerPage.locator('.banner').innerText()).includes('Season 1 complete'),'Closing the victory screen leaves the final map with a results banner');
 await ownerPage.getByRole('button',{name:'Show results'}).click();await ownerDialog.getByRole('heading',{name:'Victory',exact:true}).waitFor();
 check(await ownerDialog.getByText('This is the first season.').count()===1,'The results can be reopened from the banner');

 const finalLinks=linkText((await owner.call('campaign')).json.campaign);
 await ownerDialog.getByRole('button',{name:/Start season 2/}).click();
 await ownerPage.getByText('Season 2 has begun on a new map.').waitFor();
 const second=(await owner.call('campaign')).json.campaign,secondSam=(await sam.call('campaign')).json.campaign;
 check(await ownerDialog.count()===0&&(await ownerPage.locator('.intro .eyebrow').innerText()).includes('SEASON 2 / TURN 001')&&await ownerPage.locator('.banner').count()===0,'Starting the next season returns the owner to a fresh command deck in season 2');
 check(second.season===2&&second.turn===1&&second.winner===null&&second.outcome===null&&homes(second).length===1&&homes(secondSam).length===1&&second.credits===60&&second.stars.filter(star=>star.owner!==null&&star.visible).length===1,'Season 2 starts both clans again from one homeworld');
 check(linkText(second)!==finalLinks&&linkText(second)!==classicLinks&&linkText(second)===linkText(secondSam),'Season 2 uses a different set of links, the same for both clans');
 check(second.victory.colonies===3&&second.victory.collectors===6&&second.victory.turnLimit===30&&(await ownerPage.locator('section:has(.victory)').first().innerText()).replace(/\s+/g,' ').includes('/ 3 required'),'Season 2 keeps the winning condition when the owner does not change it, and the command deck shows it');
 const orderKinds=(await ownerPage.locator('select:has(option[value="collector"])').first().locator('option').allTextContents()).join('|');
 check(second.mode==='simple'&&second.materials===null&&!orderKinds.includes('Fixed defense')&&!orderKinds.includes('mine')&&orderKinds.includes('Build collector'),'Season 2 keeps simple mode, and the command deck offers no defenses or mines');
 check(second.history.length===1&&second.history[0].season===1&&second.history[0].winner===0&&second.history[0].turns===7&&second.history[0].standings[0].colonies===4&&secondSam.history.length===1,'Season 1 is recorded in the history for both clans');
 check(secondSam.messages.length===1&&secondSam.messages[0].text.includes('see you next season')&&second.messages.length===0,'Clan channels carry over into the new season and stay private');
 check((await owner.call('admin/season',{season:1})).status===409&&(await owner.call('campaign')).json.campaign.season===2,'Repeating the start request does not skip a season');

 await samPage.reload();await samPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check(await samDialog.count()===0&&(await samPage.locator('.intro .eyebrow').innerText()).includes('SEASON 2'),'A player returning after the change lands in season 2 without an old victory screen');
 await samPage.getByRole('button',{name:'Season 2',exact:true}).click();
 const past=samDialog.locator('.seasonHistory li');
 check(await past.count()===1&&(await past.innerText()).includes('Season 1')&&(await past.innerText()).includes('Aurora Federation won')&&(await past.innerText()).includes('7 turns')&&await samDialog.getByRole('button',{name:/Start season/}).count()===0,'Any player can open the season record and see past results');
 check((await samDialog.getByText(/To win: 3 colonies and 6 collectors/).innerText()).includes('turn 30')&&await samDialog.getByLabel('Colonies to win').count()===0&&await samDialog.getByText('Rules: Simple mode').count()===1&&await samDialog.locator('.modeChoice').count()===0,'A player sees the mode and winning condition but cannot edit them');
 check((await samDialog.locator('.seatList').innerText()).includes('Ember Empire (you): played by its players')&&await samDialog.locator('.seats select').count()===0,'A player sees who plays each clan but cannot change it');
 await samDialog.getByRole('button',{name:'Close'}).click();

 await ownerPage.getByRole('button',{name:'Season 2',exact:true}).click();
 const seatPickers=ownerDialog.locator('.seatFields select');
 check(await seatPickers.count()===2&&await ownerDialog.getByLabel('Ember Empire').inputValue()==='players'&&await ownerDialog.getByLabel('Aurora Federation (you)').inputValue()==='players','The owner sees one control for each clan');
 await ownerDialog.getByLabel('Ember Empire').selectOption('computer');await ownerPage.getByText('Ember Empire is now played by the computer.').waitFor();
 await ownerPage.screenshot({path:resolve(folder,'who-plays.png')});
 await samPage.reload();await samPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check(await ownerDialog.getByLabel('Ember Empire').inputValue()==='computer'&&(await samPage.locator('.banner').innerText()).includes('Your clan is played by the computer'),'The owner hands a clan to the computer in the season dialog, and its players see a notice on their command deck');
 await ownerDialog.getByLabel('Ember Empire').selectOption('players');await ownerPage.getByText('Ember Empire is played by its players again.').waitFor();
 await samPage.reload();await samPage.getByRole('heading',{name:'The stars are within reach.'}).waitFor();
 check(await samPage.locator('.banner').count()===0&&(await seatsNow(sam)).every(seat=>!seat.computer),'Handing the clan back removes the notice');
 const startThird=ownerDialog.getByRole('button',{name:/Start season 3/});
 check(await startThird.isDisabled()&&await ownerDialog.getByText('This season is still being played.',{exact:false}).count()===1,'An undecided season cannot be replaced until ending it early is ticked');
 await ownerDialog.getByLabel('Colonies to win').fill('2');await ownerDialog.getByLabel('Collectors to win').fill('5');await ownerDialog.getByLabel(/Turn limit/).fill('0');
 await ownerDialog.getByRole('button',{name:'Use for season 2'}).click();await ownerPage.getByText('Winning condition saved for season 2.').waitFor();
 const edited=(await sam.call('campaign')).json.campaign.victory;
 check(edited.colonies===2&&edited.collectors===5&&edited.turnLimit===0,'The owner can change the winning condition from the season dialog before the first turn resolves');
 await ownerDialog.getByLabel('Colonies to win').fill('5');await ownerDialog.getByLabel('Collectors to win').fill('10');await ownerDialog.getByLabel(/Turn limit/).fill('21');
 await ownerDialog.locator('.modeChoice select').selectOption('advanced');
 await ownerPage.screenshot({path:resolve(folder,'winning-condition.png')});
 await ownerDialog.getByLabel(/End season 2 now, without a winner/).check();await startThird.click();
 await ownerPage.getByText('Season 3 has begun on a new map.').waitFor();
 const third=(await owner.call('campaign')).json.campaign;
 check(third.victory.colonies===5&&third.victory.collectors===10&&third.victory.turnLimit===21&&third.goal===10,'The owner chooses the winning condition for the next season when starting it');
 check(third.mode==='advanced'&&third.combatVersion===1&&third.logisticsVersion===1&&third.nextIncome===18&&(await ownerPage.locator('select:has(option[value="collector"])').first().locator('option').allTextContents()).join('|').includes('Fixed defense'),'The owner chooses advanced mode for the next season, and the command deck then offers advanced orders');
 check(third.season===3&&third.history.length===2&&third.history[1].winner===null&&third.history[1].season===2&&linkText(third)!==linkText(second),'Ending a season early records it without a winner and starts the next on another map');
 await ownerPage.getByRole('button',{name:'Season 3',exact:true}).click();
 check((await ownerDialog.locator('.seasonHistory li').first().innerText()).includes('Ended early, no winner'),'The record shows a season that was ended early');
 await ownerPage.screenshot({path:resolve(folder,'season-record.png')});
 await browser.close();browser=null;await stop();await start(accounts);
 const reopened=(await owner.call('campaign')).json.campaign;
 check(reopened.season===3&&reopened.history.length===2&&linkText(reopened)===linkText(third)&&reopened.victory.colonies===5&&reopened.victory.turnLimit===21&&reopened.mode==='advanced','The season, its map, its winning condition and the history survive a server restart');
 await stop();

 // Clan-key development servers: the fixed original map by default, and season control only for local test sessions.
 const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
 const keyed=async(path,body)=>{const res=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+keys[0],...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,json:await res.json().catch(()=>null)};};
 await start({Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:resolve(folder,'keys.json')});
 const plain=(await keyed('campaign')).json;
 check(linkText(plain.campaign)===classicLinks&&homes(plain.campaign)[0]===0&&plain.seasonControl===false&&(await keyed('admin/season',{season:1,endEarly:true})).status===404,'Local development still starts on the original fixed map, and a normal clan-key session cannot start a season');
 await stop();
 await start({Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:resolve(folder,'keys-local.json'),LocalTest:'true',MapSeed:'77'});
 const local=(await keyed('campaign')).json;
 check(linkText(local.campaign)!==classicLinks&&local.seasonControl===true,'MapSeed selects a seeded map, and a local test session is offered season control');
 const next=await keyed('admin/season',{season:1,endEarly:true,mapSeed:78});
 check(next.status===200&&next.json.season===2&&(await keyed('campaign')).json.campaign.history.length===1,'A local test session can start the next season with clan keys');
 await stop();
 console.log(`${count} season API/browser checks passed; files in ${folder}`);
}finally{if(browser)await browser.close();await stop();}
