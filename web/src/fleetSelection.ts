import type {PlanetStats} from './PlanetDialog';
export const hulls=[{id:'interceptor',label:'Interceptor',cost:5,counters:'Torpedo boats and bombers'},
 {id:'torpedo',label:'Torpedo boat',cost:10,counters:'Cruisers and disruptors'},
 {id:'cruiser',label:'Cruiser',cost:15,counters:'Interceptors and bombers'},
 {id:'bomber',label:'Bomber',cost:12,counters:'Torpedo boats and disruptors'},
 {id:'disruptor',label:'Disruptor',cost:8,counters:'Interceptors and cruisers'}];
export type Order={kind:string;source:number;target:number;ships:number;mission?:string;hull?:string};
export type Star={statistics?:PlanetStats;id:number;name:string;x:number;y:number;known:boolean;visible:boolean;owner:number|null;collectors:number|null;ships:number[]|null;scouts:number[]|null;defense:number|null;fleets:number[][]|null};
export const linked=(a:number,b:number)=>a!==b&&(Math.abs(a-b)===1||Math.abs(a-b)===6)&&!(Math.min(a,b)===5&&Math.max(a,b)===6);
export function available(star:Star,team:number,typed:boolean,index:number,draft:Order[]){
 const existing=typed?(star.fleets?.[team]?.[index]??0):(star.ships?.[team]??0);
 return Math.max(0,existing-draft.filter(o=>o.kind==='move'&&o.source===star.id&&(!typed||(o.hull??'interceptor')===hulls[index]?.id)).reduce((n,o)=>n+o.ships,0));
}
export const emptySelection=(typed:boolean)=>Array<string>(typed?5:1).fill('0');
export function selectionAtSource(stars:Star[],source:number,typed:boolean){
 return {target:stars.find(s=>s.known&&linked(source,s.id))?.id??-1,counts:emptySelection(typed)};
}
type Issue={code:'source'|'destination'|'count'|'inventory'|'exhausted'|'per-order'|'order-limit'|'empty';message:string;row?:number};
export function validateExpedition({stars,source,target,team,typed,draft,counts}:{stars:Star[];source:number;target:number;team:number;typed:boolean;draft:Order[];counts:string[]}){
 const issues:Issue[]=[];
 const star=stars.find(s=>s.id===source),rows=typed?hulls:[{id:'ships',label:'Ships'}];
 const selected=counts.map(Number);
 if(!star?.visible)issues.push({code:'source',message:'Select a currently observed source with your ships.'});
 if(!stars.some(s=>s.id===target&&s.known&&linked(source,target)))issues.push({code:'destination',message:'Select a charted system linked to this source.'});
 if(counts.length!==rows.length)issues.push({code:'count',message:'Fleet selection does not match this campaign’s ship types. Reopen the selector.'});
 rows.forEach((row,i)=>{
  const n=selected[i],remaining=star?available(star,team,typed,i,draft):0;
  if(!Number.isInteger(n)||n<0)issues.push({code:'count',row:i,message:`${row.label}: enter a whole number of zero or more.`});
  else if(n>100)issues.push({code:'per-order',row:i,message:`${row.label}: maximum 100 ships per movement order.`});
  else if(n>remaining)issues.push({code:remaining===0?'exhausted':'inventory',row:i,message:remaining===0?`${row.label}: no ships remain available after drafted departures.`:`${row.label}: only ${remaining} available after drafted departures; ${n} selected.`});
 });
 const requiredOrders=selected.filter(n=>Number.isInteger(n)&&n>0).length;
 if(requiredOrders===0)issues.push({code:'empty',message:'Select at least one ship to send.'});
 if(draft.length+requiredOrders>24)issues.push({code:'order-limit',message:`Turn order limit: ${draft.length} of 24 slots already used. This expedition needs ${requiredOrders}; remove drafted orders or select fewer ship types.`});
 const orders:Order[]=issues.length?[]:selected.flatMap((n,i)=>n?[{kind:'move',source,target,ships:n,...(typed?{hull:rows[i].id}:{})}]:[]);
 return {issues,orders,valid:issues.length===0,total:selected.filter(n=>Number.isFinite(n)&&n>=0).reduce((a,b)=>a+b,0)};
}
