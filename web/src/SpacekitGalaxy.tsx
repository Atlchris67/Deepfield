import {useEffect,useRef,useState} from 'react';
import {Simulation,THREE} from 'spacekit.js';
import type {StarLink} from './fleetSelection';
import {frameDistance,routeVertices,type GalaxyItem} from './galaxySceneData';

type Props={items:GalaxyItem[];links?:StarLink[]|null;selected:string;onActivate:(key:string)=>void;embedded:boolean};
type Pointer={id:number;x:number;y:number;moved:boolean;position:InstanceType<typeof THREE.Vector3>};
const marker='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=';
const colors:Record<string,number>={own:0x69c7ed,enemy:0xf97878,'reported-enemy':0xf97878,scouted:0xa1efcc,unknown:0xafc9cb,reference:0xe9e4c8};

function starTexture(ring:boolean){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const context=canvas.getContext('2d')!;
 if(ring){context.beginPath();context.arc(32,32,15,0,Math.PI*2);context.strokeStyle='#fff';context.lineWidth=3;context.stroke();}
 else {const glow=context.createRadialGradient(32,32,1,32,32,30);glow.addColorStop(0,'#fff');glow.addColorStop(.12,'#fff');glow.addColorStop(.28,'#ffffffb0');glow.addColorStop(1,'#ffffff00');context.fillStyle=glow;context.fillRect(0,0,64,64);}
 return new THREE.CanvasTexture(canvas);
}

