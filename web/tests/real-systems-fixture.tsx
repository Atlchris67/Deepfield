import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RealSystemsDialog} from '../src/RealSystemsDialog';
import {PlanetDialog} from '../src/PlanetDialog';
import snapshot from '../src/realSystems.json';
import type {CatalogSystem} from '../src/StarMapSetupDialog';
import type {Star} from '../src/fleetSelection';
import type {Intel} from '../src/IntelligencePanel';
const recentReport:Intel={id:'observed-enemy',star:1,turn:2,at:'2026-10-20T12:00:00Z',phase:'arrival / before combat',mission:'distant',returned:true,enemyPresent:true,ownerObserved:true,owner:1,fleetBand:null,enemyShips:null,enemyScouts:null,collectors:null,defense:null,enemyComposition:null};
const reports:Intel[]=[recentReport,{...recentReport,id:'material-survey',turn:1,at:'2026-10-19T12:00:00Z',mission:'deep',enemyShips:0,enemyScouts:0,materialSurvey:[1,0,0,0,0,0]}];

const catalog:CatalogSystem[]=[snapshot.systems[0],snapshot.systems.at(-1)!].map((host,id)=>({...host,id,planets:id===0?host.planets.map((planet,planetId)=>({...planet,id:planetId})):[]}));
const links=[{from:0,to:1}];
const stars:Star[]=catalog.map((host,id)=>({id,name:host.name,x:id*10,y:0,known:id===0,visible:id===0,owner:id===0?0:null,collectors:id===0?2:null,ships:id===0?[4,0]:null,scouts:id===0?[1,0]:null,defense:id===0?0:null,fleets:id===0?[[4,0,0,0,0],[0,0,0,0,0]]:null,materialYield:id===0?[2,0,0,0,0,0]:null,
 statistics:id===0?{knowledge:'current',turn:1,at:null,phase:null,mission:null,ownerObserved:true,owner:0,enemyPresent:false,fleetBand:null,collectors:2,defense:0,colonyIncome:18,fleets:[{team:0,combatShips:4,scouts:1,composition:[4,0,0,0,0],totalShips:5}]}:{knowledge:'unknown',turn:null,at:null,phase:null,mission:null,ownerObserved:false,owner:null,enemyPresent:null,fleetBand:null,collectors:null,defense:null,colonyIncome:null,fleets:[]}}));

function Fixture(){
 const [mode,setMode]=useState<'campaign'|'historical'|'confirmed-zero'|'reference'|null>(null),[primary,setPrimary]=useState(false),[selected,setSelected]=useState(-1),[statsId,setStatsId]=useState<number|null>(null),[viewStars,setViewStars]=useState(stars);
 const hasCampaign=mode==='campaign'||mode==='historical'||mode==='confirmed-zero';
 const historical=mode==='historical'||mode==='confirmed-zero';
 const confirmedZero=mode==='confirmed-zero';
 const atlasStars:Star[]=historical?viewStars.map(star=>star.id!==1?star:{...star,known:true,statistics:{...star.statistics!,knowledge:'historical',turn:confirmedZero?1:2,at:confirmedZero?reports[1].at:recentReport.at,phase:recentReport.phase,mission:confirmedZero?'deep':'distant',ownerObserved:true,owner:1,enemyPresent:!confirmedZero,fleets:[{team:1,combatShips:confirmedZero?0:null,scouts:confirmedZero?0:null,totalShips:confirmedZero?0:null,composition:null}]}}):viewStars;
 return <><button onClick={()=>setMode('campaign')}>Open campaign atlas</button><button onClick={()=>setMode('historical')}>Open atlas with historical intelligence</button><button onClick={()=>setMode('confirmed-zero')}>Open atlas with confirmed zero ships</button><button onClick={()=>setMode('reference')}>Open reference atlas</button><button onClick={()=>setPrimary(true)}>Show primary real sky</button><button onClick={()=>setViewStars(current=>[...current])}>Refresh campaign view</button><output data-testid="selected-system">{selected}</output>
  {mode&&<RealSystemsDialog onClose={()=>setMode(null)} catalog={hasCampaign?catalog:null} stars={hasCampaign?atlasStars:undefined} links={hasCampaign?links:null} intelligence={historical?confirmedZero?[reports[1]]:reports:undefined} team={0} onSelect={setSelected} onOpenStatistics={hasCampaign?setStatsId:undefined}/>}
  {primary&&<section role="region" aria-label="Real star and planet atlas"><RealSystemsDialog embedded onClose={()=>setPrimary(false)} catalog={catalog} stars={viewStars} links={links} team={0} onSelect={setSelected} onOpenStatistics={setStatsId}/></section>}
  {statsId!==null&&<PlanetDialog star={atlasStars[statsId]} turn={3} typed intelligence={historical?confirmedZero?[reports[1]]:reports:undefined} onClose={()=>setStatsId(null)}/>}
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
