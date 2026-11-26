import {useEffect,useId,useRef,useState} from 'react';
import {available,availableScouts,linked,type Order,type Star,type StarLink} from './fleetSelection';
import {latestHabitabilitySurvey,latestMaterialSurvey,type Intel} from './IntelligencePanel';
import {materialNames} from './MaterialPanel';
import {HabitabilityBreakdown} from './HabitabilityBreakdown';
import './colonization-planner.css';

type PlannerProps={stars:Star[];links?:StarLink[]|null;team:number;turn:number;typed:boolean;draft:Order[];intelligence:Intel[];initialSource:number;locked:boolean;shortlist:number[];setShortlist:(ids:number[])=>void;onClose:()=>void;onScout:(source:number,target:number)=>void;onExpedition:(source:number,target:number)=>void};
type Sort='travel'|'name'|'survey'|'habitability';
const clan=(owner:number|null,team:number)=>owner==null?'Unclaimed':owner===team?'Your clan':'Other clan';

function chartedTravel(origin:number,stars:Star[],links?:StarLink[]|null){
 const charted=stars.filter(star=>star.known),distances=new Map<number,number>([[origin,0]]);
 const frontier=[origin];
 for(let i=0;i<frontier.length;i++){
  const source=frontier[i],next=(distances.get(source)??0)+1;
  for(const target of charted)if(!distances.has(target.id)&&linked(source,target.id,links)){
   distances.set(target.id,next);frontier.push(target.id);
  }
 }
 return distances;
}

