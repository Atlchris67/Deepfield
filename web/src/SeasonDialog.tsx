import {useEffect,useRef,useState} from 'react';
import './seasons.css';

export type Standing={name:string;colonies:number;collectors:number;ships:number};
// winner: a clan index, the number of clans for a shared victory (2 with two clans), null when a season was ended early.
// winners names every winning clan; records from before seasons could have more than two clans do not have it.
export type Outcome={winner:number|null;turns:number;ended:string|null;standings:Standing[];winners?:number[]|null};
export function winnersOf(winner:number|null,winners:number[]|null|undefined,clans:number){return winners??(winner===null?[]:winner>=clans?Array.from({length:clans},(_,i)=>i):[winner]);}
const list=(names:string[])=>names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names[names.length-1];
export type Seat={name:string;computer:boolean};
export type VictoryRule={colonies:number;collectors:number;turnLimit:number};
export const standardVictory:VictoryRule={colonies:4,collectors:8,turnLimit:0};
export type SeasonRecord={season:number;winner:number|null;turns:number;started:string|null;ended:string;standings:Standing[];mapSeed:number;winners?:number[]|null};

const day=(value:string|null)=>value?new Date(value).toLocaleDateString('en-GB',{timeZone:'UTC',dateStyle:'medium'}):'';
function result(winner:number|null,standings:Standing[],named?:number[]|null){
 const winners=winnersOf(winner,named,standings.length);
 return winner===null?'Ended early, no winner':winners.length===standings.length?'Shared victory':winners.length>1?'Shared victory: '+list(winners.map(i=>standings[i]?.name??'A clan')):(standings[winners[0]]?.name??'A clan')+' won';
}

