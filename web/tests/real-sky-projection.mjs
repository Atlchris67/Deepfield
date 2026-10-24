import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {catalogVector,campaignVector} from '../src/realSkyProjection.ts';
import {frameDistance,routeVertices} from '../src/galaxySceneData.ts';

const catalog=JSON.parse(readFileSync(new URL('../src/realSystems.json',import.meta.url))).systems;
const items=catalog.map((host,index)=>{const v=catalogVector(host);return {key:`real-${index}`,name:host.name,position:[v.x,v.y,v.z],kind:'reference',title:host.name};});
assert.equal(items.length,24);
for(let index=0;index<catalog.length;index++)assert.ok(Math.abs(Math.hypot(...items[index].position)-catalog[index].distancePc)<1e-9);
console.log('PASS catalog stars retain measured parsec distances');
const distance=frameDistance(items);
for(const [width,height] of [[390,280],[516,430],[1000,650]]){
 const camera=new THREE.PerspectiveCamera(50,width/height,.01,2000);camera.position.set(0,-distance,distance*.22);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const projected=items.map(item=>new THREE.Vector3(...item.position).project(camera));
 assert.ok(projected.every(point=>Math.abs(point.x)<.9&&Math.abs(point.y)<.9&&point.z<1));
}
console.log('PASS Spacekit camera framing fits the catalog at mobile and desktop aspect ratios');
const fictional=[{id:0,x:10,y:20},{id:1,x:85,y:70},{id:2,x:30,y:60}].map(star=>campaignVector(star,100,100));
assert.equal(new Set(fictional.map(star=>star.distancePc.toFixed(4))).size,3);
console.log('PASS legacy systems keep stable positions without a shared spherical shell');
const campaign=fictional.map((host,id)=>{const v=catalogVector(host);return {key:`campaign-${id}`,name:`Campaign ${id}`,position:[v.x,v.y,v.z],kind:'unknown',campaignId:id,title:`Campaign ${id}`};});
const all=[...items,...campaign],links=[{from:0,to:2},{from:2,to:1}];
assert.deepEqual(routeVertices(all,links),[campaign[0].position,campaign[2].position,campaign[2].position,campaign[1].position]);
assert.deepEqual(routeVertices(items,links),[]);
console.log('PASS only saved campaign links attach to campaign coordinates; reference stars grant no routes');
const rotated=new THREE.PerspectiveCamera(50,516/430,.01,2000);rotated.position.set(distance*.8,-distance*.6,distance*.25);rotated.lookAt(0,0,0);rotated.updateMatrixWorld();
for(const [a,b] of [[0,2],[2,1]]){
 const segment=routeVertices(all,[{from:a,to:b}]);
 assert.deepEqual(new THREE.Vector3(...segment[0]).project(rotated).toArray(),new THREE.Vector3(...campaign[a].position).project(rotated).toArray());
 assert.deepEqual(new THREE.Vector3(...segment[1]).project(rotated).toArray(),new THREE.Vector3(...campaign[b].position).project(rotated).toArray());
}
console.log('PASS rotated 3D route endpoints coincide with their star positions');
