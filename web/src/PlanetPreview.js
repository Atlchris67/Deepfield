import { createElement, useEffect, useId, useRef, useState } from 'react';
import * as THREE from './vendor/three.module.min.js';

const SIZE = 250;
const PALETTES = [
  ['#08233f', '#176b87', '#71c7a8', '#c4b37a', '#e8e2cb'],
  ['#2a1638', '#69405f', '#c17469', '#d8b980', '#f0e4cf'],
  ['#17273e', '#355f6f', '#789d78', '#b7a56a', '#d7d0b8'],
  ['#321b18', '#793d2a', '#b97543', '#d7b56d', '#efe0b6'],
  ['#102c2b', '#1f6a5a', '#74a96f', '#b9c889', '#e5e4c7']
];

const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
function hash3(x,y,z,seed){
  let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^Math.imul(seed+1,1274126177);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
function noise3(x,y,z,seed){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),tx=smooth(x-xi),ty=smooth(y-yi),tz=smooth(z-zi);
  const sample=(dx,dy,dz)=>hash3(xi+dx,yi+dy,zi+dz,seed);
  const x00=lerp(sample(0,0,0),sample(1,0,0),tx),x10=lerp(sample(0,1,0),sample(1,1,0),tx);
  const x01=lerp(sample(0,0,1),sample(1,0,1),tx),x11=lerp(sample(0,1,1),sample(1,1,1),tx);
  return lerp(lerp(x00,x10,ty),lerp(x01,x11,ty),tz);
}
function terrain(x,y,z,seed){
  let value=0,weight=.58,scale=1.45,total=0;
  for(let octave=0;octave<5;octave++){value+=noise3(x*scale+8,y*scale+8,z*scale+8,seed+octave*31)*weight;total+=weight;scale*=2.05;weight*=.5;}
  return value/total;
}
function rgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function mixColor(a,b,t){return a.map((value,index)=>Math.round(lerp(value,b[index],t)));}
function createPlanetTexture(seed,renderer){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Canvas textures are unavailable.');
  const image=context.createImageData(canvas.width,canvas.height),palette=PALETTES[Math.abs(seed)%PALETTES.length].map(rgb);
  for(let py=0;py<canvas.height;py++)for(let px=0;px<canvas.width;px++){
    const longitude=px/canvas.width*Math.PI*2,latitude=(py/(canvas.height-1)-.5)*Math.PI;
    const cosLat=Math.cos(latitude),elevation=terrain(cosLat*Math.cos(longitude),Math.sin(latitude),cosLat*Math.sin(longitude),seed);
    const polar=Math.max(0,(Math.abs(Math.sin(latitude))-.72)/.28),land=elevation>.51;
    let color;
    if(polar>.35)color=mixColor(land?palette[3]:palette[1],palette[4],Math.min(1,polar));
    else if(!land)color=mixColor(palette[0],palette[1],Math.max(0,(elevation-.25)/.26));
    else color=mixColor(palette[2],palette[3],Math.min(1,(elevation-.51)/.25));
    const shade=.82+.18*Math.max(0,Math.cos(latitude)),offset=(py*canvas.width+px)*4;
    image.data[offset]=Math.round(color[0]*shade);image.data[offset+1]=Math.round(color[1]*shade);image.data[offset+2]=Math.round(color[2]*shade);image.data[offset+3]=255;
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;
}

export default function PlanetPreview({starId,name}){
  const mountRef=useRef(null),hintId=useId(),[available,setAvailable]=useState(true);
  useEffect(()=>{
    const mount=mountRef.current;if(!mount)return;
    let renderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setAvailable(false);return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(SIZE,SIZE,false);renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.setAttribute('aria-hidden','true');mount.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,20);camera.position.set(0,0,3.35);
    const group=new THREE.Group();group.rotation.x=.15;scene.add(group);
    const geometry=new THREE.SphereGeometry(1,64,40),texture=createPlanetTexture(starId+17,renderer);
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:.78,metalness:.02});group.add(new THREE.Mesh(geometry,material));
    const atmosphereGeometry=new THREE.SphereGeometry(1.075,48,32);
    const atmosphereMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,uniforms:{glow:{value:new THREE.Color(0x88e8d2)}},vertexShader:'varying vec3 n;varying vec3 v;void main(){n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 glow;varying vec3 n;varying vec3 v;void main(){float rim=pow(1.0-max(dot(n,v),0.0),2.2);gl_FragColor=vec4(glow,rim*.34);}'});
    group.add(new THREE.Mesh(atmosphereGeometry,atmosphereMaterial));
    scene.add(new THREE.HemisphereLight(0xb7fff0,0x091319,1.15));const keyLight=new THREE.DirectionalLight(0xffffff,2.5);keyLight.position.set(-3,2,4);scene.add(keyLight);
    let dragging=false,lastX=0,lastY=0,manualUntil=0,visible=true,frame=0;
    const down=e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;manualUntil=performance.now()+1800;mount.setPointerCapture(e.pointerId);mount.classList.add('dragging');};
    const move=e=>{if(!dragging)return;group.rotation.y+=(e.clientX-lastX)*.011;group.rotation.x=Math.max(-.65,Math.min(.65,group.rotation.x+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;manualUntil=performance.now()+1800;};
    const up=e=>{dragging=false;mount.classList.remove('dragging');if(mount.hasPointerCapture(e.pointerId))mount.releasePointerCapture(e.pointerId);};
    const keydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();group.rotation.y+=(e.key==='ArrowLeft'?-1:1)*.14;manualUntil=performance.now()+1800;};
    mount.addEventListener('pointerdown',down);mount.addEventListener('pointermove',move);mount.addEventListener('pointerup',up);mount.addEventListener('pointercancel',up);mount.addEventListener('keydown',keydown);
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;});observer.observe(mount);
    const animate=now=>{frame=requestAnimationFrame(animate);if(!dragging&&now>manualUntil)group.rotation.y+=.0022;if(visible&&!document.hidden)renderer.render(scene,camera);};frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();mount.removeEventListener('pointerdown',down);mount.removeEventListener('pointermove',move);mount.removeEventListener('pointerup',up);mount.removeEventListener('pointercancel',up);mount.removeEventListener('keydown',keydown);geometry.dispose();atmosphereGeometry.dispose();material.dispose();atmosphereMaterial.dispose();texture.dispose();renderer.dispose();renderer.domElement.remove();};
  },[starId]);
  return createElement('figure',{className:'planetPreview'},
    createElement('div',{ref:mountRef,className:'planetViewport'+(!available?' previewFallback':''),role:'img',tabIndex:0,'aria-label':`Rotatable model of ${name}`,'aria-describedby':hintId},
      createElement('div',{className:'planetFallback','aria-hidden':'true'})),
    createElement('figcaption',{id:hintId},available?'Drag or use arrow keys to rotate':'3D preview unavailable'));
}
