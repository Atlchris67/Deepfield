import { useEffect, useRef, useState } from 'react';
import { hulls } from './FleetPanel';

export type Order={kind:string;source:number;target:number;ships:number;mission?:string;hull?:string};
export type Star={id:number;name:string;x:number;y:number;known:boolean;visible:boolean;owner:number|null;collectors:number|null;ships:number[]|null;scouts:number[]|null;defense:number|null;fleets:number[][]|null};
export const linked=(a:number,b:number)=>a!==b&&(Math.abs(a-b)===1||Math.abs(a-b)===6)&&!(Math.min(a,b)===5&&Math.max(a,b)===6);
export function available(star:Star,team:number,typed:boolean,index:number,draft:Order[]){
 const existing=typed?(star.fleets?.[team]?.[index]??0):(star.ships?.[team]??0);
 return Math.max(0,existing-draft.filter(o=>o.kind==='move'&&o.source===star.id&&(!typed||(o.hull??'interceptor')===hulls[index].id)).reduce((n,o)=>n+o.ships,0));
}
export function ExpeditionDialog({stars,team,typed,draft,initialSource,initialTarget,onClose,onAdd}:{stars:Star[];team:number;typed:boolean;draft:Order[];initialSource:number;initialTarget:number;onClose:()=>void;onAdd:(orders:Order[],signal:AbortSignal)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),sending=useRef(false),abort=useRef(new AbortController());
 const [source,setSource]=useState(initialSource),[target,setTarget]=useState(initialTarget),[counts,setCounts]=useState<string[]>(Array(typed?5:1).fill('0'));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{
  const token=crypto.randomUUID();history.pushState({expedition:token},'');
  const back=()=>closeRef.current();window.addEventListener('popstate',back);dialog.current?.showModal();
  return ()=>{abort.current.abort();window.removeEventListener('popstate',back);if(history.state?.expedition===token)history.back();};
 },[]);
 const star=stars.find(s=>s.id===source)!;
 const rows=typed?hulls:[{id:'ships',label:'Ships',cost:5,counters:''}];
 const selected=counts.map(Number),total=selected.reduce((a,b)=>a+b,0);
 const invalid=selected.some((n,i)=>!Number.isInteger(n)||n<0||n>Math.min(100,available(star,team,typed,i,draft)))||total===0||!stars.some(s=>s.id===target&&s.known&&linked(source,target))||draft.length+selected.filter(n=>n>0).length>24;
 async function add(){
  if(sending.current||invalid)return;sending.current=true;setBusy(true);setError('');
  try{await onAdd(selected.flatMap((n,i)=>n?[{kind:'move',source,target,ships:n,...(typed?{hull:rows[i].id}:{})}]:[]),abort.current.signal);if(!abort.current.signal.aborted)closeRef.current();}
  catch(e){setError(e instanceof Error?e.message:'Could not check fleet availability.');}
  finally{sending.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="expeditionDialog" aria-labelledby="expedition-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <h2 id="expedition-title">Select expedition fleet</h2><p>Choose existing ships to send. Available counts subtract every movement order already in your draft; newly built ships move next turn.</p>
  <div className="dialogScroll"><fieldset disabled={busy}><label>Expedition source<select value={source} onChange={e=>{const id=Number(e.target.value);setSource(id);setTarget(stars.find(s=>s.known&&linked(id,s.id))?.id??-1);setCounts(rows.map(()=>'0'));setError('');}}>{stars.filter(s=>s.visible&&(s.ships?.[team]??0)>0).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <label>Expedition destination<select value={target} onChange={e=>setTarget(Number(e.target.value))}><option value={-1}>Select linked system</option>{stars.filter(s=>s.known&&linked(source,s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <table><thead><tr><th>Ship type</th><th>Available</th><th>Send</th></tr></thead><tbody>{rows.map((row,i)=>{const count=available(star,team,typed,i,draft);return <tr key={row.id}><th scope="row">{row.label}</th><td data-testid={'available-'+row.id}>{count}</td><td><input aria-label={'Send '+row.label} type="number" min="0" max={Math.min(100,count)} step="1" value={counts[i]} onChange={e=>setCounts(old=>old.map((n,j)=>j===i?e.target.value:n))}/>{selected[i]>Math.min(100,count)&&<small className="error">Maximum {Math.min(100,count)} available for this order.</small>}</td></tr>;})}</tbody></table>
  <p><strong>{total || 0} ships selected</strong>. Maximum 100 per {typed?'hull movement order':'movement order'}; one order per selected type. Multiple orders may exceed 100 total. Maximum 24 orders per turn.</p>
  <p>Settlement needs two surviving {typed?'interceptors':'ships'} after combat; they become habitats. Scouts travel through reconnaissance orders and cannot settle colonies.</p>
  {invalid&&<p className="hint">Select a linked destination and whole counts within availability and the 100-per-order limit.</p>}
  </fieldset></div>{error&&<p role="alert" className="error">{error}</p>}<div className="dialogActions"><button className="quiet" onClick={onClose}>Cancel</button><button disabled={busy||invalid} onClick={()=>void add()}>{busy?'Checking availability…':'Add expedition to draft'}</button></div>
 </dialog>;
}
