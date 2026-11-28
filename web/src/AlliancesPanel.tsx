import type {Seat} from './SeasonDialog';

// An alliance is in force from turn `since` and, once notice is given, up to but not including turn `ends`.
export type Pact={a:number;b:number;since:number;ends:number|null};
export type AllianceAction='offer'|'decline'|'end';

const between=(pact:Pact,a:number,b:number)=>pact.a===Math.min(a,b)&&pact.b===Math.max(a,b);

// Shown only in a season with three or four clans. Alliances are public; offers are shown only to the two clans involved.
export function AlliancesPanel({seats,team,turn,pacts,made,received,disabled,onAction}:{seats:Seat[];team:number;turn:number;pacts:Pact[];made:number[];received:number[];disabled:boolean;onAction:(action:AllianceAction,clan:number)=>void}){
 const mine=seats[team]?.computer;
 const others=pacts.filter(pact=>pact.a!==team&&pact.b!==team);
 const when=(pact:Pact)=>pact.ends!==null?`until turn ${pact.ends} begins`:pact.since>turn?`from turn ${pact.since}`:'now';
 return <section className="panel alliances" aria-label="Alliances"><div className="panelTitle"><span>ALLIANCES</span></div>
  <p className="allianceHelp">Allies do not fight each other or take each other's colonies, and each sees what the other sees. If your ally wins, you win too. Every other clan is an enemy. Ending an alliance takes a full turn's notice.</p>
  <ul className="allianceList">{seats.map((seat,clan)=>{
   if(clan===team)return null;
   const pact=pacts.find(item=>between(item,team,clan));
   return <li key={clan}><strong>{seat.name}</strong>
    {pact?<><span className="allianceState allied">{pact.ends!==null?`Allied until turn ${pact.ends} begins. Notice has been given.`:pact.since>turn?`Allied from turn ${pact.since}.`:'Allied.'}</span>
      {pact.ends===null&&<button type="button" className="quiet" disabled={disabled||mine} onClick={()=>onAction('end',clan)}>Give notice to end</button>}</>
    :received.includes(clan)?<><span className="allianceState">Offers your clan an alliance.</span><button type="button" disabled={disabled||mine} onClick={()=>onAction('offer',clan)}>Accept</button><button type="button" className="quiet" disabled={disabled||mine} onClick={()=>onAction('decline',clan)}>Decline</button></>
    :made.includes(clan)?<><span className="allianceState">Your clan has offered an alliance. Waiting for an answer.</span><button type="button" className="quiet" disabled={disabled||mine} onClick={()=>onAction('decline',clan)}>Withdraw offer</button></>
    :seat.computer?<span className="allianceState">Enemy. Played by the computer, which makes no alliances.</span>
    :<><span className="allianceState">Enemy.</span><button type="button" className="quiet" disabled={disabled||mine} onClick={()=>onAction('offer',clan)}>Offer alliance</button></>}
   </li>;})}</ul>
  {others.length>0&&<p className="allianceOthers">{others.map(pact=>`${seats[pact.a]?.name} and ${seats[pact.b]?.name} are allied ${when(pact)}.`).join(' ')}</p>}
 </section>;
}
