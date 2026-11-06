import {useEffect,useState} from 'react';
import {hulls,type Order,type Star} from './fleetSelection';

const packages=[
 {id:'standard',name:'Standard',detail:'Current counter profile; no bonus.',materials:'No material fee'},
 {id:'assault',name:'Assault',detail:'One extra attack shot per four ships of this hull.',materials:'2 Ceryth, 1 Neralite'},
 {id:'reinforced',name:'Defence',detail:'Absorbs one salvo loss per four ships of this hull.',materials:'2 Ferrite, 1 Vardite'},
 {id:'assault-reinforced',name:'Assault + Defence',detail:'One extra attack shot and one absorbed salvo loss per four ships of this hull.',materials:'2 Ferrite, 1 Vardite, 2 Ceryth, 1 Neralite'}
] as const;

const shipRoles:Record<string,{purpose:string;weakness:string}>={
 interceptor:{purpose:'Cheap escort and colony ship. Counters torpedo boats and bombers; two survivors can found a colony.',weakness:'Cruisers and disruptors counter it.'},
 torpedo:{purpose:'Strike hull for cruiser and disruptor fleets.',weakness:'Interceptors and bombers counter it.'},
 cruiser:{purpose:'Heavy hull for fighting interceptors and bombers.',weakness:'Torpedo boats and disruptors counter it.'},
 bomber:{purpose:'Attack hull for torpedo boat and disruptor fleets.',weakness:'Interceptors and cruisers counter it.'},
 disruptor:{purpose:'Flexible counter to interceptor and cruiser fleets.',weakness:'Torpedo boats and bombers counter it.'}
};

function ShipPreview({hull,packageId}:{hull:string;packageId:string}){
 return <div className={`shipPreview shipPreview--${packageId}`} role="img" aria-label={`${hull} concept with ${packageId} package preview`}>
  <img src={`/ships/${hull}${packageId==='standard'?'':`-${packageId}`}.png`} alt="" loading="lazy"/>
  <span className="shipPreviewCaption">{packageId==='assault'?'Extra weapon mounts':packageId==='reinforced'?'Armor plating':packageId==='assault-reinforced'?'Weapons + armor':'Standard hull'}</span>
 </div>;
}

export function ShipDesignPanel({stars,team,designs,draft,closed,onAdd}:{stars:Star[];team:number;designs:string[];draft:Order[];closed:boolean;onAdd:(order:Order)=>void}){
 const owned=stars.filter(star=>star.owner===team);
 const [source,setSource]=useState(owned[0]?.id??-1);
 const [chosen,setChosen]=useState<string[]>(()=>[...designs]);
 useEffect(()=>{if(!owned.some(star=>star.id===source))setSource(owned[0]?.id??-1);},[owned,source]);
 useEffect(()=>{setChosen([...designs]);},[designs.join('|')]);
 return <section className="panel shipDesignPanel" aria-label="Ship design"><div className="panelTitle"><h2>Ship design</h2><span>FLEET PACKAGES</span></div>
  <p>Each hull has one clan-wide package. A design order costs 12 credits plus the listed materials at the chosen colony. It takes effect after this turn's battles, including for ships already built. Existing campaigns begin on Standard.</p>
  <label>Design yard<select value={source} onChange={event=>setSource(Number(event.target.value))}>{owned.map(star=><option key={star.id} value={star.id}>{star.name}</option>)}</select></label>
  <div className="shipDesignList">{hulls.map((hull,index)=>{
   const current=designs[index]??'standard',selection=chosen[index]??current;
   const queued=draft.some(order=>order.kind==='refit'&&order.hull===hull.id);
   const selected=packages.find(packageOption=>packageOption.id===selection)!;
   return <div className="shipDesignRow" key={hull.id}><div><strong>{hull.label}</strong><small>{hull.cost} credits per ship · Current: {current}</small></div>
    <ShipPreview hull={hull.id} packageId={selection}/>
    <div className="shipDesignRole"><p><strong>Why build:</strong> {shipRoles[hull.id].purpose}</p><p><strong>Watch for:</strong> {shipRoles[hull.id].weakness}</p></div>
    <label>Package<select aria-label={`${hull.label} package`} value={selection} onChange={event=>setChosen(previous=>previous.map((value,i)=>i===index?event.target.value:value))}>{packages.map(packageOption=><option value={packageOption.id} key={packageOption.id}>{packageOption.name}</option>)}</select></label>
    <p>{selected.detail} Adoption: 12 credits, {selected.materials}.</p>
    <button type="button" disabled={closed||!owned.some(star=>star.id===source)||selection===current||queued} onClick={()=>onAdd({kind:'refit',source,target:-1,ships:0,hull:hull.id,package:selection})}>{queued?'Package change drafted':'Add package change to draft'}</button>
   </div>;
  })}</div>
 </section>;
}
