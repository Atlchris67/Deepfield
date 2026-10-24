import type {StarLink} from './fleetSelection';

export type GalaxyItem={key:string;name:string;position:[number,number,number];kind:string;campaignId?:number;title:string};

/** The catalog is in parsecs. Keep an outside view of the entire selected volume. */
export function frameDistance(items:GalaxyItem[]){return Math.max(26,...items.map(item=>Math.hypot(...item.position)*3.7));}

/** Only persisted campaign links become routes. Catalog proximity cannot create travel rules. */
export function routeVertices(items:GalaxyItem[],links?:StarLink[]|null){
 const byId=new Map(items.filter(item=>item.campaignId!==undefined).map(item=>[item.campaignId!,item]));
 const vertices:Array<[number,number,number]>=[];
 for(const link of links??[]){const a=byId.get(link.from),b=byId.get(link.to);if(a&&b)vertices.push(a.position,b.position);}
 return vertices;
}
