import {useEffect,useRef,useState} from 'react';
import type {Star} from './fleetSelection';

type Props={stars:Star[];links?:{from:number;to:number}[]|null;width:number;height:number;team:number;selected:number;onSelect:(id:number)=>void;onInspect:(id:number)=>void};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function CampaignMap({stars,links,width,height,team,selected,onSelect,onInspect}:Props){
 const viewport=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;offsetX:number;offsetY:number;moved:boolean}|null>(null);
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[expanded,setExpanded]=useState(false);
 const size=()=>({width:viewport.current?.clientWidth??1,height:viewport.current?.clientHeight??1});
 const bounded=(x:number,y:number,scale=zoom)=>{const box=size();return {x:clamp(x,-box.width*(scale-1)/2,box.width*(scale-1)/2),y:clamp(y,-box.height*(scale-1)/2,box.height*(scale-1)/2)};};
 const changeZoom=(next:number)=>{const scale=clamp(next,1,5);setZoom(scale);setOffset(current=>bounded(current.x,current.y,scale));};
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 useEffect(()=>{setOffset({x:0,y:0});setZoom(1);},[width,height,stars.length]);
 const linked=(a:number,b:number)=>links?.some(link=>(link.from===a&&link.to===b)||(link.from===b&&link.to===a))??false;
 return <div className={'map'+(expanded?' mapExpanded':'')} ref={viewport} aria-label="Campaign star map" onWheel={event=>{if(event.ctrlKey){event.preventDefault();changeZoom(zoom+(event.deltaY<0?.25:-.25));}}} onPointerDown={event=>{if(event.button!==0||((event.target as HTMLElement).closest('button')))return;drag.current={x:event.clientX,y:event.clientY,offsetX:offset.x,offsetY:offset.y,moved:false};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const start=drag.current;if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>4)start.moved=true;if(start.moved)setOffset(bounded(start.offsetX+dx,start.offsetY+dy));}} onPointerUp={event=>{if(drag.current?.moved)event.preventDefault();drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
  <div className="mapWorld" style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}}>
   <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">{stars.flatMap(a=>stars.filter(b=>b.id>a.id&&linked(a.id,b.id)).map(b=><line key={a.id+'-'+b.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>))}</svg>
   {stars.map(star=><button key={star.id} aria-label={`${star.name}${star.visible?', observed':', no current intelligence'}`} aria-pressed={star.id===selected} className={'star '+(star.id===selected?'selected ':'')+(star.owner===team?'own ':star.owner!==null?'enemy ':'')+(!star.known?'unknown':'')} style={{left:(star.x/width*100)+'%',top:(star.y/height*100)+'%'}} onClick={()=>{onSelect(star.id);onInspect(star.id);}}><i/>{star.name}<small>{star.visible?(star.ships?.[team]??0)+' ships':star.known?'Charted':'No signal'}</small></button>)}
  </div>
  <div className="mapControls" aria-label="Map controls"><button type="button" className="secondary" aria-label="Zoom in" onClick={()=>changeZoom(zoom+.5)}>+</button><button type="button" className="secondary" aria-label="Zoom out" onClick={()=>changeZoom(zoom-.5)} disabled={zoom===1}>−</button><button type="button" className="secondary" onClick={()=>{setZoom(1);setOffset({x:0,y:0});}}>Reset</button><button type="button" className="secondary" aria-label={expanded?'Close expanded map':'Expand map'} onClick={()=>{setExpanded(value=>!value);setOffset({x:0,y:0});}}> {expanded?'Collapse':'Expand'}</button></div>
  <span className="mapHint">Drag to pan · Ctrl + wheel to zoom · Select a star for its dossier</span>
 </div>;
}
