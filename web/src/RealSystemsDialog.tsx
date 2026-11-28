import {useEffect,useId,useMemo,useRef,useState} from 'react';
import './visual-pass.css';
import {Simulation,Ephem,THREE} from 'spacekit.js';
import snapshot from './realSystems.json';
import type {CatalogSystem} from './StarMapSetupDialog';
import {hulls,type Star,type StarLink} from './fleetSelection';
import {latestMaterialSurvey,type Intel} from './IntelligencePanel';
import {materialNames} from './MaterialPanel';
import {campaignVector,catalogVector} from './realSkyProjection';
import {SpacekitGalaxy} from './SpacekitGalaxy';
import {PlanetDetail} from './PlanetDetail';
import {illustrativeSurface} from './illustrativeSurface';
import type {GalaxyItem} from './galaxySceneData';

type Host={id:number;name:string;raDeg:number;decDeg:number;distancePc:number;temperatureK:number|null;planets:Array<{name:string;periodDays:number;semiMajorAu:number;radiusEarth:number|null}>;starId?:number;reference:boolean;astronomical:boolean};
const marker='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=';
const tabs=['orbit','resources','ships','defenses'] as const;
// Inhabitants of a colony the clan can see. Growth and habitability are only sent for the clan's own colonies.
export const inhabitantsText=(star:{inhabitants?:number|null;inhabitantGrowth?:number|null;habitability?:number|null})=>`${star.inhabitants} of 100`+(star.inhabitantGrowth==null?'':star.inhabitants===100?', full':`, growing by ${star.inhabitantGrowth} a turn`)+(star.habitability==null?'':` (habitability ${star.habitability}/100)`);
type SystemTab=(typeof tabs)[number];
const measured=(value:number|null|undefined)=>value==null?'Unknown':String(value);

