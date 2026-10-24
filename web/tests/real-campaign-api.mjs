import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'../..');
await mkdir(resolve(root,'test-results'),{recursive:true});
const fixture=await mkdtemp(resolve(root,'test-results','real-api-'));
const keys=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));
const port=probe.address().port;await new Promise(done=>probe.close(done));
const base=`http://127.0.0.1:${port}`;
const dll=resolve(process.env.DEEPFIELD_TEST_API_DLL??resolve(root,'src','Deepfield.Api','bin','Debug','net10.0','Deepfield.Api.dll'));
let child,logs='',checks=0;
const check=(condition,name)=>{assert.ok(condition,name);checks++;console.log('PASS '+name);};
async function api(path,{body,method='GET',campaign}={}){
 return fetch(`${base}/api/${path}`,{method,headers:{Authorization:`Bearer ${keys[0]}`,...(body?{'Content-Type':'application/json'}:{}),...(campaign?{'X-Deepfield-Campaign':campaign}:{})},body:body?JSON.stringify(body):undefined});
}
try{
 child=spawn('dotnet',[dll],{cwd:resolve(root,'src','Deepfield.Api'),windowsHide:true,env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:base,Teams__0__Key:keys[0],Teams__1__Key:keys[1],SavePath:resolve(fixture,'original.json'),LocalTest:'true',EmpireAi:'false'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 let ready=false;for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw Error('API exited: '+logs);try{if((await fetch(`${base}/health`)).ok){ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,100));}
 if(!ready)throw Error('API did not start: '+logs);
 check((await fetch(`${base}/api/campaign`)).status===401,'Unauthenticated views are denied');
 const original=(await (await api('campaign')).json()).campaign;
 check(original.realCatalogVersion===1&&original.stars.length===24,'Fresh Development game uses 24 cataloged real star systems');
 check(original.stars[0].name==='Proxima Cen'&&original.name==='Aurora Federation','Astronomy names and clan names remain independent');
 const request={seed:0,systemCount:24,width:1000,height:700,minimumSeparation:1,nearestNeighborLinks:2,playerCount:2,real:true};
 check((await api('local/star-map/preview',{method:'POST',body:{...request,real:false}})).status===409,'Fictional previews are unavailable for new campaigns');
 const preview=(await (await api('local/star-map/preview',{method:'POST',body:request})).json());
 check(preview.realCatalogVersion===1&&preview.realSystems[0].planets.some(planet=>planet.name==='Proxima Cen b'),'Preview contains real stars and catalog planets');
 const id=randomUUID().replaceAll('-','');
 check((await fetch(`${base}/api/local/campaigns`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,generatorVersion:1,preview:request})})).status===401,'Unauthenticated starts are denied');
 check((await api('local/campaigns',{method:'POST',body:{id:randomUUID().replaceAll('-',''),generatorVersion:1,preview:{...request,real:false}}})).status===409,'Fictional starts are unavailable for new campaigns');
 const started=await api('local/campaigns',{method:'POST',body:{id,generatorVersion:preview.generatorVersion,preview:request}});
 const result=await started.json();
 check(started.status===200&&result.campaign.realCatalogVersion===1&&result.campaign.stars.length===24,'Separate real campaign starts successfully');
 check(result.campaign.stars[0].name==='Proxima Cen'&&result.campaign.name==='Aurora Federation','New campaign retains catalog and clan identities');
 check(!('generatedMap' in result.campaign)&&result.campaign.realSystems.some(host=>host.planets.length===0),'Clan view hides saved map and unscouted planets');
 const saved=JSON.parse(await readFile(resolve(fixture,'generated-campaigns',`${id}.json`),'utf8'));
 check(saved.GeneratedMap.RealCatalogVersion===1&&saved.GeneratedMap.RealSystems[0].Planets[0].Name==='Proxima Cen b','Saved campaign pins real system and planet identities');
 check((await api('local/campaigns',{method:'POST',body:{id,generatorVersion:preview.generatorVersion,preview:request}})).status===200,'Repeated campaign ID is idempotent');
 check((await api('local/campaigns',{method:'POST',body:{id:randomUUID().replaceAll('-',''),generatorVersion:2,preview:request}})).status===409,'Stale generator version is rejected');
 const after=(await (await api('campaign')).json()).campaign;
 check(JSON.stringify(after)===JSON.stringify(original),'Starting a separate campaign preserves the original game');
 console.log(`${checks} real campaign API checks passed.`);
}finally{if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
