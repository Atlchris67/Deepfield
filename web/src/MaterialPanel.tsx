export const materialNames=['Ferrite','Vardite','Ceryth','Neralite','Soryl','Avenite'];
const names=materialNames;
const roles=['Structures and hulls','Armor and defenses','Electronics and collectors','Propellant and ships','Field systems and collectors','Rare infrastructure catalyst'];

export function MaterialPanel({stock,accessible,mines,settlement,yieldByMaterial,local,gate,freighters,focus}:{stock:number[]|null|undefined;accessible:number[]|null|undefined;mines:number|null|undefined;settlement:number|null|undefined;yieldByMaterial:number[]|null|undefined;local:boolean;gate:boolean|null|undefined;freighters:number|null|undefined;focus:number}){
 return <section className="panel" aria-label="Clan material stockpile"><div className="panelTitle"><h2>Clan materials</h2><span>{local?'SELECTED SYSTEM':'SHARED POOL'}</span></div>
  <p>Fictional materials come from surveyed worlds. Each cataloged planet yields one kind; mines and settlement size multiply production. {local?'Stock stays local until freighters carry it or paired gates connect owned systems.':'Stock is pooled across the clan for this campaign.'}</p>
  {stock?<ul>{names.map((name,index)=><li key={name}><strong>{name}: {stock[index]??0}</strong> — {roles[index]}</li>)}</ul>:<p>Select an owned system to inspect its stockpile.</p>}
  {local&&accessible&&<p>Available for orders here: {names.map((name,index)=>`${name} ${accessible[index]??0}`).join(' · ')}.</p>}
  {local&&<p>Gate: {gate?'operational':'none'} · Freighters: {freighters??'unobserved'}. Remote spending requires linked operational gates at both ends.</p>}
  <p>Clan tradeoff: {focus} · material output factor {25*(4+focus)}% (rounded per planet); generic ship price {5+focus} credits.</p>
  <p>Selected system: {mines==null?'unobserved':`${mines} mines, settlement size ${settlement}`}. {yieldByMaterial?`Current structures produce per resolved turn: ${yieldByMaterial.map((amount,index)=>`${amount} ${names[index]}`).join(', ')}.`:'Production unknown.'} Mines and settlement size multiply output from existing material sites; they do not create a missing material type. Orders spend stock before that turn's production is added. Ships use Ferrite and Neralite; scouts use Ceryth and Neralite; collectors use Ceryth and Soryl.</p>
 </section>;
}
