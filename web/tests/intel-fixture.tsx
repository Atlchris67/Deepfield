// Synthetic historical reports only. No API, engine, keys or campaign save.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IntelligencePanel,type Intel} from '../src/IntelligencePanel';
import '../src/style.css';
const basis:Intel={id:'battle',star:1,turn:3,at:'2026-01-01T12:00:00Z',phase:'before combat',mission:'battle',returned:true,enemyPresent:true,ownerObserved:true,owner:1,fleetBand:null,enemyShips:4,enemyScouts:null,collectors:null,defense:null,enemyComposition:[0,0,0,4,0]};
const reports:Intel[]=[basis,{...basis,id:'deep',mission:'deep',enemyShips:0,enemyScouts:0,collectors:0,defense:0,enemyPresent:false,owner:null,enemyComposition:[0,0,0,0,0]},
 {...basis,id:'limited',mission:'close',returned:false,enemyShips:null,enemyScouts:null,collectors:null,enemyComposition:null,ownerObserved:false,enemyPresent:null}];
function Fixture(){const [active,setActive]=useState(true);return <main><button onClick={()=>setActive(false)}>Switch to empty clan</button><IntelligencePanel reports={active?reports:[]} turn={5} stars={[{id:1,name:'Lumen',visible:false}]}/></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