export function SpacekitGalaxy({items,links,selected,onActivate,embedded}:Props){
 const container=useRef<HTMLDivElement>(null),labels=useRef(new Map<string,HTMLButtonElement>()),scene=useRef<Simulation|null>(null),pointer=useRef<Pointer|null>(null),dragged=useRef(false);
 const displayed=useRef(items),objects=useRef<InstanceType<typeof THREE.Object3D>[]>([]),geometries=useRef<InstanceType<typeof THREE.BufferGeometry>[]>([]),materials=useRef<InstanceType<typeof THREE.Material>[]>([]),textures=useRef<InstanceType<typeof THREE.Texture>[]>([]);
 displayed.current=items;
 const [error,setError]=useState(''),[zoom,setZoom]=useState(1),[expanded,setExpanded]=useState(false);
 const initialDistance=frameDistance(items);
 const distance=useRef(initialDistance),simRef=scene;
 const clearScene=()=>{const sim=simRef.current;if(sim)for(const object of objects.current)sim.getScene().remove(object);for(const geometry of geometries.current)geometry.dispose();for(const material of materials.current)material.dispose();objects.current=[];geometries.current=[];materials.current=[];};
 // Spacekit 0.1.1 has no destroy API for its anonymous window listeners.
 // Keep one Simulation per mounted view; update its objects instead of remounting on each turn.
 useEffect(()=>{
  const target=container.current;if(!target)return;
  let sim:Simulation|undefined,observer:ResizeObserver|undefined,frame=0;
  try{
   sim=new Simulation(target as unknown as HTMLCanvasElement,{basePath:'/',particleTextureUrl:marker,startPaused:true,camera:{initialPosition:[0,-initialDistance,initialDistance*.22],enableDrift:false}});
   simRef.current=sim;
   const camera=sim.getViewer().get3jsCamera(),controls=sim.getViewer().get3jsCameraControls();
   controls.enablePan=false;controls.minDistance=8;controls.maxDistance=initialDistance*5;controls.enableDamping=true;
   textures.current=[starTexture(false),starTexture(true)];
   const resize=()=>{const w=target.clientWidth,h=target.clientHeight;if(!w||!h)return;sim!.getRenderer().setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
   observer=new ResizeObserver(resize);observer.observe(target);resize();
   const placeLabels=()=>{
    camera.updateMatrixWorld();const w=target.clientWidth,h=target.clientHeight;
    for(const item of displayed.current){const button=labels.current.get(item.key);if(!button)continue;const projected=new THREE.Vector3(...item.position).project(camera);const visible=projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1;
     button.style.display=visible?'flex':'none';if(visible){button.style.left=`${(projected.x+1)*w/2}px`;button.style.top=`${(1-projected.y)*h/2}px`;button.style.zIndex=String(Math.round(100-projected.z*50));}}
    frame=requestAnimationFrame(placeLabels);
   };frame=requestAnimationFrame(placeLabels);setError('');
  }catch(reason){setError(reason instanceof Error?reason.message:'Galaxy view unavailable.');}
   return()=>{cancelAnimationFrame(frame);observer?.disconnect();if(sim){sim.getViewer().get3jsCameraControls().dispose();clearScene();for(const texture of textures.current)texture.dispose();textures.current=[];sim.stop();(sim as unknown as {renderEnabled:boolean}).renderEnabled=false;sim.getRenderer().dispose();target.replaceChildren();}simRef.current=null;};
  },[]);
 useEffect(()=>{const sim=simRef.current;if(!sim)return;clearScene();const world=sim.getScene(),[filled,hollow]=textures.current;
  for(const item of items){const material=new THREE.SpriteMaterial({map:item.kind==='unknown'?hollow:filled,color:colors[item.kind]??colors.reference,transparent:true,depthWrite:false,opacity:item.kind==='reference'?.62:1});const sprite=new THREE.Sprite(material);sprite.position.set(...item.position);sprite.scale.set(item.kind==='unknown'?.5:.82,item.kind==='unknown'?.5:.82,1);sprite.name=item.key;world.add(sprite);objects.current.push(sprite);materials.current.push(material);}
  const vertices=routeVertices(items,links).map(position=>new THREE.Vector3(...position));
  if(container.current)container.current.dataset.routeCount=String(vertices.length/2);
  if(vertices.length){const geometry=new THREE.BufferGeometry().setFromPoints(vertices),material=new THREE.LineBasicMaterial({color:0x68a5a8,transparent:true,opacity:.24,depthWrite:false});const routes=new THREE.LineSegments(geometry,material);routes.name='Saved one-turn jump links';world.add(routes);objects.current.push(routes);geometries.current.push(geometry);materials.current.push(material);}
  sim.getViewer().get3jsCameraControls().maxDistance=frameDistance(items)*5;
 },[items,links]);
 useEffect(()=>{if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false);}};document.addEventListener('keydown',keydown);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',keydown);};},[expanded]);
 const cameraParts=()=>{const sim=scene.current;if(!sim)return null;return {camera:sim.getViewer().get3jsCamera(),controls:sim.getViewer().get3jsCameraControls()};};
 const moveZoom=(factor:number)=>{const parts=cameraParts();if(!parts)return;const {camera,controls}=parts;const offset=camera.position.clone().sub(controls.target),next=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()*factor));camera.position.copy(controls.target).add(offset.setLength(next));controls.update();setZoom(initialDistance/next);};
 const reset=()=>{const parts=cameraParts();if(!parts)return;const {camera,controls}=parts;controls.target.set(0,0,0);camera.position.set(0,-initialDistance,initialDistance*.22);controls.update();distance.current=initialDistance;setZoom(1);};
 const rotateMarker=(event:React.PointerEvent<HTMLElement>)=>{const start=pointer.current,parts=cameraParts();if(!start||start.id!==event.pointerId||!parts)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.hypot(dx,dy)>5)start.moved=true;if(!start.moved)return;const {camera,controls}=parts,box=container.current!.getBoundingClientRect();const spherical=new THREE.Spherical().setFromVector3(start.position);spherical.theta-=dx/Math.max(1,box.width)*Math.PI*2;spherical.phi=Math.max(.05,Math.min(Math.PI-.05,spherical.phi-dy/Math.max(1,box.height)*Math.PI));camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();};
 return <div className={'realSky spacekitGalaxy'+(expanded?' realSkyExpanded':'')} role="group" aria-label="Nearby real star systems">
  <div ref={container} className="spacekitGalaxyCanvas" aria-hidden="true"
   onPointerDown={event=>{if(event.button!==0)return;const parts=cameraParts();if(!parts)return;pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,position:parts.camera.position.clone().sub(parts.controls.target)};event.currentTarget.setPointerCapture(event.pointerId);}}
   onPointerMove={rotateMarker} onPointerUp={event=>{if(pointer.current?.id!==event.pointerId)return;pointer.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
   onPointerCancel={()=>{pointer.current=null;}}/>
  <div className="spacekitGalaxyLabels">{items.map(item=><button key={item.key} ref={node=>{if(node)labels.current.set(item.key,node);else labels.current.delete(item.key);}} type="button" data-system={item.key} className={'realStar '+item.kind+(item.key===selected?' active':'')} title={item.title} aria-label={`Show system details for ${item.name}`} aria-pressed={item.key===selected} aria-description={item.kind==="reported-enemy"?"Historical enemy report; current ownership unconfirmed.":undefined}
   onPointerDown={event=>{if(event.button!==0)return;const parts=cameraParts();if(!parts)return;pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,position:parts.camera.position.clone().sub(parts.controls.target)};event.currentTarget.setPointerCapture(event.pointerId);}}
   onPointerMove={rotateMarker} onPointerUp={event=>{if(pointer.current?.id!==event.pointerId)return;dragged.current=pointer.current.moved;pointer.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);setTimeout(()=>{dragged.current=false;},0);}}
   onPointerCancel={()=>{pointer.current=null;}} onClick={()=>{if(!dragged.current)onActivate(item.key);}}><span className="realStarDot" aria-hidden="true">{item.kind==='unknown'?'✧':'✦'}</span><span className="realStarName">{item.name}</span></button>)}</div>
  <div className="galaxyReadout" aria-hidden="true"><strong>LOCAL VOLUME</strong><span>Drag to orbit · Scroll to zoom</span></div>
  <div className="galaxyLegend" role="group" aria-label="Galaxy marker legend"><span className="legendOwn">Owned</span><span className="legendEnemy">Enemy (current)</span><span className="legendHistorical">Enemy (last seen)</span><span className="legendUnknown">Unknown</span><span className="legendReference">Reference</span></div>
  {error&&<p className="spacekitGalaxyError" role="alert">Spacekit galaxy view unavailable: {error}</p>}
  <div className="realSkyControls" aria-label="Real sky controls"><button type="button" aria-label="Zoom real sky out" onClick={()=>moveZoom(1.25)}>-</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom real sky in" onClick={()=>moveZoom(.8)}>+</button><button type="button" onClick={reset}>Reset sky</button>{embedded&&<button type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Close expanded sky':'Expand sky'}</button>}</div>
 </div>;
}
