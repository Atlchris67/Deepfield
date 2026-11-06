import {useEffect,useRef} from 'react';
import {THREE} from 'spacekit.js';
import {radiusSceneUnits} from './planetScale';

export type PlanetView={name:string;periodDays:number;semiMajorAu:number;radiusEarth:number|null};
function surface(name:string){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
 const context=canvas.getContext('2d')!,pixels=context.createImageData(canvas.width,canvas.height);
 const seed=[...name].reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,19);
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const wave=Math.sin(x*.073+seed*.0001)*.18+Math.sin(y*.11+x*.025)*.15+Math.sin(x*.21-y*.16+seed*.001)*.08;
  const shade=Math.max(0,Math.min(255,Math.round(145+wave*130))),index=(y*256+x)*4;
  pixels.data[index]=shade;pixels.data[index+1]=Math.round(shade*.76);pixels.data[index+2]=Math.round(shade*.58);pixels.data[index+3]=255;
 }
 context.putImageData(pixels,0,0);return new THREE.CanvasTexture(canvas);
}

export function PlanetDetail({planet,onClose}:{planet:PlanetView;onClose:()=>void}){
 const canvas=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{close.current?.focus();},[planet.name]);
 useEffect(()=>{
  const target=canvas.current;if(!target||planet.radiusEarth==null||planet.radiusEarth<=0)return;
  let renderer:InstanceType<typeof THREE.WebGLRenderer>|undefined,frame=0,observer:ResizeObserver|undefined;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-9,9,5,-5,.1,100);
  camera.position.set(0,0,20);camera.lookAt(0,0,0);
  const texture=surface(planet.name),geometry=new THREE.SphereGeometry(1,48,32),planetMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.9});
  const body=new THREE.Mesh(geometry,planetMaterial);
  body.scale.setScalar(radiusSceneUnits(planet.radiusEarth));scene.add(body);
  scene.add(new THREE.AmbientLight(0xffffff,1.5));const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-3,5,9);scene.add(light);
  let downX:number|null=null;
  const move=(event:PointerEvent)=>{if(downX!==null){body.rotation.y+=(event.clientX-downX)*.01;downX=event.clientX;}};
  const up=()=>{downX=null;};
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));target.append(renderer.domElement);
   const resize=()=>{const width=target.clientWidth,height=target.clientHeight;if(!width||!height)return;renderer?.setSize(width,height,false);const halfHeight=9*height/width;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();};
   observer=new ResizeObserver(resize);observer.observe(target);resize();
   renderer.domElement.addEventListener('pointerdown',(event:PointerEvent)=>{downX=event.clientX;renderer?.domElement.setPointerCapture(event.pointerId);});renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
   const draw=()=>{body.rotation.y+=.003;renderer?.render(scene,camera);frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
  }catch{target.textContent='3D planet view unavailable.';}
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();renderer?.domElement.removeEventListener('pointermove',move);renderer?.domElement.removeEventListener('pointerup',up);renderer?.domElement.removeEventListener('pointercancel',up);renderer?.dispose();renderer?.domElement.remove();geometry.dispose();planetMaterial.dispose();texture.dispose();};
 },[planet]);
 return <section className="planetDetail" role="region" aria-label={`${planet.name} size comparison`} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}}>
  <div className="planetDetailHeader"><h4>{planet.name}</h4><button ref={close} type="button" onClick={onClose}>Back to system</button></div>
  <p>Illustrative Three.js rendering. Surface and color are fictional. Every planet uses the same fixed camera and a linear scale of 0.3 scene units per Earth radius.</p>
  {planet.radiusEarth!=null&&planet.radiusEarth>0?<><div ref={canvas} className="planetDetailCanvas" role="img" aria-label={`${planet.name}, estimated radius ${planet.radiusEarth.toFixed(2)} Earth radii`}/><p>{planet.name}: estimated {planet.radiusEarth.toFixed(2)} Earth radii. Drag to turn the planet.</p></>:<p>Radius unavailable in this catalog snapshot; no size rendering is inferred.</p>}
  <p>Orbital period: {planet.periodDays.toFixed(2)} days. Catalog semimajor axis: {planet.semiMajorAu.toFixed(3)} AU. Radius is a catalog estimate, not a measured surface image.</p>
 </section>;
}