function Standings({standings,team,winners}:{standings:Standing[];team:number;winners:number[]}){
 return <table className="standings"><caption>Final standings</caption><thead><tr><th scope="col">Clan</th><th scope="col">Colonies</th><th scope="col">Collectors</th><th scope="col">Ships</th></tr></thead>
  <tbody>{standings.map((clan,i)=><tr key={i} className={winners.includes(i)?'won':undefined}><th scope="row">{clan.name}{i===team&&<span className="you"> (you)</span>}</th><td>{clan.colonies}</td><td>{clan.collectors}</td><td>{clan.ships}</td></tr>)}</tbody></table>;
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
export function SeasonDialog({season,turn,victory,mode,seats,onSetComputer,onSaveSetup,team,outcome,history,canStart,busy,error,onStart,onClose}:{season:number;turn:number;victory:VictoryRule;mode:string|null;seats:Seat[];onSetComputer:(team:number,computer:boolean)=>void;onSaveSetup:(rule:VictoryRule,mode:string,clans:number)=>void;team:number;outcome:Outcome|null;history:SeasonRecord[];canStart:boolean;busy:boolean;error:string;onStart:(endEarly:boolean,rule:VictoryRule,mode:string,clans:number)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[endEarly,setEndEarly]=useState(false),[rule,setRule]=useState(victory),[nextMode,setNextMode]=useState(mode??''),[clans,setClans]=useState(Math.max(2,seats.length));
  // Closing the dialog puts keyboard focus back on the button that opened it.
 useEffect(()=>{const node=dialog.current,opener=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{if(opener?.isConnected)opener.focus();};},[]);
 const winners=outcome?winnersOf(outcome.winner,outcome.winners,outcome.standings.length):[],won=winners.includes(team),shared=winners.length>1&&won;
 const everyone=!!outcome&&winners.length===outcome.standings.length,names=outcome?winners.map(i=>outcome.standings[i]?.name??'A clan'):[];
 // Three or four clans need simple or advanced mode.
 const needsMode=clans>2&&!nextMode;
 return <dialog ref={dialog} className={'planetDialog seasonDialog'+(outcome?(shared||won?' victory':' defeat'):'')} aria-labelledby="season-title" onClose={onClose} onCancel={onClose}>
  <div className="seasonBody"><div className="panelTitle"><div className="eyebrow">SEASON {season}{outcome?' COMPLETE':' IN PROGRESS'}</div><button type="button" className="quiet" onClick={onClose}>{outcome?'View final map':'Close'}</button></div>
   {outcome?<>
    <h2 id="season-title">{shared?'Shared victory':won?'Victory':'Defeat'}</h2>
    <p className="seasonLead">{shared&&everyone&&winners.length===2?'Both clans reached Type III in the same turn. The galaxy is big enough for two.':shared?`${list(names)} share the victory.`:won?`${outcome.standings[team]?.name} reached Type III. The stars are yours.`:winners.length>1?`${list(names)} share the victory. There is always next season.`:`${names[0]} reached Type III first. There is always next season.`}</p>
    <Standings standings={outcome.standings} team={team} winners={winners}/>
    <p className="seasonMeta">Decided in {outcome.turns} {outcome.turns===1?'turn':'turns'}{outcome.ended?' · '+day(outcome.ended):''}</p>
   </>:<><h2 id="season-title">Season {season}</h2><p className="seasonLead">This season is still being played. To win: {describe(victory)}.</p></>}
   <p className="seasonMeta">Rules: {modeNames[mode??'']}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   {seats.length>0&&<section className="seats" aria-label="Who plays each clan"><h3 className="ruleTitle">Who plays each clan</h3>
    {canStart?<><div className="seatFields">{seats.map((seat,i)=><label key={i}>{seat.name}{i===team?' (you)':''}<select value={seat.computer?'computer':'players'} disabled={busy} onChange={e=>onSetComputer(i,e.target.value==='computer')}><option value="players">Its players</option><option value="computer">The computer</option></select></label>)}</div>
     <small>The computer plays a clan only while it is set here, from the next turn resolution. It never steps in by itself: players who miss a turn give no orders that turn.</small></>
    :<ul className="seatList">{seats.map((seat,i)=><li key={i}>{seat.name}{i===team?' (you)':''}: played by {seat.computer?'the computer':'its players'}</li>)}</ul>}
   </section>}
   <section className="nextSeason" aria-label="Next season">
    {canStart?<>
     <p>Season {season+1} starts everyone again from one homeworld, on a new map with different links and homeworlds. Clan channels and this record are kept. This cannot be undone.</p>
     <h3 className="ruleTitle">Rules mode</h3><label className="modeChoice">Mode<select value={nextMode} disabled={busy} onChange={e=>setNextMode(e.target.value)}>{mode===null&&<option value="">Keep this campaign's original rules</option>}<option value="simple">Simple</option><option value="advanced">Advanced</option></select><small>{modeHelp[nextMode]}</small></label>
     <h3 className="ruleTitle">Clans</h3><label className="clanChoice">Number of clans<select value={clans} disabled={busy} onChange={e=>setClans(Number(e.target.value))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select><small>{needsMode?'Three or four clans need simple or advanced mode.':clans>2?'With three or four clans, clans can form alliances. Every clan that is not an ally is an enemy.':'Two clans, as before. There are no alliances.'}{clans<seats.length?' Players in a clan that is left out must be moved to another clan first.':''}</small></label>
     <h3 className="ruleTitle">Winning condition</h3><RuleFields rule={rule} disabled={busy} onChange={setRule}/>
     {!outcome&&turn===1&&<p><button type="button" className="quiet" disabled={busy||needsMode} onClick={()=>onSaveSetup(rule,nextMode,clans)}>Use for season {season}</button> <small>Possible until the first turn resolves.{(nextMode&&nextMode!==(mode??''))||clans!==seats.length?' Changing the mode or the number of clans clears orders already submitted this turn.':''}</small></p>}
     {!outcome&&<label className="endEarly"><input type="checkbox" checked={endEarly} disabled={busy} onChange={e=>setEndEarly(e.target.checked)}/> End season {season} now, without a winner</label>}
     <button type="button" disabled={busy||needsMode||(!outcome&&!endEarly)} onClick={()=>onStart(!outcome,rule,nextMode,clans)}>Start season {season+1} →</button>
    </>:outcome?<p>The campaign owner starts season {season+1}. Use “Refresh clan orders” to check whether it has begun.</p>:null}
   </section>
   <h3>Past seasons</h3>
   {history.length===0?<p className="empty">This is the first season.</p>:<ol className="seasonHistory">{[...history].reverse().map(record=><li key={record.season}>
    <strong>Season {record.season}</strong><span>{result(record.winner,record.standings,record.winners)}</span><small>{record.turns} {record.turns===1?'turn':'turns'} · {day(record.ended)} · {record.standings.map(clan=>`${clan.name} ${clan.colonies}/${clan.collectors}`).join(', ')}</small></li>)}</ol>}
  </div></dialog>;
}
