import {useEffect,useRef} from 'react';
import {THREE} from 'spacekit.js';
import {radiusSceneUnits} from './planetScale';
import {illustrativeSurface} from './illustrativeSurface';

export type PlanetView={name:string;periodDays:number;semiMajorAu:number;radiusEarth:number|null};
export function PlanetDetail({planet,onClose}:{planet:PlanetView;onClose:()=>void}){
 const canvas=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{close.current?.focus();},[planet.name]);
 useEffect(()=>{
  const target=canvas.current;if(!target||planet.radiusEarth==null||planet.radiusEarth<=0)return;
  let renderer:InstanceType<typeof THREE.WebGLRenderer>|undefined,frame=0,observer:ResizeObserver|undefined;
  const viewHalfWidth=Math.max(.65,radiusSceneUnits(planet.radiusEarth)*1.45);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-viewHalfWidth,viewHalfWidth,3,-3,.1,100);
  camera.position.set(0,0,20);camera.lookAt(0,0,0);
  const texture=illustrativeSurface(planet.name),geometry=new THREE.SphereGeometry(1,48,32),planetMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.88});
  const body=new THREE.Mesh(geometry,planetMaterial);
  body.scale.setScalar(radiusSceneUnits(planet.radiusEarth));scene.add(body);
  scene.add(new THREE.AmbientLight(0x789bac,.42));const light=new THREE.DirectionalLight(0xffeed8,1.8);light.position.set(-3,5,9);scene.add(light);const rim=new THREE.DirectionalLight(0x75bcda,.38);rim.position.set(5,-2,-5);scene.add(rim);
  let downX:number|null=null;
  const move=(event:PointerEvent)=>{if(downX!==null){body.rotation.y+=(event.clientX-downX)*.01;downX=event.clientX;}};
  const up=()=>{downX=null;};
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));target.append(renderer.domElement);
   const resize=()=>{const width=target.clientWidth,height=target.clientHeight;if(!width||!height)return;renderer?.setSize(width,height,false);const halfHeight=viewHalfWidth*height/width;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();};
   observer=new ResizeObserver(resize);observer.observe(target);resize();
   renderer.domElement.addEventListener('pointerdown',(event:PointerEvent)=>{downX=event.clientX;renderer?.domElement.setPointerCapture(event.pointerId);});renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
   const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
   const draw=()=>{if(!reducedMotion.matches&&downX===null)body.rotation.y+=.003;renderer?.render(scene,camera);frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
  }catch{target.textContent='3D planet view unavailable.';}
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();renderer?.domElement.removeEventListener('pointermove',move);renderer?.domElement.removeEventListener('pointerup',up);renderer?.domElement.removeEventListener('pointercancel',up);renderer?.dispose();renderer?.domElement.remove();geometry.dispose();planetMaterial.dispose();texture.dispose();};
 },[planet]);
 return <section className="planetDetail" role="region" aria-label={`${planet.name} size comparison`} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}}}>
  <div className="planetDetailHeader"><h4>{planet.name}</h4><button ref={close} type="button" onClick={onClose}>Back to system</button></div>
  <p>Illustrative Three.js rendering. Surface and color are fictional. The camera frames each planet for inspection; compare sizes using the catalog radius below.</p>
  {planet.radiusEarth!=null&&planet.radiusEarth>0?<><div ref={canvas} className="planetDetailCanvas" role="img" aria-label={`${planet.name}, estimated radius ${planet.radiusEarth.toFixed(2)} Earth radii`}/><p>{planet.name}: estimated {planet.radiusEarth.toFixed(2)} Earth radii. Drag to turn the planet.</p></>:<p>Radius unavailable in this catalog snapshot; no size rendering is inferred.</p>}
  <p>Orbital period: {planet.periodDays.toFixed(2)} days. Catalog semimajor axis: {planet.semiMajorAu.toFixed(3)} AU. Radius is a catalog estimate, not a measured surface image.</p>
 </section>;
}
