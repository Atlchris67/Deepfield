import { useEffect, useRef, useState } from 'react';
import { hulls, available, availableScouts, linked, emptySelection, selectionAtSource, validateExpedition, type Order, type Star, type StarLink } from './fleetSelection';

export function ExpeditionDialog({stars,team,typed,draft,initialSource,initialTarget,links,onClose,onAdd}:{stars:Star[];team:number;typed:boolean;draft:Order[];initialSource:number;initialTarget:number;links?:StarLink[]|null;onClose:()=>void;onAdd:(orders:Order[],signal:AbortSignal)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),sending=useRef(false),abort=useRef(new AbortController());
 const [source,setSource]=useState(initialSource),[target,setTarget]=useState(initialTarget),[counts,setCounts]=useState<string[]>(emptySelection(typed));
 const [scouts,setScouts]=useState('0');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{
  const token=crypto.randomUUID();history.pushState({expedition:token},'');
  const back=()=>closeRef.current();window.addEventListener('popstate',back);dialog.current?.showModal();
  return ()=>{abort.current.abort();window.removeEventListener('popstate',back);if(history.state?.expedition===token)history.back();};
 },[]);
 const star=stars.find(s=>s.id===source)!;
 const rows=typed?hulls:[{id:'ships',label:'Ships',cost:5,counters:''}];
 const validation=validateExpedition({stars,source,target,team,typed,draft,counts,scouts,links});
 const invalid=!validation.valid,total=validation.total;
 async function add(){
  if(sending.current||invalid)return;sending.current=true;setBusy(true);setError('');
  try{await onAdd(validation.orders,abort.current.signal);if(!abort.current.signal.aborted)closeRef.current();}
  catch(e){setError(e instanceof Error?e.message:'Could not check fleet availability.');}
  finally{sending.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="expeditionDialog" aria-labelledby="expedition-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <h2 id="expedition-title">Select expedition fleet</h2><p>Choose existing ships to send. Available counts subtract every movement order already in your draft; newly built ships move next turn.</p>
  <div className="dialogScroll"><fieldset disabled={busy}><label>Expedition source<select value={source} onChange={e=>{const id=Number(e.target.value);const reset=selectionAtSource(stars,id,typed,links);setSource(id);setTarget(reset.target);setCounts(reset.counts);setScouts('0');setError('');}}>{stars.filter(s=>s.visible&&(s.ships?.[team]??0)>0).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <label>Expedition destination<select value={target} onChange={e=>setTarget(Number(e.target.value))}><option value={-1}>Select linked system</option>{stars.filter(s=>s.known&&linked(source,s.id,links)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <table><thead><tr><th>Ship type</th><th>Available</th><th>Send</th></tr></thead><tbody>{rows.map((row,i)=>{const count=available(star,team,typed,i,draft);return <tr key={row.id}><th scope="row">{row.label}</th><td data-testid={'available-'+row.id}>{count}</td><td><input aria-label={'Send '+row.label} type="number" min="0" max={Math.min(100,count)} step="1" value={counts[i]} onChange={e=>setCounts(old=>old.map((n,j)=>j===i?e.target.value:n))}/>{validation.issues.filter(issue=>issue.row===i).map(issue=><small key={issue.code} className="error">{issue.message}</small>)}</td></tr>;})}</tbody></table>
  <label>Scouts traveling with fleet<input aria-label="Scouts traveling with fleet" type="number" min="0" max={Math.min(100,availableScouts(star,team,draft))} step="1" value={scouts} onChange={e=>setScouts(e.target.value)}/></label><small>{availableScouts(star,team,draft)} scouts available after drafted missions.</small>
  <p><strong>{total || 0} ships selected</strong>. Maximum 100 per {typed?'hull movement order':'movement order'}; one order per selected type. Multiple orders may exceed 100 total. Maximum 24 orders per turn.</p>
  <p>Settlement needs two surviving {typed?'interceptors':'ships'} after combat; they become habitats. Traveling scouts land only if your fleet survives and the destination is your colony. They can scout from there next turn. Scouts cannot fight or found colonies.</p>

  </fieldset></div>{validation.issues.filter(issue=>issue.row===undefined).map(issue=><p key={issue.code} className="hint" role="status">{issue.message}</p>)}{error&&<p role="alert" className="error">{error}</p>}<div className="dialogActions"><button className="quiet" onClick={onClose}>Cancel</button><button disabled={busy||invalid} onClick={()=>void add()}>{busy?'Checking availability…':'Add expedition to draft'}</button></div>
 </dialog>;
}
