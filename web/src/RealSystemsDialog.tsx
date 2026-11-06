import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {Simulation,Ephem,THREE} from 'spacekit.js';
import snapshot from './realSystems.json';
import type {CatalogSystem} from './StarMapSetupDialog';
import {hulls,type Star,type StarLink} from './fleetSelection';
import type {Intel} from './IntelligencePanel';
import {materialNames} from './MaterialPanel';
import {campaignVector,catalogVector} from './realSkyProjection';
import {SpacekitGalaxy} from './SpacekitGalaxy';
import {PlanetDetail} from './PlanetDetail';
import type {GalaxyItem} from './galaxySceneData';

type Host={id:number;name:string;raDeg:number;decDeg:number;distancePc:number;temperatureK:number|null;planets:Array<{name:string;periodDays:number;semiMajorAu:number;radiusEarth:number|null}>;starId?:number;reference:boolean;astronomical:boolean};
const marker='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=';
const tabs=['orbit','resources','ships','defenses'] as const;
type SystemTab=(typeof tabs)[number];
const measured=(value:number|null|undefined)=>value==null?'Unknown':String(value);

export function RealSystemsDialog({onClose,catalog,stars,links,team,intelligence,onSelect,onOpenStatistics,embedded=false,fictional=false,mapWidth=100,mapHeight=100}:{onClose:()=>void;catalog?:CatalogSystem[]|null;stars?:Star[];links?:StarLink[]|null;team?:number;intelligence?:Intel[];onSelect?:(id:number)=>void;onOpenStatistics?:(id:number)=>void;embedded?:boolean;fictional?:boolean;mapWidth?:number;mapHeight?:number}){
 const dialog=useRef<HTMLDialogElement>(null),orbit=useRef<HTMLDivElement>(null),details=useRef<HTMLElement>(null);
 const tabButtons=useRef<Record<SystemTab,HTMLButtonElement|null>>({orbit:null,resources:null,ships:null,defenses:null}),tabId=useId();
 const simulation=useRef<Simulation|null>(null),objects=useRef<ReturnType<Simulation['createSphere']>[]>([]);
 const orbitPointer=useRef<{x:number;y:number}|null>(null);
 const [activeTab,setActiveTab]=useState<SystemTab>('orbit');
 const [activePlanet,setActivePlanet]=useState<number|null>(null);
 const hosts=useMemo<Host[]>(()=>{
  const reference=(catalog??snapshot.systems).map((item,index)=>({...item,id:index,temperatureK:item.temperatureK??null,starId:!fictional&&catalog&&stars?.some(star=>star.id===index)?index:undefined,reference:fictional||!catalog,astronomical:true}));
  return fictional&&stars?[...reference,...stars.map(star=>({...campaignVector(star,mapWidth,mapHeight),id:star.id,name:star.name,temperatureK:null,planets:[],starId:star.id,reference:false,astronomical:false}))]:reference;
 },[catalog,stars,fictional,mapWidth,mapHeight]);
 const [selected,setSelected]=useState(()=>fictional?0:Math.max(0,hosts.findIndex(host=>host.starId===stars?.find(star=>star.owner===team)?.id))),[renderError,setRenderError]=useState('');
 const [orbitZoom,setOrbitZoom]=useState(1),host=hosts[selected]??hosts[0],campaign=fictional||!!catalog;
 const selectedStar=host.starId===undefined?undefined:stars?.find(star=>star.id===host.starId),stats=selectedStar?.statistics;
 const lastMaterialSurvey=host.starId===undefined?undefined:intelligence?.filter(item=>item.star===host.starId&&item.returned&&item.materialSurvey).sort((a,b)=>b.turn-a.turn||Date.parse(b.at)-Date.parse(a.at))[0];
 const materialSurvey=lastMaterialSurvey?.materialSurvey??stats?.materialSurvey;
 const currentOwn=!!(selectedStar?.visible&&selectedStar.owner===team&&stats?.knowledge==='current');
 const knowledge=stats?.knowledge==='historical'?`Last observed on turn ${stats.turn}; current values may differ.`:stats?.knowledge==='current'?`Current observation from turn ${stats.turn}.`:selectedStar?.known?'Charted; no measured system statistics.':'Uncharted; statistics unknown.';
 const tabKey=(event:React.KeyboardEvent<HTMLButtonElement>,tab:SystemTab)=>{const index=tabs.indexOf(tab);let next:SystemTab|undefined;if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];else if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];else if(event.key==='Home')next=tabs[0];else if(event.key==='End')next=tabs[tabs.length-1];if(next){event.preventDefault();setActiveTab(next);setActivePlanet(null);tabButtons.current[next]?.focus();}};
 const lastOwnerReport=(id:number)=>intelligence?.filter(item=>item.star===id&&item.ownerObserved).sort((a,b)=>b.turn-a.turn)[0];
 const state=(id:number)=>{const starId=hosts[id]?.starId,star=stars?.find(item=>item.id===starId);if(!star)return 'reference';if(star.visible&&star.owner===team)return 'own';if(star.visible&&star.owner!==null)return 'enemy';if(star.visible)return 'scouted';const report=lastOwnerReport(star.id);if(report)return report.owner!==null&&report.owner!==team?'reported-enemy':'scouted';return 'unknown';};
 const select=(id:number)=>{setSelected(id);setActivePlanet(null);const starId=hosts[id]?.starId;if(starId!==undefined)onSelect?.(starId);};
 const galaxyItems=useMemo<GalaxyItem[]>(()=>hosts.map((item,index)=>{const vector=catalogVector(item),kind=state(index);return {key:String(index),name:item.name,position:[vector.x,vector.y,vector.z],kind,campaignId:item.starId,title:item.reference?`${item.name} — ${item.distancePc.toFixed(2)} parsecs from the Sun`:item.name};}),[hosts,stars,team,intelligence]);

 useEffect(()=>{
  if(embedded)return;
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null,element=dialog.current!,overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return()=>{element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[embedded]);
 useEffect(()=>()=>{const sim=simulation.current;if(sim){sim.stop();(sim as unknown as {renderEnabled:boolean}).renderEnabled=false;sim.getViewer().get3jsCameraControls().dispose();sim.getRenderer().dispose();orbit.current?.replaceChildren();}},[]);
 useEffect(()=>{
  const target=orbit.current;
  if(!target||!host.astronomical){const old=simulation.current;if(old){old.stop();(old as unknown as {renderEnabled:boolean}).renderEnabled=false;old.getViewer().get3jsCameraControls().dispose();old.getRenderer().dispose();simulation.current=null;objects.current=[];}return;}
  try{
   const sim=simulation.current??new Simulation(target as unknown as HTMLCanvasElement,{basePath:'/',particleTextureUrl:marker,jdPerSecond:8,camera:{initialPosition:[0,-3.2,1.4],enableDrift:false}});
   simulation.current=sim;
   for(const object of objects.current)sim.removeObject(object);
   const star=sim.createSphere(`star-${selected}`,{position:[0,0,0],radius:.095,color:host.temperatureK&&host.temperatureK<4000?0xffb285:0xffe5b8});
   objects.current=[star];
   host.planets.forEach((planet,index)=>{
    // Period and semimajor axis are catalog data; circular plane and phase are illustrative.
    const displayAu=.25+Math.sqrt(Math.max(0,planet.semiMajorAu))*1.15;
    const ephem=new Ephem({a:displayAu,e:0,i:0,om:0,w:0,ma:index*137.5,period:planet.periodDays,epoch:sim.getJd()},'deg');
    const body=sim.createSphere(`planet-${selected}-${index}`,{ephem,radius:.022,color:[0x85c9ea,0xd8a87d,0xb2d19b,0xc6b7e4][index%4]});
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
  <div className="starMapHeader"><div><small>{fictional?'REAL STARS + FICTIONAL CAMPAIGN':'OBSERVED MILKY WAY SYSTEMS'}</small><h2 id="real-systems-title">{fictional?'Campaign sky':'Real star and planet atlas'}</h2></div>{!embedded&&<button className="quiet" onClick={onClose}>Close atlas</button>}</div>
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
     {activePlanet!==null&&host.planets[activePlanet]&&<PlanetDetail planet={host.planets[activePlanet]} onClose={()=>setActivePlanet(null)}/>}<div hidden={activePlanet!==null}>{host.astronomical?<><div className="orbitZoomControls" aria-label="Orbital zoom"><button type="button" aria-label="Zoom orbit out" disabled={orbitZoom===1} onClick={()=>setOrbitZoom(value=>Math.max(1,value-.25))}>-</button><span>{Math.round(orbitZoom*100)}%</span><button type="button" aria-label="Zoom orbit in" disabled={orbitZoom===3} onClick={()=>setOrbitZoom(value=>Math.min(3,value+.25))}>+</button><button type="button" onClick={()=>setOrbitZoom(1)}>Reset orbit</button></div>
      <div ref={orbit} className="realOrbit" role="img" aria-label={`Spacekit orbital view of ${host.name} and its cataloged planets; click a planet or use its button below`} onPointerDown={event=>{orbitPointer.current={x:event.clientX,y:event.clientY};}} onPointerUp={openOrbitPlanet} onPointerCancel={()=>{orbitPointer.current=null;}}/>{renderError&&<p role="alert">Spacekit view unavailable: {renderError}</p>}
      <ul>{host.planets.map((planet,index)=><li key={planet.name}><button type="button" className="planetCTA" aria-label={`Open ${planet.name} planet details`} onClick={()=>setActivePlanet(index)}>{planet.name}</button>{currentOwn&&selectedStar?.homePlanetId===index&&<span> - clan homeworld</span>} - {planet.periodDays.toFixed(2)} day orbit - {planet.semiMajorAu.toFixed(3)} AU{planet.radiusEarth!=null?` - estimated ${planet.radiusEarth.toFixed(2)} Earth radii`:' - radius unknown'}</li>)}</ul>
      <p className="realDataNote">Catalog orbits are compressed; circular paths and phases are illustrative.</p></>:<p>This saved fictional system has no cataloged real planets or orbital elements. Its identity and location remain unchanged.</p>}</div>
    </section>
    <section id={`${tabId}-resources-panel`} role="tabpanel" aria-labelledby={`${tabId}-resources`} hidden={activeTab!=='resources'}>
     <dl className="systemFacts"><div><dt>Material output</dt><dd>{currentOwn&&selectedStar?.materialYield?materialNames.map((name,index)=>`${name} ${measured(selectedStar.materialYield?.[index])} / turn`).join(' · '):'Not measured'}</dd></div><div><dt>Deep material survey</dt><dd>{materialSurvey?`${materialNames.map((name,index)=>materialSurvey[index]?`${name}: ${materialSurvey[index]} planet${materialSurvey[index]===1?'':'s'}`:null).filter(Boolean).join(', ')||'No cataloged material sites'}${lastMaterialSurvey?` (observed turn ${lastMaterialSurvey.turn})`:''}`:'Unknown'}</dd></div><div><dt>Mines</dt><dd>{currentOwn?measured(selectedStar?.mines):'Unknown'}</dd></div><div><dt>Settlement size</dt><dd>{currentOwn?measured(selectedStar?.settlementSize):'Unknown'}</dd></div><div><dt>Collectors</dt><dd>{measured(stats?.collectors)}</dd></div><div><dt>Colony income</dt><dd>{stats?.colonyIncome==null?'Unknown':`${stats.colonyIncome} credits / turn`}</dd></div><div><dt>Local stockpile</dt><dd>{currentOwn&&selectedStar?.stockpile?materialNames.map((name,index)=>`${name} ${measured(selectedStar.stockpile?.[index])}`).join(' · '):'Not measured'}</dd></div></dl><p>Surveyed material types are a dated observation. Current production and stockpiles remain unknown outside your own observed systems.</p>
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
 return embedded?<section className="realSystemsDialog inlineRealSky" aria-labelledby="real-systems-title">{content}</section>:<dialog ref={dialog} className="realSystemsDialog" aria-labelledby="real-systems-title" onCancel={event=>{event.preventDefault();if(activePlanet!==null)setActivePlanet(null);else onClose();}}>{content}</dialog>;
}
