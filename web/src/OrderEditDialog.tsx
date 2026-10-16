import {useEffect,useRef,useState} from 'react';
import {available,hulls,linked,type Order} from './fleetSelection';
import {wireOrder,validateEdit,type DraftOrder,type EditContext} from './draftEditing';

export function OrderEditDialog({item,draft,context,onClose,onSave}:{item:DraftOrder;draft:DraftOrder[];context:EditContext;onClose:()=>void;onSave:(order:Order,signal:AbortSignal)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false),controller=useRef(new AbortController());
 const [order,setOrder]=useState<Order>(()=>wireOrder(item)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const token=crypto.randomUUID();history.pushState({editOrder:token},'');
  const back=()=>close.current();window.addEventListener('popstate',back);dialog.current?.showModal();
  return ()=>{controller.current.abort();window.removeEventListener('popstate',back);if(history.state?.editOrder===token)history.back();};
 },[]);
 const typed=context.combatVersion===1,issues=validateEdit(context,draft,item.draftId,order);
 const source=context.stars.find(s=>s.id===order.source)!;
 const availableShips=available(source,context.team,typed,Math.max(0,hulls.findIndex(h=>h.id===(order.hull??'interceptor'))),draft.filter(o=>o.draftId!==item.draftId));
 function changeKind(kind:string){setError('');setOrder({kind,source:order.source,target:order.target,ships:['recon','collector','defense'].includes(kind)?1:order.ships,...(kind==='recon'?{mission:'distant'}:{}),...(typed&&['move','build'].includes(kind)?{hull:'interceptor'}:{})});}
 async function save(){
  if(saving.current||issues.length)return;saving.current=true;setBusy(true);setError('');
  try{await onSave(order,controller.current.signal);if(!controller.current.signal.aborted)close.current();}
  catch(e){if(!controller.current.signal.aborted)setError(e instanceof Error?e.message:'Could not validate this edit.');}
  finally{saving.current=false;if(!controller.current.signal.aborted)setBusy(false);}
 }
 return <dialog ref={dialog} className="expeditionDialog" aria-labelledby="edit-order-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <h2 id="edit-order-title">Edit draft maneuver</h2><p>Save replaces this unsubmitted item in place. Other draft orders keep their reservations. Nothing is submitted until Commit orders.</p>
  <div className="dialogScroll"><fieldset disabled={busy}>
   <label>Maneuver source<select value={order.source} onChange={e=>{const source=Number(e.target.value);setError('');setOrder({...order,source,target:context.stars.find(s=>s.known&&linked(source,s.id))?.id??-1});}}>{context.stars.filter(s=>s.visible).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Maneuver action<select value={order.kind} onChange={e=>changeKind(e.target.value)}><option value="move">Send expedition</option><option value="build">Build ships</option><option value="scoutbuild">Build scouts</option><option value="recon">Scout reconnaissance</option><option value="collector">Build collector</option>{context.economyVersion===1&&<option value="defense">Fixed defense</option>}</select></label>
   {typed&&['move','build'].includes(order.kind)&&<label>Maneuver hull<select value={order.hull??'interceptor'} onChange={e=>setOrder({...order,hull:e.target.value})}>{hulls.map(h=><option key={h.id} value={h.id}>{h.label}</option>)}</select></label>}
   {['move','recon'].includes(order.kind)&&<label>Maneuver destination<select value={order.target} onChange={e=>setOrder({...order,target:Number(e.target.value)})}><option value={-1}>Select linked system</option>{context.stars.filter(s=>s.known&&linked(order.source,s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
   {['move','build','scoutbuild'].includes(order.kind)&&<label>Maneuver ships<input type="number" min="1" max="100" value={order.ships} onChange={e=>setOrder({...order,ships:Number(e.target.value)})}/></label>}
   {order.kind==='move'&&<p role="status">{availableShips} ships available, excluding this item.</p>}
   {order.kind==='recon'&&<label>Maneuver mission<select value={order.mission} onChange={e=>setOrder({...order,mission:e.target.value})}>{['distant','close','deep'].map(m=><option key={m} value={m}>{m}</option>)}</select></label>}
  </fieldset></div>
  {issues.map(issue=><p role="status" className="error" key={issue}>{issue}</p>)}{error&&<p role="alert" className="error">{error}</p>}
  <div className="dialogActions"><button className="quiet" aria-label="Close edit" onClick={onClose}>Close</button><button className="quiet" onClick={onClose}>Cancel</button><button disabled={busy||issues.length>0} onClick={()=>void save()}>{busy?'Checking edit…':'Save maneuver'}</button></div>
 </dialog>;
}
