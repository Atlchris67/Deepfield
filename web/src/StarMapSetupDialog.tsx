import {useEffect,useRef,useState} from 'react';

export type StarMapSettings={systemCount:number;width:number;height:number;minimumSeparation:number;nearestNeighborLinks:number;playerCount:number};
export type StarMapPreviewRequest=StarMapSettings&{seed:number;real?:boolean};
export type CatalogPlanet={id:number;name:string;periodDays:number;semiMajorAu:number;radiusEarth:number|null};
export type CatalogSystem={id:number;name:string;raDeg:number;decDeg:number;distancePc:number;temperatureK:number|null;planets:CatalogPlanet[]};
export type GeneratedStarMap={generatorVersion:number;seed:number;settings:StarMapSettings;systems:{id:number;name:string;x:number;y:number}[];links:{from:number;to:number}[];homeworlds:{playerSlot:number;systemId:number;planetId?:number|null}[];realCatalogVersion?:number|null;realSystems?:CatalogSystem[]|null};
export type CampaignOptions={logisticsVersion:0|1;industrialFocus:[number,number];combatVersion:0|1};

const defaults:StarMapPreviewRequest={seed:0,systemCount:24,width:1000,height:700,minimumSeparation:1,nearestNeighborLinks:2,playerCount:2,real:true};

