import {available,availableScouts,hulls,linked,type Order,type Star,type StarLink} from './fleetSelection';

export type DraftOrder=Order&{draftId:string;editable:boolean};
export const draftItem=(order:Order,editable=true):DraftOrder=>({...order,draftId:crypto.randomUUID(),editable});
export const wireOrder=({draftId:_,editable:__,...order}:DraftOrder):Order=>order;
export function replaceDraft(draft:DraftOrder[],id:string,order:Order){
 return draft.map(item=>item.draftId===id&&item.editable?{...order,draftId:id,editable:true}:item);
}
export type EditContext={stars:Star[];team:number;combatVersion:number;economyVersion:number;realCatalogVersion?:number|null;mode?:string|null;industrialFocus?:number;logisticsVersion?:number;materials?:number[]|null;credits:number;turn:number;revision:number;deadline:string;winner:number|null;links?:StarLink[]|null};
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
 if(['move','recon'].includes(order.kind)&&!context.stars.some(t=>t.id===order.target&&t.known&&linked(s.id,t.id,context.links)))errors.push('Select a charted system linked to the source.');
 const hullIndex=hulls.findIndex(h=>h.id===(order.hull??'interceptor'));
 if(order.hull&&(!typed||!['move','build'].includes(order.kind)))errors.push('Hull selection requires typed movement or construction.');
 if(typed&&['move','build'].includes(order.kind)&&hullIndex<0)errors.push('Select a valid hull class.');
 if(order.kind==='move'&&hullIndex>=0){const remaining=available(s,context.team,typed,hullIndex,others);if(order.ships>remaining)errors.push(`Only ${remaining} ships available after other draft departures.`);}
 if((order.scouts??0)!==0&&order.kind!=='move')errors.push('Only expeditions can carry scouts.');
 if(order.kind==='move'){
  if(!Number.isInteger(order.scouts??0)||(order.scouts??0)<0||(order.scouts??0)>100)errors.push('Enter 0-100 whole scouts.');
  else if((order.scouts??0)>0&&s.owner!==context.team)errors.push('Scouts must depart from your colony.');
  else if((order.scouts??0)>availableScouts(s,context.team,others))errors.push(`Only ${availableScouts(s,context.team,others)} scouts remain after other drafted orders.`);
 }
 if(order.kind==='recon'){
  if(order.ships!==1||!['distant','close','deep'].includes(order.mission??''))errors.push('Select a valid one-scout mission.');
  if(availableScouts(s,context.team,others)<1)errors.push('Not enough existing scouts after drafted expeditions and reconnaissance.');
 }
 if(order.kind==='defense'&&(context.mode==='simple'||(context.economyVersion!==1&&context.realCatalogVersion==null)||(s.defense??0)+all.filter(o=>o.kind==='defense'&&o.source===s.id).length*2>6))errors.push('Fixed defenses require an owned colony and at most 6 strength.');
 if(order.kind==='mine'&&(context.mode==='simple'||context.realCatalogVersion==null||(s.mines??0)+all.filter(o=>o.kind==='mine'&&o.source===s.id).length>4))errors.push('Mines require a real-system colony; maximum four.');
 if(order.kind==='settlement'&&(context.mode==='simple'||context.realCatalogVersion==null||(s.settlementSize??0)+all.filter(o=>o.kind==='settlement'&&o.source===s.id).length>4))errors.push('Settlement growth requires a real-system colony; maximum size four.');
 if(typed&&order.kind==='build'&&hullIndex>=0&&context.stars.reduce((n,s)=>n+(s.fleets?.[context.team]?.[hullIndex]??0),0)+all.filter(o=>o.kind==='build'&&(o.hull??'interceptor')===hulls[hullIndex].id).reduce((n,o)=>n+o.ships,0)>10000)errors.push('Clan limit: 10,000 ships per hull class.');
 if(!['move','build','scoutbuild','recon','collector','defense','mine','settlement'].includes(order.kind))errors.push('Select a valid action.');
 const cost=all.reduce((n,o)=>n+(o.kind==='collector'?30:o.kind==='defense'?8:o.kind==='mine'?12:o.kind==='settlement'?20:o.kind==='freighter'?10*o.ships:o.kind==='gate'?30:o.kind==='refit'?12:o.kind==='scoutbuild'?o.ships*3:o.kind==='build'?o.ships*((typed?(hulls.find(h=>h.id===(o.hull??'interceptor'))?.cost??5):5)+(context.industrialFocus??0)):0),0);
 if(cost>context.credits)errors.push(`Orders require ${cost} credits; ${context.credits} available; ${cost-context.credits} short.`);
 return errors;
}
