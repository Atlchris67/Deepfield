import {useEffect,useRef,useState} from 'react';
import './seasons.css';

export type Standing={name:string;colonies:number;collectors:number;ships:number};
// winner: a clan index, 2 for a shared victory, null when a season was ended early.
export type Outcome={winner:number|null;turns:number;ended:string|null;standings:Standing[]};
export type VictoryRule={colonies:number;collectors:number;turnLimit:number};
export const standardVictory:VictoryRule={colonies:4,collectors:8,turnLimit:0};
export type SeasonRecord={season:number;winner:number|null;turns:number;started:string|null;ended:string;standings:Standing[];mapSeed:number};

const day=(value:string|null)=>value?new Date(value).toLocaleDateString('en-GB',{timeZone:'UTC',dateStyle:'medium'}):'';
function result(winner:number|null,standings:Standing[]){
 return winner===null?'Ended early, no winner':winner===2?'Shared victory':(standings[winner]?.name??'A clan')+' won';
}

function Standings({standings,team,winner}:{standings:Standing[];team:number;winner:number|null}){
 return <table className="standings"><caption>Final standings</caption><thead><tr><th scope="col">Clan</th><th scope="col">Colonies</th><th scope="col">Collectors</th><th scope="col">Ships</th></tr></thead>
  <tbody>{standings.map((clan,i)=><tr key={i} className={winner===2||winner===i?'won':undefined}><th scope="row">{clan.name}{i===team&&<span className="you"> (you)</span>}</th><td>{clan.colonies}</td><td>{clan.collectors}</td><td>{clan.ships}</td></tr>)}</tbody></table>;
}

const describe=(rule:VictoryRule)=>`${rule.colonies} colonies and ${rule.collectors} collectors`+(rule.turnLimit>0?`. If nobody has by the end of turn ${rule.turnLimit}, the clan with more colonies wins, then more collectors; equal is a shared victory`:'');
const modeNames:Record<string,string>={simple:'Simple mode',advanced:'Advanced mode','':'This campaign\'s original rules'};
const modeHelp:Record<string,string>={simple:'Generic ships, flat income, credits only. No materials, mines, freight, defenses or ship design.',advanced:'Ship types and design, tapered collector income, fixed defenses, materials, mines, local stock, freighters and gates.','':'The rule settings this campaign was created with carry on unchanged.'};
const whole=(value:string)=>Math.max(0,Math.trunc(Number(value))||0);
function RuleFields({rule,disabled,onChange}:{rule:VictoryRule;disabled:boolean;onChange:(rule:VictoryRule)=>void}){
 return <div className="ruleFields">
  <label>Colonies to win<input type="number" min={2} max={12} value={rule.colonies} disabled={disabled} onChange={e=>onChange({...rule,colonies:whole(e.target.value)})}/></label>
  <label>Collectors to win<input type="number" min={2} max={60} value={rule.collectors} disabled={disabled} onChange={e=>onChange({...rule,collectors:whole(e.target.value)})}/></label>
  <label>Turn limit (0 = none)<input type="number" min={0} max={365} value={rule.turnLimit} disabled={disabled} onChange={e=>onChange({...rule,turnLimit:whole(e.target.value)})}/></label>
 </div>;
}

// The victory screen, the season record, and the control that starts the next season.
export function SeasonDialog({season,turn,victory,mode,onSaveSetup,team,outcome,history,canStart,busy,error,onStart,onClose}:{season:number;turn:number;victory:VictoryRule;mode:string|null;onSaveSetup:(rule:VictoryRule,mode:string)=>void;team:number;outcome:Outcome|null;history:SeasonRecord[];canStart:boolean;busy:boolean;error:string;onStart:(endEarly:boolean,rule:VictoryRule,mode:string)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[endEarly,setEndEarly]=useState(false),[rule,setRule]=useState(victory),[nextMode,setNextMode]=useState(mode??'');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const shared=outcome?.winner===2,won=outcome?.winner===team;
 return <dialog ref={dialog} className={'planetDialog seasonDialog'+(outcome?(shared||won?' victory':' defeat'):'')} aria-labelledby="season-title" onClose={onClose} onCancel={onClose}>
  <div className="seasonBody"><div className="panelTitle"><div className="eyebrow">SEASON {season}{outcome?' COMPLETE':' IN PROGRESS'}</div><button type="button" className="quiet" onClick={onClose}>{outcome?'View final map':'Close'}</button></div>
   {outcome?<>
    <h2 id="season-title">{shared?'Shared victory':won?'Victory':'Defeat'}</h2>
    <p className="seasonLead">{shared?'Both clans reached Type III in the same turn. The galaxy is big enough for two.':won?`${outcome.standings[team]?.name} reached Type III. The stars are yours.`:`${outcome.standings[outcome.winner??0]?.name} reached Type III first. There is always next season.`}</p>
    <Standings standings={outcome.standings} team={team} winner={outcome.winner}/>
    <p className="seasonMeta">Decided in {outcome.turns} {outcome.turns===1?'turn':'turns'}{outcome.ended?' · '+day(outcome.ended):''}</p>
   </>:<><h2 id="season-title">Season {season}</h2><p className="seasonLead">This season is still being played. To win: {describe(victory)}.</p></>}
   <p className="seasonMeta">Rules: {modeNames[mode??'']}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   <section className="nextSeason" aria-label="Next season">
    {canStart?<>
     <p>Season {season+1} starts everyone again from one homeworld, on a new map with different links and homeworlds. Clan channels and this record are kept. This cannot be undone.</p>
     <h3 className="ruleTitle">Rules mode</h3><label className="modeChoice">Mode<select value={nextMode} disabled={busy} onChange={e=>setNextMode(e.target.value)}>{mode===null&&<option value="">Keep this campaign's original rules</option>}<option value="simple">Simple</option><option value="advanced">Advanced</option></select><small>{modeHelp[nextMode]}</small></label>
     <h3 className="ruleTitle">Winning condition</h3><RuleFields rule={rule} disabled={busy} onChange={setRule}/>
     {!outcome&&turn===1&&<p><button type="button" className="quiet" disabled={busy} onClick={()=>onSaveSetup(rule,nextMode)}>Use for season {season}</button> <small>Possible until the first turn resolves.{nextMode&&nextMode!==(mode??'')?' Changing the mode clears orders already submitted this turn.':''}</small></p>}
     {!outcome&&<label className="endEarly"><input type="checkbox" checked={endEarly} disabled={busy} onChange={e=>setEndEarly(e.target.checked)}/> End season {season} now, without a winner</label>}
     <button type="button" disabled={busy||(!outcome&&!endEarly)} onClick={()=>onStart(!outcome,rule,nextMode)}>Start season {season+1} →</button>
    </>:outcome?<p>The campaign owner starts season {season+1}. Use “Refresh clan orders” to check whether it has begun.</p>:null}
   </section>
   <h3>Past seasons</h3>
   {history.length===0?<p className="empty">This is the first season.</p>:<ol className="seasonHistory">{[...history].reverse().map(record=><li key={record.season}>
    <strong>Season {record.season}</strong><span>{result(record.winner,record.standings)}</span><small>{record.turns} {record.turns===1?'turn':'turns'} · {day(record.ended)} · {record.standings.map(clan=>`${clan.name} ${clan.colonies}/${clan.collectors}`).join(', ')}</small></li>)}</ol>}
  </div></dialog>;
}
