// Synthetic component fixture only: no API, game engine, keys or persisted campaign.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ExpeditionDialog} from '../src/ExpeditionDialog';
import {type Order,type Star} from '../src/fleetSelection';
import '../src/style.css';
const stars:Star[]=[0,1].map(id=>({id,name:id?'Lumen':'Hearth',x:0,y:0,known:true,visible:true,owner:0,collectors:0,ships:[id?2:8,0],scouts:[0,0],defense:0,fleets:[[id?2:8,0,0,0,0],[0,0,0,0,0]]}));
function Fixture(){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<Order[]>([]),[pending,setPending]=useState<(()=>void)|null>(null),[calls,setCalls]=useState(0);
 return <main><button onClick={()=>setOpen(true)}>Open selector</button><button onClick={()=>setDraft(Array.from({length:24},()=>({kind:'collector',source:0,target:0,ships:0})))}>Fill order slots</button>
 <button onClick={()=>pending?.()}>Complete pending read</button><div data-testid="calls">{calls}</div><div data-testid="orders">{draft.length}</div>
 {open&&<ExpeditionDialog stars={stars} team={0} typed={true} draft={draft} initialSource={0} initialTarget={1} onClose={()=>setOpen(false)} onAdd={async(orders,signal)=>{
  setCalls(n=>n+1);await new Promise<void>(resolve=>setPending(()=>resolve));if(!signal.aborted)setDraft(current=>[...current,...orders]);
 }}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
