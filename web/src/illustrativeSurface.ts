import {THREE} from 'spacekit.js';

// Deterministic artwork. No color or terrain here is inferred from catalog measurements.
export function illustrativeSurface(name:string){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
 const context=canvas.getContext('2d')!;
 const image=context.createImageData(canvas.width,canvas.height);
 const seed=[...name].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,19);
 const palettes=[[102,151,158],[177,132,102],[133,155,128],[152,137,171],[163,151,114]];
 const base=palettes[seed%palettes.length];
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const latitude=(y/127-.5)*Math.PI;
  const broad=Math.sin(x*.045+seed*.001)*.22+Math.sin(x*.087+y*.12+seed*.0003)*.16;
  const fine=Math.sin(x*.23-y*.18+seed*.003)*.08+Math.sin(x*.39+y*.27)*.045;
  const ice=Math.max(0,(Math.abs(Math.sin(latitude))-.8)*2.7);
  const value=Math.max(.37,Math.min(1.3,.79+broad+fine+ice*.4));
  const offset=(y*256+x)*4;
  for(let channel=0;channel<3;channel++)image.data[offset+channel]=Math.min(255,Math.round(base[channel]*value+ice*30));
  image.data[offset+3]=255;
 }
 context.putImageData(image,0,0);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.wrapS=THREE.RepeatWrapping;
 return texture;
}
