import {useEffect,useRef,useState} from 'react';
import './seasons.css';

export type Standing={name:string;colonies:number;collectors:number;ships:number};
// winner: a clan index, 2 for a shared victory, null when a season was ended early.
export type Outcome={winner:number|null;turns:number;ended:string|null;standings:Standing[]};
export type SeasonRecord={season:number;winner:number|null;turns:number;started:string|null;ended:string;standings:Standing[];mapSeed:number};

const day=(value:string|null)=>value?new Date(value).toLocaleDateString('en-GB',{timeZone:'UTC',dateStyle:'medium'}):'';
function result(winner:number|null,standings:Standing[]){
 return winner===null?'Ended early, no winner':winner===2?'Shared victory':(standings[winner]?.name??'A clan')+' won';
}

function Standings({standings,team,winner}:{standings:Standing[];team:number;winner:number|null}){
 return <table className="standings"><caption>Final standings</caption><thead><tr><th scope="col">Clan</th><th scope="col">Colonies</th><th scope="col">Collectors</th><th scope="col">Ships</th></tr></thead>
  <tbody>{standings.map((clan,i)=><tr key={i} className={winner===2||winner===i?'won':undefined}><th scope="row">{clan.name}{i===team&&<span className="you"> (you)</span>}</th><td>{clan.colonies}</td><td>{clan.collectors}</td><td>{clan.ships}</td></tr>)}</tbody></table>;
}

// The victory screen, the season record, and the control that starts the next season.
export function SeasonDialog({season,team,outcome,history,canStart,busy,error,onStart,onClose}:{season:number;team:number;outcome:Outcome|null;history:SeasonRecord[];canStart:boolean;busy:boolean;error:string;onStart:(endEarly:boolean)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[endEarly,setEndEarly]=useState(false);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const shared=outcome?.winner===2,won=outcome?.winner===team;
 return <dialog ref={dialog} className={'planetDialog seasonDialog'+(outcome?(shared||won?' victory':' defeat'):'')} aria-labelledby="season-title" onClose={onClose} onCancel={onClose}>
  <div className="seasonBody"><div className="panelTitle"><div className="eyebrow">SEASON {season}{outcome?' COMPLETE':' IN PROGRESS'}</div><button type="button" className="quiet" onClick={onClose}>{outcome?'View final map':'Close'}</button></div>
   {outcome?<>
    <h2 id="season-title">{shared?'Shared victory':won?'Victory':'Defeat'}</h2>
    <p className="seasonLead">{shared?'Both clans reached Type III in the same turn. The galaxy is big enough for two.':won?`${outcome.standings[team]?.name} reached Type III. The stars are yours.`:`${outcome.standings[outcome.winner??0]?.name} reached Type III first. There is always next season.`}</p>
    <Standings standings={outcome.standings} team={team} winner={outcome.winner}/>
    <p className="seasonMeta">Decided in {outcome.turns} {outcome.turns===1?'turn':'turns'}{outcome.ended?' · '+day(outcome.ended):''}</p>
   </>:<><h2 id="season-title">Season {season}</h2><p className="seasonLead">This season is still being played. It ends when a clan holds 4 colonies and 8 collectors.</p></>}
   {error&&<p role="alert" className="error">{error}</p>}
   <section className="nextSeason" aria-label="Next season">
    {canStart?<>
     <p>Season {season+1} starts everyone again from one homeworld, on a new map with different links and homeworlds. Clan channels and this record are kept. This cannot be undone.</p>
     {!outcome&&<label className="endEarly"><input type="checkbox" checked={endEarly} disabled={busy} onChange={e=>setEndEarly(e.target.checked)}/> End season {season} now, without a winner</label>}
     <button type="button" disabled={busy||(!outcome&&!endEarly)} onClick={()=>onStart(!outcome)}>Start season {season+1} →</button>
    </>:outcome?<p>The campaign owner starts season {season+1}. Use “Refresh clan orders” to check whether it has begun.</p>:null}
   </section>
   <h3>Past seasons</h3>
   {history.length===0?<p className="empty">This is the first season.</p>:<ol className="seasonHistory">{[...history].reverse().map(record=><li key={record.season}>
    <strong>Season {record.season}</strong><span>{result(record.winner,record.standings)}</span><small>{record.turns} {record.turns===1?'turn':'turns'} · {day(record.ended)} · {record.standings.map(clan=>`${clan.name} ${clan.colonies}/${clan.collectors}`).join(', ')}</small></li>)}</ol>}
  </div></dialog>;
}
