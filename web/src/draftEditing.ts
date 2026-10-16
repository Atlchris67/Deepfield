import {available,hulls,linked,type Order,type Star} from './fleetSelection';

export type DraftOrder=Order&{draftId:string;editable:boolean};
export const draftItem=(order:Order,editable=true):DraftOrder=>({...order,draftId:crypto.randomUUID(),editable});
export const wireOrder=({draftId:_,editable:__,...order}:DraftOrder):Order=>order;
export function replaceDraft(draft:DraftOrder[],id:string,order:Order){
 return draft.map(item=>item.draftId===id&&item.editable?{...order,draftId:id,editable:true}:item);
}
export type EditContext={stars:Star[];team:number;combatVersion:number;economyVersion:number;credits:number;turn:number;revision:number;deadline:string;winner:number|null};
export function validateEdit(context:EditContext,draft:DraftOrder[],id:string,order:Order):string[]{
 const item=draft.find(o=>o.draftId===id);
 if(!item?.editable)return ['Only unsubmitted draft orders can be edited.'];
 if(context.winner!==null||Date.now()>=Date.parse(context.deadline))return ['Orders are closed. Refresh clan orders.'];
 const others=draft.filter(o=>o.draftId!==id),all=replaceDraft(draft,id,order),errors:string[]=[];
 const s=context.stars.find(s=>s.id===order.source),typed=context.combatVersion===1;
 if(!s?.visible)return ['Select an observed source.'];
 if(all.length>24)errors.push('Maximum 24 orders per turn.');
 if(order.kind!=='move'&&s.owner!==context.team)errors.push('This action requires your colony.');
 if(['move','build','scoutbuild'].includes(order.kind)&&(!Number.isInteger(order.ships)||order.ships<1||order.ships>100))errors.push('Enter 1–100 whole ships.');
 if(['move','recon'].includes(order.kind)&&!context.stars.some(t=>t.id===order.target&&t.known&&linked(s.id,t.id)))errors.push('Select a charted system linked to the source.');
 const hullIndex=hulls.findIndex(h=>h.id===(order.hull??'interceptor'));
 if(order.hull&&(!typed||!['move','build'].includes(order.kind)))errors.push('Hull selection requires typed movement or construction.');
 if(typed&&['move','build'].includes(order.kind)&&hullIndex<0)errors.push('Select a valid hull class.');
 if(order.kind==='move'&&hullIndex>=0){const remaining=available(s,context.team,typed,hullIndex,others);if(order.ships>remaining)errors.push(`Only ${remaining} ships available after other draft departures.`);}
 if(order.kind==='recon'){
  if(order.ships!==1||!['distant','close','deep'].includes(order.mission??''))errors.push('Select a valid one-scout mission.');
  if(all.filter(o=>o.kind==='recon'&&o.source===s.id).length>(s.scouts?.[context.team]??0))errors.push('Not enough existing scouts; new scouts fly next turn.');
 }
 if(order.kind==='defense'&&(context.economyVersion!==1||(s.defense??0)+all.filter(o=>o.kind==='defense'&&o.source===s.id).length*2>6))errors.push('Fixed defenses require economy preview and at most 6 strength.');
 if(typed&&order.kind==='build'&&hullIndex>=0&&context.stars.reduce((n,s)=>n+(s.fleets?.[context.team]?.[hullIndex]??0),0)+all.filter(o=>o.kind==='build'&&(o.hull??'interceptor')===hulls[hullIndex].id).reduce((n,o)=>n+o.ships,0)>10000)errors.push('Clan limit: 10,000 ships per hull class.');
 if(!['move','build','scoutbuild','recon','collector','defense'].includes(order.kind))errors.push('Select a valid action.');
 const cost=all.reduce((n,o)=>n+(o.kind==='collector'?30:o.kind==='defense'?8:o.kind==='scoutbuild'?o.ships*3:o.kind==='build'?o.ships*(typed?(hulls.find(h=>h.id===(o.hull??'interceptor'))?.cost??5):5):0),0);
 if(cost>context.credits)errors.push('Orders exceed treasury.');
 return errors;
}
