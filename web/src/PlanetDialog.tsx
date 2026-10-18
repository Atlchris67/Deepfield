import {useEffect,useRef} from 'react';
import {hulls,type Star} from './fleetSelection';

export type PlanetStats={knowledge:'current'|'historical'|'charted'|'unknown';turn:number|null;at:string|null;phase:string|null;mission:string|null;ownerObserved:boolean;owner:number|null;enemyPresent:boolean|null;fleetBand:string|null;collectors:number|null;defense:number|null;colonyIncome:number|null;fleets:{team:number;combatShips:number|null;scouts:number|null;composition:number[]|null;totalShips:number|null}[]};
const clan=(team:number)=>team===0?'Aurora Federation':'Ember Empire';
const count=(value:number|null|undefined)=>value??'Unknown';

export function PlanetDialog({star,turn,typed,onClose}:{star:Star;turn:number;typed:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null),backdropDown=useRef(false);
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const element=dialog.current!;const overflow=document.body.style.overflow;
  element.showModal();closeButton.current?.focus();document.body.style.overflow='hidden';
  return ()=>{element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[]);
 const stats=star.statistics,current=stats?.knowledge==='current',historical=stats?.knowledge==='historical';
 const outside=(event:React.PointerEvent<HTMLDialogElement>)=>{const r=event.currentTarget.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
 return <dialog ref={dialog} className="planetDialog" aria-labelledby="planet-title" aria-describedby="planet-knowledge" onCancel={event=>{event.preventDefault();onClose();}} onPointerDown={event=>{backdropDown.current=outside(event);}} onPointerUp={event=>{if(backdropDown.current&&outside(event))onClose();backdropDown.current=false;}}>
  <div className="planetHeader"><div><small>PLANET / SYSTEM DOSSIER</small><h2 id="planet-title">{star.name}</h2></div><button ref={closeButton} className="quiet" onClick={onClose} aria-label="Close planet statistics">Close</button></div>
  <div className="planetScroll">
   <p id="planet-knowledge" className="planetKnowledge">{current?`Current observation at last refresh · Turn ${stats.turn}`:historical?`Last-known observation · Turn ${stats.turn} · ${Math.max(0,turn-(stats.turn??turn))} turn(s) ago · May be stale`:star.known?'Charted only · No survey measurements':'Uncharted · Unknown statistics'}</p>
   {historical&&<p>{stats.mission} report · {stats.phase} · <time dateTime={stats.at??undefined}>{stats.at?new Date(stats.at).toLocaleString(): 'Unknown observation time'}</time>. This is one dated snapshot, not live state. Older reports remain in Clan intelligence.</p>}
   <p>Each map system currently represents one colony site. Mineral surveys and population simulation are not implemented.</p>
   <dl className="planetFacts">
    <div><dt>Ownership</dt><dd>{stats?.ownerObserved?(stats.owner===null?'Unclaimed':clan(stats.owner)):'Unknown'}</dd></div>
    <div><dt>Material resources</dt><dd>Not measured</dd></div>
    <div><dt>Inhabitants / population</dt><dd>Not measured</dd></div>
    <div><dt>Collectors</dt><dd>{count(stats?.collectors)}</dd></div>
    <div><dt>Fixed defense strength</dt><dd>{count(stats?.defense)}</dd></div>
    <div><dt>Colony income</dt><dd>{stats?.colonyIncome!=null?`${stats.colonyIncome} credits / turn`:'Unknown'}</dd></div>
   </dl>
   <p>Income is shown only for your currently observed colonies, before queued construction. Unknown values are not zero.</p>
   {historical&&<p>Enemy contact: {stats.enemyPresent===true?'Detected':stats.enemyPresent===false?'None detected at observation':'Unconfirmed'}.{stats.fleetBand!=null&&` Estimated enemy combat fleet: ${stats.fleetBand} ships.`}</p>}
   <h3>Ship breakdown</h3>
   {(!stats||stats.fleets.length===0)?<p>No ship measurements available.</p>:stats.fleets.map(fleet=><section className="planetFleet" key={fleet.team} aria-label={`${clan(fleet.team)} ships`}>
    <h4>{clan(fleet.team)}{historical?' · observed enemy fleet':''}</h4>
    <dl className="planetFacts">
     <div><dt>Combat ships</dt><dd>{count(fleet.combatShips)}</dd></div>
     <div><dt>Scouts</dt><dd>{count(fleet.scouts)}</dd></div>
     <div><dt>Total ships including scouts</dt><dd>{count(fleet.totalShips)}</dd></div>
    </dl>
    {typed?<ul>{hulls.map((h,index)=><li key={h.id}>{h.label}: <strong>{count(fleet.composition?.[index])}</strong></li>)}</ul>:<p>Classic campaign: combat ships use one generic class.</p>}
   </section>)}
  </div>
 </dialog>;
}
