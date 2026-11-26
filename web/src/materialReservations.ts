import {linked,type Order,type Star,type StarLink} from './fleetSelection';

export const materialNames=['Ferrite','Vardite','Ceryth','Neralite','Soryl','Avenite'] as const;
type Context={stars:Star[];team:number;realCatalogVersion?:number|null;mode?:string|null;logisticsVersion?:number;materials?:number[]|null;links?:StarLink[]|null};
export type MaterialReservation={orderIndex:number;source:string;material:string;orderCost:number;reservedBefore:number;required:number;available:number|null;shortfall:number;stockScope:string;guidance?:string};

function shortageGuidance(context:Context,source:Star,materialIndex:number):string{
 if(context.logisticsVersion!==1)return 'Reduce this order or produce more before the next turn.';
 const connected=new Set(access(context,source).map(star=>star.id));
 const nearby=context.stars.find(star=>star.owner===context.team&&!connected.has(star.id)&&linked(source.id,star.id,context.links)&&(star.stockpile?.[materialIndex]??0)>0);
 if(nearby){
  if((nearby.freighters??0)>0)return `Send ${materialNames[materialIndex]} from ${nearby.name} with a freighter to ${source.name}; cargo becomes usable next turn.`;
  return `${nearby.name} has ${materialNames[materialIndex]}, but needs a freighter to deliver it to ${source.name}.`;
 }
 if((source.materialYield?.[materialIndex]??0)>0)return `${source.name} produces ${materialNames[materialIndex]} after turn resolution; reduce this order or wait for that stock.`;
 return `No linked owned system has known ${materialNames[materialIndex]} stock. Survey or claim a source, then transport it here or connect operational gates.`;
}

function cost(order:Order):number[]{
 const n=Number.isInteger(order.ships)&&order.ships>0?order.ships:0;
 switch(order.kind){
  case 'build':return [n,0,0,n,0,0];
  case 'scoutbuild':return [0,0,n,n,0,0];
  case 'defense':return [2,1,0,0,0,0];
  case 'collector':return [0,0,1,0,1,0];
  case 'mine':return [2,0,0,0,0,0];
  case 'settlement':return [2,0,0,0,0,1];
  case 'freighter':return [2*n,0,n,2*n,0,0];
  case 'gate':return [4,0,2,0,0,2];
  case 'refit':return order.package==='assault'?[0,0,2,1,0,0]:order.package==='reinforced'?[2,1,0,0,0,0]:order.package==='assault-reinforced'?[2,1,2,1,0,0]:[0,0,0,0,0,0];
  case 'transport':return order.cargo?.length===materialNames.length&&order.cargo.every(value=>Number.isInteger(value)&&value>=0)?[...order.cargo]:[0,0,0,0,0,0];
  default:return [0,0,0,0,0,0];
 }
}

function access(context:Context,source:Star):Star[]{
 if(source.owner!==context.team||source.gate!==true)return [source];
 const reached=new Set([source.id]),queue=[source.id];
 for(let index=0;index<queue.length;index++)for(const neighbor of context.stars){
  if(neighbor.owner===context.team&&neighbor.gate===true&&!reached.has(neighbor.id)&&linked(queue[index],neighbor.id,context.links)){
   reached.add(neighbor.id);queue.push(neighbor.id);
  }
 }
 return context.stars.filter(star=>reached.has(star.id)).sort((a,b)=>a.id-b.id);
}

/** Mirrors the saved campaign's pooled or paired-gate reservation scope; the server remains authoritative. */
export function materialReservations(context:Context,orders:Order[]):MaterialReservation[]{
 if(context.realCatalogVersion==null||context.mode==='simple')return [];
 const reserved=new Map<string,number[]>(),result:MaterialReservation[]=[];
 orders.forEach((order,orderIndex)=>{
  const source=context.stars.find(star=>star.id===order.source);
  if(!source)return;
  const network=context.logisticsVersion===1?access(context,source):[];
  const key=context.logisticsVersion===1?`gate:${network[0].id}`:'pool';
  const scope=context.logisticsVersion===1?(network.length===1?`local stock at ${source.name}`:`connected gate stock at ${network.map(star=>star.name).join(', ')}`):'clan pool';
  const prior=reserved.get(key)??Array<number>(materialNames.length).fill(0);
  reserved.set(key,prior);
  const spend=cost(order);
  spend.forEach((orderCost,index)=>{
   if(orderCost===0)return;
   const reservedBefore=prior[index];prior[index]+=orderCost;
   const stock=context.logisticsVersion===1
    ?network.every(star=>star.stockpile?.length===materialNames.length)?network.reduce((sum,star)=>sum+star.stockpile![index],0):null
    :context.materials?.length===materialNames.length?context.materials[index]:null;
   const available=stock!=null&&Number.isFinite(stock)?stock:null;
   const shortfall=available==null?0:Math.max(0,prior[index]-available);
   result.push({orderIndex,source:source.name,material:materialNames[index],orderCost,reservedBefore,required:prior[index],available,
    shortfall,stockScope:scope,guidance:shortfall>0?shortageGuidance(context,source,index):undefined});
  });
 });
 return result;
}

export function materialIssueText(item:MaterialReservation):string{
 return `Order ${item.orderIndex+1} at ${item.source}: ${item.material} requires ${item.required} after other draft reservations; ${item.available} available in ${item.stockScope}; ${item.shortfall} short. ${item.guidance??''}`.trim();
}