export function RealSystemsDialog({allies,clanNames,onClose,catalog,stars,links,team,intelligence,onSelect,onOpenStatistics,embedded=false,fictional=false,mapWidth=100,mapHeight=100}:{allies?:number[];clanNames?:string[];onClose:()=>void;catalog?:CatalogSystem[]|null;stars?:Star[];links?:StarLink[]|null;team?:number;intelligence?:Intel[];onSelect?:(id:number)=>void;onOpenStatistics?:(id:number)=>void;embedded?:boolean;fictional?:boolean;mapWidth?:number;mapHeight?:number}){
 const dialog=useRef<HTMLDialogElement>(null),orbit=useRef<HTMLDivElement>(null),details=useRef<HTMLElement>(null);
 const tabButtons=useRef<Record<SystemTab,HTMLButtonElement|null>>({orbit:null,resources:null,ships:null,defenses:null}),tabId=useId(),titleId=useId();
 const simulation=useRef<Simulation|null>(null),objects=useRef<ReturnType<Simulation['createSphere']>[]>([]);
 const orbitDecor=useRef<InstanceType<typeof THREE.Object3D>[]>([]),orbitMaterials=useRef<InstanceType<typeof THREE.Material>[]>([]),orbitTextures=useRef<InstanceType<typeof THREE.Texture>[]>([]);
 const orbitPointer=useRef<{x:number;y:number}|null>(null);
 const [activeTab,setActiveTab]=useState<SystemTab>('orbit');
 const [activePlanet,setActivePlanet]=useState<number|null>(null);
 const planetButtons=useRef<Array<HTMLButtonElement|null>>([]),returnToPlanet=useRef<number|null>(null);
 const closePlanet=()=>{returnToPlanet.current=activePlanet;setActivePlanet(null);};
 useEffect(()=>{
  if(activePlanet!==null||returnToPlanet.current===null)return;
  const index=returnToPlanet.current;returnToPlanet.current=null;
  if(activeTab==='orbit')planetButtons.current[index]?.focus();
 },[activePlanet,activeTab]);
 const hosts=useMemo<Host[]>(()=>{
  const reference=(catalog??snapshot.systems).map((item,index)=>({...item,id:index,temperatureK:item.temperatureK??null,starId:!fictional&&catalog&&stars?.some(star=>star.id===index)?index:undefined,reference:fictional||!catalog,astronomical:true}));
  return fictional&&stars?[...reference,...stars.map(star=>({...campaignVector(star,mapWidth,mapHeight),id:star.id,name:star.name,temperatureK:null,planets:[],starId:star.id,reference:false,astronomical:false}))]:reference;
 },[catalog,stars,fictional,mapWidth,mapHeight]);
 const [selected,setSelected]=useState(()=>{const home=stars?.find(star=>star.owner===team)?.id;return home===undefined?0:Math.max(0,hosts.findIndex(host=>!host.reference&&host.starId===home));}),[renderError,setRenderError]=useState('');
 const [orbitZoom,setOrbitZoom]=useState(1),host=hosts[selected]??hosts[0],campaign=fictional||!!catalog;
 const selectedStar=host.starId===undefined?undefined:stars?.find(star=>star.id===host.starId),stats=selectedStar?.statistics;
 const lastMaterialSurvey=host.starId===undefined?undefined:latestMaterialSurvey(intelligence,host.starId);
 const materialSurvey=lastMaterialSurvey?.materialSurvey??stats?.materialSurvey;
 const currentOwn=!!(selectedStar?.visible&&selectedStar.owner===team&&stats?.knowledge==='current');
 const knowledge=stats?.knowledge==='historical'?`Last observed on turn ${stats.turn}; current values may differ.`:stats?.knowledge==='current'?`Current observation from turn ${stats.turn}.`:selectedStar?.known?'Charted; no measured system statistics.':'Uncharted; statistics unknown.';
 const tabKey=(event:React.KeyboardEvent<HTMLButtonElement>,tab:SystemTab)=>{const index=tabs.indexOf(tab);let next:SystemTab|undefined;if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];else if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];else if(event.key==='Home')next=tabs[0];else if(event.key==='End')next=tabs[tabs.length-1];if(next){event.preventDefault();setActiveTab(next);setActivePlanet(null);tabButtons.current[next]?.focus();}};
 const lastOwnerReport=(id:number)=>intelligence?.filter(item=>item.star===id&&item.ownerObserved).sort((a,b)=>b.turn-a.turn)[0];
 const state=(id:number)=>{const starId=hosts[id]?.starId,star=stars?.find(item=>item.id===starId);if(!star)return 'reference';if(star.visible&&star.owner===team)return 'own';if(star.visible&&star.owner!==null)return allies?.includes(star.owner)?'ally':'enemy';if(star.visible)return 'scouted';const report=lastOwnerReport(star.id);if(report)return report.owner!==null&&report.owner!==team?'reported-enemy':'scouted';return 'unknown';};
 // With three or four clans the marker's tooltip names the clan that holds a system you can currently see.
 const holder=(starId?:number)=>{const star=stars?.find(item=>item.id===starId);return (clanNames?.length??0)>2&&star?.visible&&star.owner!==null&&star.owner!==team?` — held by ${clanNames![star.owner]}${allies?.includes(star.owner)?', your ally':''}`:'';};
 const select=(id:number)=>{setSelected(id);setActivePlanet(null);const starId=hosts[id]?.starId;if(starId!==undefined)onSelect?.(starId);};
 const galaxyItems=useMemo<GalaxyItem[]>(()=>hosts.map((item,index)=>{const vector=catalogVector(item),kind=state(index);return {key:String(index),name:item.name,position:[vector.x,vector.y,vector.z],kind,campaignId:item.starId,title:item.reference?`${item.name} — ${item.distancePc.toFixed(2)} parsecs from the Sun`:item.name+holder(item.starId)};}),[hosts,stars,team,intelligence,allies,clanNames]);

 useEffect(()=>{
  if(embedded)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null,element=dialog.current!,overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return()=>{element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[embedded]);
 const clearOrbitArtwork=()=>{const sim=simulation.current;for(const object of orbitDecor.current)sim?.getScene().remove(object);for(const material of orbitMaterials.current)material.dispose();for(const texture of orbitTextures.current)texture.dispose();orbitDecor.current=[];orbitMaterials.current=[];orbitTextures.current=[];};
 useEffect(()=>()=>{const sim=simulation.current;if(sim){clearOrbitArtwork();sim.stop();(sim as unknown as {renderEnabled:boolean}).renderEnabled=false;sim.getViewer().get3jsCameraControls().dispose();sim.getRenderer().dispose();orbit.current?.replaceChildren();}},[]);
 useEffect(()=>{
  const target=orbit.current;
  if(!target||!host.astronomical){const old=simulation.current;if(old){clearOrbitArtwork();old.stop();(old as unknown as {renderEnabled:boolean}).renderEnabled=false;old.getViewer().get3jsCameraControls().dispose();old.getRenderer().dispose();simulation.current=null;objects.current=[];}return;}
  try{
   const sim=simulation.current??new Simulation(target as unknown as HTMLCanvasElement,{basePath:'/',particleTextureUrl:marker,jdPerSecond:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:8,camera:{initialPosition:[0,-3.2,1.4],enableDrift:false}});
   simulation.current=sim;
   sim.getRenderer().setClearColor(0x071722,1);
   clearOrbitArtwork();
   for(const object of objects.current)sim.removeObject(object);
   const warm=!!(host.temperatureK&&host.temperatureK<4000),starColor=warm?0xffb285:0xffe5b8;
   const ambient=new THREE.AmbientLight(0x8faec1,.75),sunlight=new THREE.PointLight(starColor,18,12,1.5);
   sunlight.position.set(0,0,0);sim.getScene().add(ambient,sunlight);orbitDecor.current.push(ambient,sunlight);
   const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=128;const haloContext=haloCanvas.getContext('2d')!;
   const gradient=haloContext.createRadialGradient(64,64,5,64,64,63);gradient.addColorStop(0,'#ffffffbb');gradient.addColorStop(.17,warm?'#ffb88588':'#ffedbd88');gradient.addColorStop(1,'#ffffff00');haloContext.fillStyle=gradient;haloContext.fillRect(0,0,128,128);
   const haloTexture=new THREE.CanvasTexture(haloCanvas),haloMaterial=new THREE.SpriteMaterial({map:haloTexture,transparent:true,depthWrite:false,opacity:.72}),halo=new THREE.Sprite(haloMaterial);halo.scale.set(.9,.9,1);sim.getScene().add(halo);orbitDecor.current.push(halo);orbitMaterials.current.push(haloMaterial);orbitTextures.current.push(haloTexture);
   const star=sim.createSphere(`star-${selected}`,{position:[0,0,0],radius:.16,color:starColor});
   objects.current=[star];
   host.planets.forEach((planet,index)=>{
    // Period and semimajor axis are catalog data; circular plane and phase are illustrative.
    const displayAu=.25+Math.sqrt(Math.max(0,planet.semiMajorAu))*1.15;
    const ephem=new Ephem({a:displayAu,e:0,i:0,om:0,w:0,ma:index*137.5,period:planet.periodDays,epoch:sim.getJd()},'deg');
    const body=sim.createSphere(`planet-${selected}-${index}`,{ephem,radius:.075,color:0xffffff});
    const texture=illustrativeSurface(planet.name),material=new THREE.MeshStandardMaterial({map:texture,roughness:.88,metalness:0});
    for(const object of body.get3jsObjects())object.traverse((child:InstanceType<typeof THREE.Object3D>)=>{if(child instanceof THREE.Mesh)child.material=material;});
    orbitTextures.current.push(texture);orbitMaterials.current.push(material);
    body.orbitAround(star);objects.current.push(body);
   });
   setRenderError('');
  }catch(reason){setRenderError(reason instanceof Error?reason.message:'3D rendering unavailable.');}
 },[selected,host.astronomical]);
 useEffect(()=>{const sim=simulation.current;if(!sim)return;const viewer=sim.getViewer(),camera=viewer.get3jsCamera(),controls=viewer.get3jsCameraControls();camera.position.sub(controls.target).setLength(Math.hypot(3.2,1.4)/orbitZoom).add(controls.target);controls.update();},[orbitZoom,selected]);
 useEffect(()=>{const target=orbit.current;if(!target)return;const observer=new ResizeObserver(()=>{const sim=simulation.current;if(!sim)return;const width=target.clientWidth,height=target.clientHeight;if(width===0||height===0)return;sim.getRenderer().setSize(width,height,false);const camera=sim.getViewer().get3jsCamera();camera.aspect=width/height;camera.updateProjectionMatrix();});observer.observe(target);return()=>observer.disconnect();},[host.astronomical]);
 const openOrbitPlanet=(event:React.PointerEvent<HTMLDivElement>)=>{const start=orbitPointer.current;orbitPointer.current=null;const sim=simulation.current,target=orbit.current;if(!start||!sim||!target||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
  const box=target.getBoundingClientRect(),point=new THREE.Vector2((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(point,sim.getViewer().get3jsCamera());
  const hits=objects.current.slice(1).map((body,index)=>({index,distance:ray.intersectObjects(body.get3jsObjects().slice(0,1),true)[0]?.distance??Infinity})).sort((a,b)=>a.distance-b.distance);
  if(hits[0]&&Number.isFinite(hits[0].distance))setActivePlanet(hits[0].index);
 };

 const content=<>
  <div className="starMapHeader"><div><small>{fictional?'REAL STARS + FICTIONAL CAMPAIGN':'OBSERVED MILKY WAY SYSTEMS'}</small><h2 id={titleId}>{fictional?'Campaign sky':'Real star and planet atlas'}</h2></div>{!embedded&&<button className="quiet" onClick={onClose}>Close atlas</button>}</div>
  <p>{fictional?'Real catalog stars are reference markers. Your saved campaign systems remain separate fictional locations with illustrative depth and their original identities.':"24 nearby confirmed planet hosts in a Spacekit 3D scene. Grab to rotate; catalog distances set each star's position."} {campaign?'Routes show saved one-turn jumps between playable systems. Ownership and scouting detail follow your clan knowledge. Red markers from reports are historical.':'This reference atlas does not change your campaign.'}</p>
  {campaign&&host.starId!==undefined&&state(selected)==='reported-enemy'&&<p role="status">Enemy ownership last observed on turn {lastOwnerReport(host.starId)?.turn}; current ownership is unconfirmed.</p>}
  <div className="realSystemsGrid">
   <SpacekitGalaxy items={galaxyItems} links={campaign?links:null} selected={String(selected)} onActivate={key=>select(Number(key))} embedded={embedded}/>
   <section ref={details} className="realSystemDetails" aria-label={`Selected system: ${host.name}`}>
    <label>Choose star system<select value={selected} onChange={event=>select(Number(event.target.value))}>{hosts.map((item,index)=><option key={index} value={index}>{item.name}{item.reference&&fictional?' (reference)':''}</option>)}</select></label>
    <h3>{host.name}</h3><p>{host.reference?`${host.distancePc.toFixed(2)} parsecs from the Sun · Reference star, not a system in this campaign.`:host.astronomical?`${host.distancePc.toFixed(2)} parsecs from the Sun · ${host.planets.length} cataloged planet${host.planets.length===1?'':'s'}`:'Fictional campaign system at its saved map location.'}</p>
    <p className="systemKnowledge">{host.starId===undefined?'Reference astronomy only; no campaign statistics.':knowledge}</p>
    {host.starId!==undefined&&onOpenStatistics&&<button type="button" className="secondary" onClick={()=>onOpenStatistics(host.starId!)}>Open full system statistics</button>}
    <div className="systemTabs" role="tablist" aria-label="Selected system sections">{tabs.map(tab=><button key={tab} ref={node=>{tabButtons.current[tab]=node;}} type="button" role="tab" id={`${tabId}-${tab}`} aria-controls={`${tabId}-${tab}-panel`} aria-selected={activeTab===tab} tabIndex={activeTab===tab?0:-1} onClick={()=>{setActiveTab(tab);setActivePlanet(null);}} onKeyDown={event=>tabKey(event,tab)}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}</div>
    <section id={`${tabId}-orbit-panel`} role="tabpanel" aria-labelledby={`${tabId}-orbit`} hidden={activeTab!=='orbit'}>
     {activePlanet!==null&&host.planets[activePlanet]&&<PlanetDetail planet={host.planets[activePlanet]} onClose={closePlanet}/>}<div hidden={activePlanet!==null}>{host.astronomical?<><div className="orbitZoomControls" aria-label="Orbital zoom"><button type="button" aria-label="Zoom orbit out" disabled={orbitZoom===1} onClick={()=>setOrbitZoom(value=>Math.max(1,value-.25))}>-</button><span>{Math.round(orbitZoom*100)}%</span><button type="button" aria-label="Zoom orbit in" disabled={orbitZoom===3} onClick={()=>setOrbitZoom(value=>Math.min(3,value+.25))}>+</button><button type="button" onClick={()=>setOrbitZoom(1)}>Reset orbit</button></div>
      <div ref={orbit} className="realOrbit" role="img" aria-label={`Spacekit orbital view of ${host.name} and its cataloged planets; click a planet or use its button below`} onPointerDown={event=>{orbitPointer.current={x:event.clientX,y:event.clientY};}} onPointerUp={openOrbitPlanet} onPointerCancel={()=>{orbitPointer.current=null;}}/>{renderError&&<p role="alert">Spacekit view unavailable: {renderError}</p>}
      <ul>{host.planets.map((planet,index)=><li key={planet.name}><button ref={node=>{planetButtons.current[index]=node;}} type="button" className="planetCTA" aria-label={`Open ${planet.name} planet details`} onClick={()=>setActivePlanet(index)}>{planet.name}</button>{currentOwn&&selectedStar?.homePlanetId===index&&<span> - clan homeworld</span>} - {planet.periodDays.toFixed(2)} day orbit - {planet.semiMajorAu.toFixed(3)} AU{planet.radiusEarth!=null?` - estimated ${planet.radiusEarth.toFixed(2)} Earth radii`:' - radius unknown'}</li>)}</ul>
      <p className="realDataNote">Catalog periods and distances are shown above. Orbital spacing, circular paths, phases, planet sizes and surfaces in this view are illustrative.</p></>:<p>This saved fictional system has no cataloged real planets or orbital elements. Its identity and location remain unchanged.</p>}</div>
    </section>
    <section id={`${tabId}-resources-panel`} role="tabpanel" aria-labelledby={`${tabId}-resources`} hidden={activeTab!=='resources'}>
     <dl className="systemFacts">{selectedStar?.inhabitants!=null&&<div><dt>Inhabitants</dt><dd>{inhabitantsText(selectedStar)}</dd></div>}<div><dt>Material output</dt><dd>{currentOwn&&selectedStar?.materialYield?materialNames.map((name,index)=>`${name} ${measured(selectedStar.materialYield?.[index])} / turn`).join(' · '):'Not measured'}</dd></div><div><dt>Deep material survey</dt><dd>{materialSurvey?`${materialNames.map((name,index)=>materialSurvey[index]?`${name}: ${materialSurvey[index]} planet${materialSurvey[index]===1?'':'s'}`:null).filter(Boolean).join(', ')||'No cataloged material sites'}${lastMaterialSurvey?` (observed turn ${lastMaterialSurvey.turn})`:''}`:'Unknown'}</dd></div><div><dt>Mines</dt><dd>{currentOwn?measured(selectedStar?.mines):'Unknown'}</dd></div><div><dt>Settlement size</dt><dd>{currentOwn?measured(selectedStar?.settlementSize):'Unknown'}</dd></div><div><dt>Collectors</dt><dd>{measured(stats?.collectors)}</dd></div><div><dt>Colony income</dt><dd>{stats?.colonyIncome==null?'Unknown':`${stats.colonyIncome} credits / turn`}</dd></div><div><dt>Local stockpile</dt><dd>{currentOwn&&selectedStar?.stockpile?materialNames.map((name,index)=>`${name} ${measured(selectedStar.stockpile?.[index])}`).join(' · '):'Not measured'}</dd></div></dl><p>Surveyed material types are a dated observation. Current production and stockpiles remain unknown outside your own observed systems.</p>
    </section>
    <section id={`${tabId}-ships-panel`} role="tabpanel" aria-labelledby={`${tabId}-ships`} hidden={activeTab!=='ships'}>
     {stats?.fleets.length?stats.fleets.map(fleet=><section className="systemFleet" key={fleet.team}><h4>Clan {fleet.team+1}</h4><p>Combat ships: {measured(fleet.combatShips)} · Scouts: {measured(fleet.scouts)} · Total: {measured(fleet.totalShips)}</p>{fleet.composition&&<ul>{hulls.map((hull,index)=><li key={hull.id}>{hull.label}: {measured(fleet.composition?.[index])}</li>)}</ul>}</section>):<p>{stats?.knowledge==='current'?'No ships observed.':'No ship measurements available.'}</p>}
    </section>
    <section id={`${tabId}-defenses-panel`} role="tabpanel" aria-labelledby={`${tabId}-defenses`} hidden={activeTab!=='defenses'}>
     <dl className="systemFacts"><div><dt>Fixed defense strength</dt><dd>{measured(stats?.defense)}</dd></div><div><dt>Operational gate</dt><dd>{currentOwn&&selectedStar?.gate!=null?(selectedStar.gate?'Yes':'No'):'Unknown'}</dd></div></dl><p>Reported defenses may be stale. Unknown is not zero.</p>
    </section>
   </section>
  </div>
  {!fictional&&<p className="realDataNote">Orbit sizes are compressed; periods use catalog values. Circular paths and starting phases are illustrative because this snapshot does not contain complete orbital elements. Planet colors and sizes are visual markers, not measured surfaces. <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">NASA Exoplanet Archive source</a> - Retrieved {snapshot.retrievedUtc.slice(0,10)}.</p>}
 </>;
 return embedded?<section className="realSystemsDialog inlineRealSky" aria-labelledby={titleId}>{content}</section>:<dialog ref={dialog} className="realSystemsDialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(activePlanet!==null)closePlanet();else onClose();}}>{content}</dialog>;
}
