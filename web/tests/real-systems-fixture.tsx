import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RealSystemsDialog} from '../src/RealSystemsDialog';
import {PlanetDialog} from '../src/PlanetDialog';
import snapshot from '../src/realSystems.json';
import type {CatalogSystem} from '../src/StarMapSetupDialog';
import type {Star} from '../src/fleetSelection';

const catalog:CatalogSystem[]=[snapshot.systems[0],snapshot.systems.at(-1)!].map((host,id)=>({...host,id,planets:id===0?host.planets.map((planet,planetId)=>({...planet,id:planetId})):[]}));
const links=[{from:0,to:1}];
const stars:Star[]=catalog.map((host,id)=>({id,name:host.name,x:id*10,y:0,known:id===0,visible:id===0,owner:id===0?0:null,collectors:id===0?2:null,ships:id===0?[4,0]:null,scouts:id===0?[1,0]:null,defense:id===0?0:null,fleets:id===0?[[4,0,0,0,0],[0,0,0,0,0]]:null,materialYield:id===0?[2,0,0,0,0,0]:null,
 statistics:id===0?{knowledge:'current',turn:1,at:null,phase:null,mission:null,ownerObserved:true,owner:0,enemyPresent:false,fleetBand:null,collectors:2,defense:0,colonyIncome:18,fleets:[{team:0,combatShips:4,scouts:1,composition:[4,0,0,0,0],totalShips:5}]}:{knowledge:'unknown',turn:null,at:null,phase:null,mission:null,ownerObserved:false,owner:null,enemyPresent:null,fleetBand:null,collectors:null,defense:null,colonyIncome:null,fleets:[]}}));

function Fixture(){
 const [mode,setMode]=useState<'campaign'|'reference'|null>(null),[primary,setPrimary]=useState(false),[selected,setSelected]=useState(-1),[statsId,setStatsId]=useState<number|null>(null),[viewStars,setViewStars]=useState(stars);
 return <><button onClick={()=>setMode('campaign')}>Open campaign atlas</button><button onClick={()=>setMode('reference')}>Open reference atlas</button><button onClick={()=>setPrimary(true)}>Show primary real sky</button><button onClick={()=>setViewStars(current=>[...current])}>Refresh campaign view</button><output data-testid="selected-system">{selected}</output>
  {mode&&<RealSystemsDialog onClose={()=>setMode(null)} catalog={mode==='campaign'?catalog:null} stars={mode==='campaign'?viewStars:undefined} links={mode==='campaign'?links:null} team={0} onSelect={setSelected} onOpenStatistics={mode==='campaign'?setStatsId:undefined}/>}
  {primary&&<section role="region" aria-label="Real star and planet atlas"><RealSystemsDialog embedded onClose={()=>setPrimary(false)} catalog={catalog} stars={viewStars} links={links} team={0} onSelect={setSelected} onOpenStatistics={setStatsId}/></section>}
  {statsId!==null&&<PlanetDialog star={stars[statsId]} turn={1} typed onClose={()=>setStatsId(null)}/>}
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
