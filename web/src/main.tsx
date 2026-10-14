import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Order={kind:string;source:number;target:number;ships:number};
type Star={id:number;name:string;x:number;y:number;known:boolean;visible:boolean;owner:number|null;collectors:number|null;ships:number[]|null};
type Campaign={turn:number;deadline:string;winner:number|null;team:number;name:string;credits:number;revision:number;orders:Order[];reports:string[];messages:{id:string;author:string;text:string;at:string}[];stars:Star[];energy:number;goal:number};
const linked=(a:number,b:number)=>a!==b&&(Math.abs(a-b)===1||Math.abs(a-b)===6)&&!(Math.min(a,b)===5&&Math.max(a,b)===6);
class ApiError extends Error {
 constructor(message:string,readonly status:number){super(message);}
}

function App(){
 const [session,setSession]=useState(0);
 return <CommandSession key={session} onLeave={()=>setSession(value=>value+1)}/>;
}

function CommandSession({onLeave}:{onLeave:()=>void}){
 const [key,setKey]=useState(''),[game,setGame]=useState<Campaign|null>(null),[local,setLocal]=useState(false);
 const [draft,setDraft]=useState<Order[]>([]),[selected,setSelected]=useState(0),[kind,setKind]=useState('move'),[target,setTarget]=useState(1),[ships,setShips]=useState(2);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[author,setAuthor]=useState('Commander'),[message,setMessage]=useState('');
 // Keep a failed submission's ID/payload so an ambiguous network response can safely be retried.
 const [pending,setPending]=useState<{turn:number;revision:number;requestId:string;orders:Order[]}|null>(null);
 async function api(path:string,method='GET',body?:unknown){
  const res=await fetch('/api/'+path,{method,headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!res.ok){const result=await res.json().catch(()=>({error:res.status===401?'Team key was not accepted.':'Request failed ('+res.status+').'}));throw new ApiError(result.error??'Request failed',res.status);}
  return res.json();
 }
 async function act(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function refresh(){const data=await api('campaign');setGame(data.campaign);setDraft(data.campaign.orders);setLocal(data.localTest);setPending(null);}
 async function commitOrders(){
  if(!game)return;
  const body=pending??{turn:game.turn,revision:game.revision,requestId:crypto.randomUUID(),orders:draft};
  setPending(body);
  try{await api('orders','PUT',body);}
  catch(error){
   // Definitive rejection permits editing. Timeouts, network failures and server
   // errors may follow a commit, so retain their exact request for a safe retry.
   if(error instanceof ApiError&&[400,401,403,404,409,413,415,422,429].includes(error.status))setPending(null);
   throw error;
  }
  await refresh();setNotice('Orders committed. Your clan can revise them until the deadline.');
 }
 if(!game)return <main className="login"><div className="brand">✦ DEEPFIELD <span>CAMPAIGN 001</span></div><div className="eyebrow">A GALAXY BUILT TOGETHER</div><h1>Small beginnings.<br/><em>Galactic ambitions.</em></h1><p>Rally your clan. Chart the dark. Build a civilization that can harness the stars.</p><form onSubmit={e=>{e.preventDefault();void act(refresh);}}><label>Clan access key<input type="password" value={key} onChange={e=>setKey(e.target.value)} required autoComplete="off" placeholder="Enter your shared team key"/></label><button disabled={busy}>Enter command deck →</button></form>{error&&<p role="alert" className="error">{error}</p>}<small>One shared homeworld per clan · One simultaneous turn per day</small></main>;
 const star=game.stars[selected];
 const colonies=game.stars.filter(s=>s.owner===game.team).length;
 const closed=Date.now()>=Date.parse(game.deadline)||game.winner!==null;
 const cost=draft.reduce((sum,o)=>sum+(o.kind==='collector'?30:o.kind==='build'?o.ships*5:0),0);
 const names=(id:number)=>game.stars[id]?.name??'Unknown';
 return <div className="shell"><header><div className="brand">✦ DEEPFIELD <span>COMMAND DECK</span></div><div className="headerRight"><span className="live">● {game.name}</span><button className="quiet" onClick={onLeave}>Leave</button></div></header>
 <main><section className="intro"><div><div className="eyebrow">THE LONG HORIZON / TURN {String(game.turn).padStart(3,'0')}</div><h1>The stars are within reach.</h1><p>Explore together. Commit your orders. Let the galaxy answer.</p></div><div className="deadline"><span>NEXT RESOLUTION · UTC</span><strong>{new Date(game.deadline).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})}</strong><small>{closed?'Orders closed':'All clans resolve simultaneously'}</small></div></section>
 <section className="metrics"><div><span>TREASURY</span><strong>{game.credits}<small> credits</small></strong></div><div><span>COLONIES</span><strong>{colonies}<small> / 4 required</small></strong></div><div><span>ENERGY NETWORK</span><strong>{game.energy}<small> / {game.goal} collectors</small></strong></div><div className="victory"><span>TYPE III HORIZON</span><progress max={12} value={Math.min(4,colonies)+Math.min(8,game.energy)}/><small>Control 4 colonies and 8 collectors to win</small></div></section>
 {game.winner!==null&&<div className="banner">{game.winner===2?'Shared victory':game.winner===game.team?'Your clan achieved Type III!':'The rival clan achieved Type III.'} — Campaign complete.</div>}
 <div role="status" className="notice">{notice}</div>{error&&<div role="alert" className="error">{error}</div>}
 <div className="grid"><section className="panel mapPanel"><div className="panelTitle"><h2>Local arm</h2><span>12 SYSTEMS · SECTOR 01</span></div><div className="map"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{game.stars.flatMap(a=>game.stars.filter(b=>b.id>a.id&&linked(a.id,b.id)).map(b=><line key={a.id+'-'+b.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>))}</svg>{game.stars.map(s=><button key={s.id} aria-label={`${s.name}${s.visible?', observed':', no current intelligence'}`} aria-pressed={s.id===selected} className={'star '+(s.id===selected?'selected ':'')+(s.owner===game.team?'own ':s.owner!==null?'enemy ':'')+(!s.known?'unknown':'')} style={{left:s.x+'%',top:s.y+'%'}} onClick={()=>{setSelected(s.id);setTarget(game.stars.find(t=>t.known&&linked(s.id,t.id))?.id??-1);}}><i/>{s.name}<small>{s.visible?(s.ships?.[game.team]??0)+' ships':s.known?'Charted':'No signal'}</small></button>)}</div><div className="legend"><span>● Your colony</span><span>○ Charted / unobserved</span><span>· Unknown</span></div><div className="brief"><strong>{star.name}</strong><p>{star.visible?`${star.owner===game.team?'Your colony':star.owner!==null?'Rival colony':'Unclaimed system'} · ${star.ships?.[game.team]} friendly ships · ${star.collectors} collectors`:'Ownership and ships are hidden until your fleet arrives. Charted systems can receive expeditions.'}</p></div></section>
 <section className="panel orders"><div className="panelTitle"><h2>Turn orders</h2><span>REV {game.revision}</span></div><p>Orders are shared by your clan. Coordinate before replacing them.</p><label>Action at {star.name}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="move">Send expedition</option><option value="build">Build ships · 5 credits each</option><option value="collector">Build collector · 30 credits</option></select></label>{kind==='move'&&<label>Destination<select value={target} onChange={e=>setTarget(Number(e.target.value))}><option value={-1}>Select linked system</option>{game.stars.filter(t=>t.known&&linked(star.id,t.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}{kind!=='collector'&&<label>Ships<input type="number" min="1" max="100" value={ships} onChange={e=>setShips(Number(e.target.value))}/></label>}<button className="secondary" disabled={busy||closed||!star.visible||!!pending} onClick={()=>setDraft([...draft,{kind,source:selected,target,ships}])}>+ Add to draft</button><ol className="queue">{draft.map((o,i)=><li key={i}><span>{o.kind==='move'?`${o.ships} ships: ${names(o.source)} → ${names(o.target)}`:o.kind==='build'?`Build ${o.ships} ships at ${names(o.source)}`:`Collector at ${names(o.source)}`}</span><button className="quiet" aria-label={'Remove order '+(i+1)} disabled={!!pending} onClick={()=>setDraft(draft.filter((_,n)=>n!==i))}>×</button></li>)}</ol>{draft.length===0&&<p className="empty">No orders queued. Your colonies still generate income.</p>}<div className="orderFooter"><span>{cost} / {game.credits} credits committed</span><button disabled={busy||closed||cost>game.credits} onClick={()=>void act(commitOrders)}>{pending?'Retry submission':'Commit orders'}</button><button className="quiet" disabled={busy} onClick={()=>void act(async()=>{await refresh();setNotice('Latest clan orders loaded; local draft replaced.');})}>Refresh clan orders</button></div></section></div>
 <div className="grid lower"><section className="panel"><div className="panelTitle"><h2>Clan channel</h2><span>PRIVATE TO YOUR TEAM</span></div><div className="messages">{game.messages.length===0?<p className="empty">A good campaign starts with a plan. Leave one for your clan.</p>:game.messages.map(m=><article key={m.id}><strong>{m.author}</strong><time>{new Date(m.at).toLocaleTimeString()}</time><p>{m.text}</p></article>)}</div><form onSubmit={e=>{e.preventDefault();void act(async()=>{await api('messages','POST',{id:crypto.randomUUID(),author,text:message});setMessage('');const data=await api('campaign');setGame({...game,messages:data.campaign.messages});setNotice('Message sent to your clan.');});}}><label>Call sign<input maxLength={40} value={author} onChange={e=>setAuthor(e.target.value)} required/></label><label>Message<textarea maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Where should we send the next expedition?" required/></label><button disabled={busy}>Send to clan →</button></form></section>
 <section className="panel"><div className="panelTitle"><h2>Field reports</h2><span>YOUR INTELLIGENCE</span></div>{game.reports.length===0?<p className="empty">First contact awaits. Reports arrive after each resolution.</p>:<ul className="reports">{game.reports.map((r,i)=><li key={i}>{r}</li>)}</ul>}<details><summary>Field manual</summary><p>Each colony earns 15 credits per turn. Ships cost 5; collectors cost 30. Fleets cross one link each turn. Two arriving ships become a colony on an empty system. Equal fleets destroy each other; the larger fleet keeps the difference. A surviving attacker destroys an enemy colony and its collectors before founding a new one. New ships cannot move until the next turn.</p><p>Win with 4 colonies and 8 collectors. Unknown ownership is never a promise of safety. Orders replace the entire clan plan. Shared homeworlds and team keys are provisional MVP rules.</p></details>{local&&<div className="testMode"><span>LOCAL TEST MODE</span><button className="secondary" disabled={busy||game.winner!==null} onClick={()=>void act(async()=>{await api('local/advance','POST',{turn:game.turn});await refresh();setNotice('One test turn resolved.');})}>Resolve one test turn →</button><small>Resolves committed orders only.</small></div>}</section></div><footer>DEEPFIELD / A SHARED FRONTIER <span>Daily strategy. Lasting consequences.</span></footer></main></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);