export function StarMapSetupDialog({onClose,onGenerate,onStart}:{onClose:()=>void;onGenerate:(request:StarMapPreviewRequest,signal:AbortSignal)=>Promise<GeneratedStarMap>;onStart?:(map:GeneratedStarMap,id:string,signal:AbortSignal,options:CampaignOptions)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null),request=useRef<AbortController|null>(null),backdropDown=useRef(false);
 const [settings]=useState(defaults),[map,setMap]=useState<GeneratedStarMap|null>(null),[busy,setBusy]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState('');
 const [options,setOptions]=useState<CampaignOptions>({logisticsVersion:1,industrialFocus:[0,0],combatVersion:1});
 const startId=useRef<string|null>(null),startingRef=useRef(false);
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;const element=dialog.current!;const overflow=document.body.style.overflow;
  element.showModal();closeButton.current?.focus();document.body.style.overflow='hidden';void generate(defaults);
  return ()=>{const active=request.current;request.current=null;active?.abort();element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[]);
 async function generate(next=settings){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setMap(null);startId.current=null;
  try{const generated=await onGenerate(next,controller.signal);if(!controller.signal.aborted){setMap(generated);startId.current=crypto.randomUUID().replaceAll('-','');}}
  catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not generate the star map preview.');}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 async function start(){
  if(!onStart||!map||startingRef.current||busy||map.settings.playerCount!==2||map.settings.systemCount<4||!previewCurrent)return;
  startingRef.current=true;const controller=new AbortController();request.current=controller;setStarting(true);setError('');
  try{await onStart(map,startId.current!,controller.signal,options);}
  catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not start the campaign. Retry with the same preview.');}
  finally{startingRef.current=false;if(request.current===controller){request.current=null;setStarting(false);}}
 }
 const systems=new Map(map?.systems.map(system=>[system.id,system]));
 const previewCurrent=map?.realCatalogVersion===1;
 const homeworlds=new Map(map?.homeworlds.map(home=>[home.systemId,home.playerSlot]));
 const markerScale=map?Math.min(map.settings.width,map.settings.height):1,padding=markerScale*.025;
 const outside=(event:React.PointerEvent<HTMLDialogElement>)=>{const r=event.currentTarget.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
 return <dialog ref={dialog} className="starMapDialog" aria-labelledby="star-map-title" aria-describedby="star-map-boundary" onCancel={event=>{event.preventDefault();if(!starting)onClose();}} onPointerDown={event=>{backdropDown.current=outside(event);}} onPointerUp={event=>{if(!starting&&backdropDown.current&&outside(event))onClose();backdropDown.current=false;}}>
  <div className="starMapHeader"><div><small>LOCAL HOST TOOL</small><h2 id="star-map-title">Configure star map</h2></div><button ref={closeButton} className="quiet" disabled={starting} onClick={onClose} aria-label="Close star map setup">Close</button></div>
  <div className="starMapScroll"><p id="star-map-boundary" className="starMapBoundary">Starting a map creates a separate campaign. Your current campaign remains unchanged.</p>
   <form onSubmit={event=>{event.preventDefault();void generate();}}>
     <fieldset disabled={busy||starting}><div className="starMapFields">
      <p>New campaigns use the pinned catalog of nearby real stars and cataloged planets. Clan names remain independent of astronomy names.</p>
    </div><div className="campaignRules"><div className="materialAccess" role="radiogroup" aria-labelledby="material-access-title"><h3 id="material-access-title">Material access</h3><p>Choose how this new campaign handles resources. This choice stays with the campaign.</p><label className="materialAccessChoice"><input type="radio" name="material-access" value="0" checked={options.logisticsVersion===0} onChange={()=>setOptions(current=>({...current,logisticsVersion:0}))}/><span><strong>Shared clan stock</strong><small>One pooled stockpile. No freighters or gates to build.</small></span></label><label className="materialAccessChoice"><input type="radio" name="material-access" value="1" checked={options.logisticsVersion===1} onChange={()=>setOptions(current=>({...current,logisticsVersion:1}))}/><span><strong>Local stock, freighters and paired gates</strong><small>Resources stay at each world. Homeworlds start with a gate and two freighters; outposts need delivered materials to build gates.</small></span></label></div>
      <label>Fleet rules<select value={options.combatVersion} onChange={event=>setOptions(current=>({...current,combatVersion:Number(event.target.value) as 0|1}))}><option value={1}>Typed hulls and ship design</option><option value={0}>Classic generic ships</option></select><small>Ship packages are available with typed hulls. Existing campaigns keep their own fleet rules.</small></label>
      {(['Aurora Federation','Ember Empire'] as const).map((name,team)=><label key={name}>{name}: mining ↔ shipbuilding
       <input type="range" min="-2" max="2" step="1" value={options.industrialFocus[team]} onChange={event=>setOptions(current=>{const focus=[...current.industrialFocus] as [number,number];focus[team]=Number(event.target.value);return {...current,industrialFocus:focus};})}/>
       <small>{options.industrialFocus[team]}: material output {25*(4+options.industrialFocus[team])}% of balanced; generic ships {5+options.industrialFocus[team]} credits each. Typed hulls add this modifier to their base credit cost.</small>
      </label>)}<button type="button" className="quiet" onClick={()=>setOptions(current=>({...current,industrialFocus:[0,0]}))}>Reset traits to balanced</button>
     </div></fieldset>
    <div className="starMapActions"><button disabled={busy}>{busy?'Generating.':'Generate preview'}</button></div>
   </form>
   {error&&<p role="alert" className="error">{error}</p>}
   {map&&<section className="starMapResult" aria-label="Generated star map preview"><div className="starMapSummary"><strong>{map.systems.length} systems · {map.links.length} routes</strong><small>{map.realCatalogVersion?`Real catalog v${map.realCatalogVersion}`:`Seed ${map.seed}`} · Generator v{map.generatorVersion}</small></div>
    <svg viewBox={`${-padding} ${-padding} ${map.settings.width+padding*2} ${map.settings.height+padding*2}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Preview of ${map.systems.length} generated star systems`}>
     <title>Generated star map, seed {map.seed}</title>
     {map.links.map(link=>{const from=systems.get(link.from)!,to=systems.get(link.to)!;return <line key={`${link.from}-${link.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>;})}
     {map.systems.map(system=><g key={system.id} className={homeworlds.has(system.id)?'homeworld':''}><title>{system.name}{homeworlds.has(system.id)?` · Player ${homeworlds.get(system.id)!+1} homeworld`:''}</title><circle cx={system.x} cy={system.y} r={markerScale*(homeworlds.has(system.id) ? .014 : .008)}/></g>)}
     {map.homeworlds.map(home=>{const system=systems.get(home.systemId)!;return <text key={home.playerSlot} x={system.x+markerScale*.02} y={system.y-markerScale*.018} fontSize={markerScale*.026}>P{home.playerSlot+1}</text>;})}
    </svg>
    <ol className="homeworldList">{map.homeworlds.map(home=><li key={home.playerSlot}>Player {home.playerSlot+1}: <strong>{systems.get(home.systemId)?.name}</strong>{map.realSystems&&home.planetId!=null&&<> — {map.realSystems[home.systemId]?.planets[home.planetId]?.name}</>}</li>)}</ol>
    {onStart&&<p className="campaignRuleSummary" role="status">Material access: <strong>{options.logisticsVersion===1?'Local stock, freighters and paired gates':'Shared clan stock — no freight or gates'}</strong>. Fleet rules: <strong>{options.combatVersion===1?'Typed hulls and ship design':'Classic generic ships'}</strong>.</p>}
    {onStart&&<div className="starMapActions"><button type="button" disabled={busy||starting||map.settings.playerCount!==2||map.settings.systemCount<4||!previewCurrent} onClick={()=>void start()}>{starting?'Starting campaign.':'Start new campaign'}</button></div>}
    {onStart&&(map.settings.playerCount!==2||map.settings.systemCount<4)&&<p>Playable campaigns require two players and at least four systems.</p>}
   </section>}
  </div>
 </dialog>;
}
