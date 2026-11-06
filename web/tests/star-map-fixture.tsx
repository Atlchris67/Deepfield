// Synthetic generator response only. No campaign save or team credentials.
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StarMapSetupDialog,type GeneratedStarMap,type StarMapPreviewRequest} from '../src/StarMapSetupDialog';
import snapshot from '../src/realSystems.json';
import '../src/style.css';

function generated(request:StarMapPreviewRequest):GeneratedStarMap{
 if(!request.real)throw new Error('Fixture requires real catalog mode.');
 const realSystems=snapshot.systems.map((host,id)=>({...host,id,planets:host.planets.map((planet,planetId)=>({...planet,id:planetId}))}));
 const systems=realSystems.map(host=>({id:host.id,name:host.name,x:Math.round(host.raDeg/360*900+50),y:Math.round((1-(host.decDeg+90)/180)*600+50)}));
 return {generatorVersion:1,seed:0,settings:{systemCount:systems.length,width:1000,height:700,minimumSeparation:1,nearestNeighborLinks:2,playerCount:2},systems,links:systems.slice(1).map(system=>({from:system.id-1,to:system.id})),homeworlds:[{playerSlot:0,systemId:0,planetId:0},{playerSlot:1,systemId:systems.length-1,planetId:0}],realCatalogVersion:1,realSystems};
}
function Fixture(){
 const [open,setOpen]=useState(false);
 const attempts=useRef<string[]>([]),[status,setStatus]=useState('No campaign started');
 return <main><button onClick={()=>setOpen(true)}>Open star map setup</button><output data-testid="start-status">{status}</output><output data-testid="start-attempts">{attempts.current.join(',')}</output>{open&&<StarMapSetupDialog onClose={()=>setOpen(false)} onGenerate={async(request,signal)=>{await new Promise(resolve=>setTimeout(resolve,10));if(signal.aborted)throw new DOMException('Aborted','AbortError');return generated(request);}} onStart={async(map,id)=>{attempts.current.push(id);setStatus('Starting attempt '+attempts.current.length);await new Promise(resolve=>setTimeout(resolve,50));if(attempts.current.length===1)throw new Error('Fixture start failed. Retry safely.');setStatus('Started real catalog '+map.realCatalogVersion);setOpen(false);}}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