export function ColonizationPlanner({stars,links,team,turn,typed,draft,intelligence,initialSource,locked,shortlist,setShortlist,onClose,onScout,onExpedition}:PlannerProps){
 const dialog=useRef<HTMLDialogElement>(null),title=useId();
 const origins=stars.filter(star=>star.visible&&star.owner===team);
 const [source,setSource]=useState(origins.some(star=>star.id===initialSource)?initialSource:origins[0]?.id??-1);
 const [sort,setSort]=useState<Sort>('travel'),[onlyShortlisted,setOnlyShortlisted]=useState(false);
 const origin=origins.find(star=>star.id===source)??origins[0];
 const distances=origin?chartedTravel(origin.id,stars,links):new Map<number,number>();
 const moving=origin?Array.from({length:typed?5:1},(_,index)=>available(origin,team,typed,index,draft)).some(count=>count>0):false;
 const scouts=origin?availableScouts(origin,team,draft):0;
 useEffect(()=>{
  const node=dialog.current!,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  node.showModal();
  return()=>{node.close();if(opener?.isConnected)opener.focus();};
 },[]);
 const rows=stars.filter(star=>star.known&&star.id!==origin?.id&&(!onlyShortlisted||shortlist.includes(star.id))).map(star=>{
  const latest=latestMaterialSurvey(intelligence,star.id),stats=star.statistics;
  const survey=latest?.materialSurvey??stats?.materialSurvey,surveyTurn=latest?.turn??(survey?stats?.turn:null);
  const minerals=materialNames.flatMap((name,index)=>{const count=survey?.[index]??0;return count>0?[name+': '+count+' site'+(count===1?'':'s')]:[];});
  // Only current visibility or a clan-private observation can establish ownership.
  const ownerReport=intelligence.filter(report=>report.star===star.id&&report.ownerObserved).sort((a,b)=>b.turn-a.turn||Date.parse(b.at)-Date.parse(a.at))[0];
  const historical=stats?.knowledge==='historical'&&stats.ownerObserved;
  const owner=star.visible?clan(star.owner,team):ownerReport?clan(ownerReport.owner,team):historical?clan(stats.owner,team):'Unknown';
  const ownerTurn=star.visible?null:ownerReport?.turn??(historical?stats.turn:null);
  return {star,travel:distances.get(star.id),survey,surveyTurn,minerals,owner,ownerTurn,habitability:latestHabitabilitySurvey(intelligence,star.id)};
 }).sort((a,b)=>{
  if(sort==='travel')return ((a.travel??Infinity)-(b.travel??Infinity))||a.star.name.localeCompare(b.star.name);
  if(sort==='habitability')return ((b.habitability?.habitabilityScore??-1)-(a.habitability?.habitabilityScore??-1))||a.star.name.localeCompare(b.star.name);
  if(sort==='survey')return ((b.surveyTurn??-1)-(a.surveyTurn??-1))||a.star.name.localeCompare(b.star.name);
  return a.star.name.localeCompare(b.star.name);
 });
 return <dialog ref={dialog} className="colonizationPlanner expeditionDialog" aria-labelledby={title} onCancel={event=>{event.preventDefault();onClose();}}>
  <header><div><small>EXPANSION BRIEFING</small><h2 id={title}>Colonization planner</h2></div><button type="button" className="quiet" onClick={onClose}>Close planner</button></header>
  <p>Compare charted systems before committing ships. Routes show the shortest charted path, one jump per turn; later jumps need separate orders.</p>
  <div className="plannerFilters">
   <label>Departure colony<select value={origin?.id??-1} onChange={event=>setSource(Number(event.target.value))}>
    {origins.length?origins.map(star=><option key={star.id} value={star.id}>{star.name}</option>):<option value={-1}>No owned colony</option>}
   </select></label>
   <label>Sort candidates<select value={sort} onChange={event=>setSort(event.target.value as Sort)}><option value="travel">Shortest charted route</option><option value="name">System name</option><option value="survey">Newest mineral survey</option><option value="habitability">Highest surveyed habitability</option></select></label>
   <label className="plannerShortlist"><input type="checkbox" checked={onlyShortlisted} onChange={event=>setOnlyShortlisted(event.target.checked)}/> Shortlist only ({shortlist.length})</label>
  </div>
  {locked&&<p role="status">Order drafting is currently unavailable. You can still compare worlds.</p>}
  <div className="dialogScroll plannerTableWrap" tabIndex={0} role="region" aria-label="Candidate comparison">
   {rows.length?<table><thead><tr><th scope="col">System</th><th scope="col">Travel</th><th scope="col">Habitability</th><th scope="col">Known minerals</th><th scope="col">Ownership</th><th scope="col">Next step</th></tr></thead>
   <tbody>{rows.map(({star,travel,survey,surveyTurn,minerals,owner,ownerTurn,habitability})=>{
    const adjacent=travel===1;
    return <tr key={star.id}><th scope="row">{star.name}<button type="button" className="quiet" aria-label={'Shortlist '+star.name} aria-pressed={shortlist.includes(star.id)} onClick={()=>setShortlist(shortlist.includes(star.id)?shortlist.filter(id=>id!==star.id):[...shortlist,star.id])}>{shortlist.includes(star.id)?'Shortlisted':'Shortlist'}</button></th>
     <td>{travel==null?'No charted route':travel+' turn'+(travel===1?'':'s')}</td>
     <td>{habitability?habitability.habitabilityScore+'/100':'Unknown'}<small>{habitability?'Deep survey, turn '+habitability.turn:'No environmental survey on record'}</small>
     {habitability&&<HabitabilityBreakdown factors={habitability.habitabilityFactors} label={star.name}/>}</td>
     <td>{survey?(minerals.join(', ')||'No cataloged sites'):'Unknown'}{surveyTurn!=null&&<small>Deep survey, turn {surveyTurn}</small>}</td>
     <td>{owner}<small>{star.visible?'At last refresh':ownerTurn!=null?'Last seen turn '+ownerTurn+' · '+Math.max(0,turn-ownerTurn)+' turns ago · May be stale':'No ownership observation'}</small></td>
     <td>{origin&&adjacent?<><button type="button" className="secondary" aria-label={'Plan colony expedition to '+star.name} disabled={locked||!moving} onClick={()=>onExpedition(origin.id,star.id)}>Plan expedition</button>
      <button type="button" className="quiet" aria-label={'Prepare scout order to '+star.name} disabled={locked||scouts===0} onClick={()=>onScout(origin.id,star.id)}>Prepare scout</button>
      {!moving&&<small>No ships available after drafted departures.</small>}{scouts===0&&<small>No scouts available after drafted orders.</small>}</>:<small>{travel==null?'Chart a route first.':'Move to an adjacent origin first.'}</small>}</td></tr>;
   })}</tbody></table>:<p>{onlyShortlisted?'No systems shortlisted.':'No other charted systems to compare.'}</p>}
  </div>
  <p className="hint">Unknown intel does not block an otherwise valid expedition. Founding a colony still requires surviving combat and an eligible fleet. Scout preparation starts with Distant recon, the lowest-risk mission; switch to Deep for exact counts and available surveys. Habitability is simulated, advisory only, and requires a returning Deep scout in a new real-star campaign. It does not affect colony rules.</p>
 </dialog>;
}
