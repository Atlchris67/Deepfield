// Synthetic generator response only. No campaign save or team credentials.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StarMapSetupDialog,type GeneratedStarMap,type StarMapPreviewRequest} from '../src/StarMapSetupDialog';
import '../src/style.css';

function generated(request:StarMapPreviewRequest):GeneratedStarMap{
 if(request.systemCount>50)throw new Error('Fixture rejects maps above 50 systems.');
 const systems=Array.from({length:request.systemCount},(_,id)=>({id,name:id===0?'Hearth':`Deepfield ${String(id+1).padStart(3,'0')}`,x:(id*137)%request.width,y:(id*83)%request.height}));
 return {generatorVersion:1,seed:request.seed,settings:request,systems,links:systems.slice(1).map(system=>({from:system.id-1,to:system.id})),homeworlds:Array.from({length:request.playerCount},(_,playerSlot)=>({playerSlot,systemId:playerSlot}))};
}
function Fixture(){
 const [open,setOpen]=useState(false);
 return <main><button onClick={()=>setOpen(true)}>Open star map setup</button>{open&&<StarMapSetupDialog onClose={()=>setOpen(false)} onGenerate={async(request,signal)=>{await new Promise(resolve=>setTimeout(resolve,10));if(signal.aborted)throw new DOMException('Aborted','AbortError');return generated(request);}}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
