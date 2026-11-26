import {useEffect,useRef,useState} from 'react';
import {hulls,type Star} from './fleetSelection';
import {materialNames} from './MaterialPanel';
import {latestMaterialSurvey,type Intel} from './IntelligencePanel';

export type PlanetStats={knowledge:'current'|'historical'|'charted'|'unknown';turn:number|null;at:string|null;phase:string|null;mission:string|null;ownerObserved:boolean;owner:number|null;enemyPresent:boolean|null;fleetBand:string|null;collectors:number|null;defense:number|null;colonyIncome:number|null;fleets:{team:number;combatShips:number|null;scouts:number|null;composition:number[]|null;totalShips:number|null}[];materialSurvey?:number[]|null};
const clan=(team:number)=>team===0?'Aurora Federation':'Ember Empire';
const count=(value:number|null|undefined)=>value??'Unknown';
const tabs=['stats','ships','defenses'] as const;
type DossierTab=(typeof tabs)[number];

export function PlanetDialog({star,turn,typed,intelligence,onClose}:{star:Star;turn:number;typed:boolean;intelligence?:readonly Intel[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null),backdropDown=useRef(false);
 const tabButtons=useRef<Record<DossierTab,HTMLButtonElement|null>>({stats:null,ships:null,defenses:null});
 const [activeTab,setActiveTab]=useState<DossierTab>('stats');
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const element=dialog.current!;const overflow=document.body.style.overflow;
  element.showModal();closeButton.current?.focus();document.body.style.overflow='hidden';
  return ()=>{element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[]);
 const stats=star.statistics,current=stats?.knowledge==='current',historical=stats?.knowledge==='historical';
 const observedFleet=historical?stats.fleets[0]:undefined;
 const hasFleetEstimate=observedFleet?.combatShips!=null||stats?.fleetBand!=null;
 const needsDeepRecon=!current&&(observedFleet?.combatShips==null||observedFleet.scouts==null);
 const surveyReport=latestMaterialSurvey(intelligence,star.id);
 const survey=surveyReport?.materialSurvey??stats?.materialSurvey;
 const surveyTurn=surveyReport?.turn??(survey?stats?.turn:null);
 const surveyedSites=materialNames.flatMap((name,index)=>{const count=survey?.[index]??0;return count>0?[name+': '+count+' planet'+(count===1?'':'s')]:[];}).join(', ');
 const outside=(event:React.PointerEvent<HTMLDialogElement>)=>{const r=event.currentTarget.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
 const selectWithKeyboard=(event:React.KeyboardEvent<HTMLButtonElement>,tab:DossierTab)=>{
  const index=tabs.indexOf(tab);let next:DossierTab|undefined;
  if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];
  else if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];
  else if(event.key==='Home')next=tabs[0];
  else if(event.key==='End')next=tabs[tabs.length-1];
  if(next){event.preventDefault();setActiveTab(next);tabButtons.current[next]?.focus();}
 };
 return <dialog ref={dialog} className="planetDialog" aria-labelledby="planet-title" aria-describedby="planet-knowledge" onCancel={event=>{event.preventDefault();onClose();}} onPointerDown={event=>{backdropDown.current=outside(event);}} onPointerUp={event=>{if(backdropDown.current&&outside(event))onClose();backdropDown.current=false;}}>
  <div className="planetHeader"><div><small>PLANET / SYSTEM DOSSIER</small><h2 id="planet-title">{star.name}</h2></div><button ref={closeButton} className="quiet" onClick={onClose} aria-label="Close planet statistics">Close</button></div>
  <div className="planetScroll">
   <p id="planet-knowledge" className="planetKnowledge">{current?`Current observation at last refresh · Turn ${stats.turn}`:historical?`Last-known observation · Turn ${stats.turn} · ${Math.max(0,turn-(stats.turn??turn))} turn(s) ago · May be stale`:star.known?'Charted only · No survey measurements':'Uncharted · Unknown statistics'}</p>
   {historical&&<p>{stats.mission} report · {stats.phase} · <time dateTime={stats.at??undefined}>{stats.at?new Date(stats.at).toLocaleString(): 'Unknown observation time'}</time>. This is one dated snapshot, not live state. Older reports remain in Clan intelligence.</p>}
   <div className="planetTabs" role="tablist" aria-label="Planet dossier sections">{tabs.map(tab=><button key={tab} ref={element=>{tabButtons.current[tab]=element;}} type="button" role="tab" id={`planet-tab-${tab}`} aria-controls={`planet-panel-${tab}`} aria-selected={activeTab===tab} tabIndex={activeTab===tab?0:-1} onClick={()=>setActiveTab(tab)} onKeyDown={event=>selectWithKeyboard(event,tab)}>{tab==='stats'?'Stats':tab==='ships'?'Ships':'Defenses'}</button>)}</div>
   <section id="planet-panel-stats" role="tabpanel" aria-labelledby="planet-tab-stats" hidden={activeTab!=='stats'}>
   <p>Each map system currently represents one colony site. Population simulation is not implemented. Fictional material yields appear only for your own observed systems.</p>
   <dl className="planetFacts">
    <div><dt>Ownership</dt><dd>{stats?.ownerObserved?(stats.owner===null?'Unclaimed':clan(stats.owner)):'Unknown'}</dd></div>
    <div><dt>Material resources</dt><dd>{star.materialYield?materialNames.map((name,index)=>star.materialYield![index]>0?`${name} ${star.materialYield![index]} / turn`:null).filter(Boolean).join(', ')||'No output':'Not measured'}</dd></div>
    <div><dt>Deep material survey</dt><dd>{survey?<>{surveyedSites||"No cataloged material sites"}{surveyTurn!=null&&<> (observed turn {surveyTurn})</>}</>:"Unknown"}</dd></div>
    <div><dt>Inhabitants / population</dt><dd>Not measured</dd></div>
    <div><dt>Collectors</dt><dd>{count(stats?.collectors)}</dd></div>
    <div><dt>Colony income</dt><dd>{stats?.colonyIncome!=null?`${stats.colonyIncome} credits / turn`:'Unknown'}</dd></div>
   </dl>
   <p>Income is shown only for your currently observed colonies, before queued construction. Unknown values are not zero.</p>
   </section>
   <section id="planet-panel-ships" role="tabpanel" aria-labelledby="planet-tab-ships" hidden={activeTab!=='ships'}>
   {historical&&<p>Enemy contact: {stats.enemyPresent===true?'Detected':stats.enemyPresent===false?'None detected at observation':'Unconfirmed'}.{stats.fleetBand!=null&&` Estimated enemy combat fleet: ${stats.fleetBand} ships.`}</p>}
   {historical&&hasFleetEstimate&&stats.turn!=null&&<p className="realDataNote">Fleet observation: turn {stats.turn}. Not a live count.</p>}
   {observedFleet?.totalShips===0&&<p>No enemy ships were observed on this report.</p>}
   {needsDeepRecon&&<p>{hasFleetEstimate?"Full fleet count is unknown.":"Enemy fleet count is unknown."} A returning deep scout can report exact ship and scout counts from a charted system one jump from your colony.</p>}
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
   </section>
   <section id="planet-panel-defenses" role="tabpanel" aria-labelledby="planet-tab-defenses" hidden={activeTab!=='defenses'}>
    <h3>System defenses</h3>
    <dl className="planetFacts"><div><dt>Fixed defense strength</dt><dd>{count(stats?.defense)}</dd></div></dl>
    <p>Defense strength reflects the last observation available to your clan. Unknown values are not zero.</p>
   </section>
  </div>
 </dialog>;
}
