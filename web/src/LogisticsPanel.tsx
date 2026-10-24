import {useState} from 'react';
import {linked,type Order,type Star} from './fleetSelection';

const names=['Ferrite','Vardite','Ceryth','Neralite','Soryl','Avenite'];

export function LogisticsPanel({star,stars,links,team,closed,onAdd}:{star:Star;stars:Star[];links?:{from:number;to:number}[]|null;team:number;closed:boolean;onAdd:(order:Order)=>void}){
 const [target,setTarget]=useState(-1),[ships,setShips]=useState(1),[cargo,setCargo]=useState([0,0,0,0,0,0]);
 const owned=star.owner===team,neighbors=stars.filter(other=>other.owner===team&&linked(star.id,other.id,links));
 const load=cargo.reduce((sum,amount)=>sum+amount,0),capacity=ships*10;
 return <section className="panel" aria-label="Local freight and gates"><div className="panelTitle"><h2>Freight and gates</h2><span>LOCAL LOGISTICS</span></div>
  <p>Freighters carry up to 10 material units each along one game link per turn. Two owned systems share stock only after both ends have operational gates.</p>
  <p>Selected system: {star.name}. {owned?`${star.freighters??0} freighters; gate ${star.gate?'operational':'not built'}.`:'Select your colony to prepare logistics.'}</p>
  <div className="starMapActions"><button type="button" disabled={closed||!owned} onClick={()=>onAdd({kind:'freighter',source:star.id,target:-1,ships:1})}>Build freighter — 10 credits</button><button type="button" disabled={closed||!owned||star.gate===true} onClick={()=>onAdd({kind:'gate',source:star.id,target:-1,ships:1})}>Build gate — 30 credits</button></div>
  <label>Transport destination<select value={target} onChange={event=>setTarget(Number(event.target.value))}><option value={-1}>Select linked owned system</option>{neighbors.map(other=><option key={other.id} value={other.id}>{other.name}</option>)}</select></label>
  <label>Freighters<input type="number" min="1" max="10" value={ships} onChange={event=>setShips(Number(event.target.value))}/></label>
  <div className="starMapFields">{names.map((name,index)=><label key={name}>{name}<input type="number" min="0" max="10000" value={cargo[index]} onChange={event=>{const next=[...cargo];next[index]=Number(event.target.value);setCargo(next);}}/></label>)}</div>
  <p role="status">Cargo {load} / {capacity} units. Transported stock arrives after combat and is available for orders next turn.</p>
  <button type="button" disabled={closed||!owned||target<0||!Number.isInteger(ships)||ships<1||ships>10||ships>(star.freighters??0)||load<1||load>capacity||cargo.some(amount=>!Number.isInteger(amount)||amount<0)} onClick={()=>onAdd({kind:'transport',source:star.id,target,ships,cargo:[...cargo]})}>Add transport order</button>
 </section>;
}
