import {useEffect,useRef,useState} from 'react';

export type StarMapSettings={systemCount:number;width:number;height:number;minimumSeparation:number;nearestNeighborLinks:number;playerCount:number};
export type StarMapPreviewRequest=StarMapSettings&{seed:number};
export type GeneratedStarMap={generatorVersion:number;seed:number;settings:StarMapSettings;systems:{id:number;name:string;x:number;y:number}[];links:{from:number;to:number}[];homeworlds:{playerSlot:number;systemId:number}[]};

const defaults:StarMapPreviewRequest={seed:42017,systemCount:24,width:1000,height:700,minimumSeparation:45,nearestNeighborLinks:2,playerCount:2};

export function StarMapSetupDialog({onClose,onGenerate}:{onClose:()=>void;onGenerate:(request:StarMapPreviewRequest,signal:AbortSignal)=>Promise<GeneratedStarMap>}){
 const dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null),request=useRef<AbortController|null>(null),backdropDown=useRef(false);
 const [settings,setSettings]=useState(defaults),[map,setMap]=useState<GeneratedStarMap|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;const element=dialog.current!;const overflow=document.body.style.overflow;
  element.showModal();closeButton.current?.focus();document.body.style.overflow='hidden';void generate(defaults);
  return ()=>{const active=request.current;request.current=null;active?.abort();element.close();document.body.style.overflow=overflow;if(opener?.isConnected)opener.focus();};
 },[]);
 function field(name:keyof StarMapPreviewRequest,value:number){setSettings(current=>({...current,[name]:value}));setError('');}
 async function generate(next=settings){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const generated=await onGenerate(next,controller.signal);if(!controller.signal.aborted)setMap(generated);}
  catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not generate the star map preview.');}
  finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 const systems=new Map(map?.systems.map(system=>[system.id,system]));
 const homeworlds=new Map(map?.homeworlds.map(home=>[home.systemId,home.playerSlot]));
 const markerScale=map?Math.min(map.settings.width,map.settings.height):1,padding=markerScale*.025;
 const outside=(event:React.PointerEvent<HTMLDialogElement>)=>{const r=event.currentTarget.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
 return <dialog ref={dialog} className="starMapDialog" aria-labelledby="star-map-title" aria-describedby="star-map-boundary" onCancel={event=>{event.preventDefault();onClose();}} onPointerDown={event=>{backdropDown.current=outside(event);}} onPointerUp={event=>{if(backdropDown.current&&outside(event))onClose();backdropDown.current=false;}}>
  <div className="starMapHeader"><div><small>LOCAL HOST TOOL / SLICE 2</small><h2 id="star-map-title">Configure star map</h2></div><button ref={closeButton} className="quiet" onClick={onClose} aria-label="Close star map setup">Close</button></div>
  <div className="starMapScroll"><p id="star-map-boundary" className="starMapBoundary">Preview only. Generating this map does not replace or modify the current campaign.</p>
   <form onSubmit={event=>{event.preventDefault();void generate();}}>
    <fieldset disabled={busy}><div className="starMapFields">
     <label>Seed<input type="number" min="-2147483648" max="2147483647" value={settings.seed} onChange={event=>field('seed',Number(event.target.value))}/></label>
     <label>Systems<input type="number" min="2" max="256" value={settings.systemCount} onChange={event=>field('systemCount',Number(event.target.value))}/></label>
     <label>Players<input type="number" min="1" max={Math.min(16,settings.systemCount)} value={settings.playerCount} onChange={event=>field('playerCount',Number(event.target.value))}/></label>
     <label>Map width<input type="number" min="100" max="100000" value={settings.width} onChange={event=>field('width',Number(event.target.value))}/></label>
     <label>Map height<input type="number" min="100" max="100000" value={settings.height} onChange={event=>field('height',Number(event.target.value))}/></label>
     <label>Minimum separation<input type="number" min="1" max={Math.min(settings.width,settings.height)} value={settings.minimumSeparation} onChange={event=>field('minimumSeparation',Number(event.target.value))}/></label>
     <label>Nearest links per system<input type="number" min="1" max="8" value={settings.nearestNeighborLinks} onChange={event=>field('nearestNeighborLinks',Number(event.target.value))}/></label>
    </div></fieldset>
    <div className="starMapActions"><button type="button" className="quiet" disabled={busy} onClick={()=>{const next={...settings,seed:Math.floor(Math.random()*2147483647)};setSettings(next);void generate(next);}}>New seed</button><button disabled={busy}>{busy?'Generating…':'Generate preview'}</button></div>
   </form>
   {error&&<p role="alert" className="error">{error}</p>}
   {map&&<section className="starMapResult" aria-label="Generated star map preview"><div className="starMapSummary"><strong>{map.systems.length} systems · {map.links.length} routes</strong><small>Seed {map.seed} · Generator v{map.generatorVersion}</small></div>
    <svg viewBox={`${-padding} ${-padding} ${map.settings.width+padding*2} ${map.settings.height+padding*2}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Preview of ${map.systems.length} generated star systems`}>
     <title>Generated star map, seed {map.seed}</title>
     {map.links.map(link=>{const from=systems.get(link.from)!,to=systems.get(link.to)!;return <line key={`${link.from}-${link.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>;})}
     {map.systems.map(system=><g key={system.id} className={homeworlds.has(system.id)?'homeworld':''}><title>{system.name}{homeworlds.has(system.id)?` · Player ${homeworlds.get(system.id)!+1} homeworld`:''}</title><circle cx={system.x} cy={system.y} r={markerScale*(homeworlds.has(system.id) ? .014 : .008)}/></g>)}
     {map.homeworlds.map(home=>{const system=systems.get(home.systemId)!;return <text key={home.playerSlot} x={system.x+markerScale*.02} y={system.y-markerScale*.018} fontSize={markerScale*.026}>P{home.playerSlot+1}</text>;})}
    </svg>
    <ol className="homeworldList">{map.homeworlds.map(home=><li key={home.playerSlot}>Player {home.playerSlot+1}: <strong>{systems.get(home.systemId)?.name}</strong></li>)}</ol>
   </section>}
  </div>
 </dialog>;
}
