import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const transpile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const fleet=url(transpile(await readFile(new URL('../src/fleetSelection.ts',import.meta.url),'utf8')));
const materialCode=transpile(await readFile(new URL('../src/materialReservations.ts',import.meta.url),'utf8')).replace("'./fleetSelection'",JSON.stringify(fleet));
const {materialReservations,materialIssueText}=await import(url(materialCode));
const editCode=transpile(await readFile(new URL('../src/draftEditing.ts',import.meta.url),'utf8')).replace("'./fleetSelection'",JSON.stringify(fleet)).replace("'./materialReservations'",JSON.stringify(url(materialCode)));
const {draftItem,validateEdit}=await import(url(editCode));
let checks=0;const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const star=(id,stock,gate=false)=>({id,name:`System ${id}`,known:true,visible:true,owner:0,gate,stockpile:stock,ships:[2,0],scouts:[0,0],fleets:[[2,0,0,0,0],[0,0,0,0,0]],defense:0});
const build=(source,ships)=>({kind:'build',source,target:source,ships,hull:'interceptor'});
const context={stars:[star(0,[5,0,0,5,0,0]),star(1,[10,0,0,10,0,0])],team:0,realCatalogVersion:1,logisticsVersion:0,materials:[5,0,0,5,0,0],links:[{from:0,to:1}],combatVersion:1,economyVersion:1,credits:100,turn:1,revision:0,deadline:'2099-01-01',winner:null};
let orders=[build(0,3),build(1,3)];
let rows=materialReservations(context,orders);
check(rows.find(row=>row.orderIndex===1&&row.material==='Ferrite').shortfall===1,'Pooled stock reserves earlier hull order before later hull order');
check(materialIssueText(rows.find(row=>row.orderIndex===1&&row.material==='Ferrite')).includes('1 short'),'Shortage explains material, affected order, system and amount');
const first=draftItem(orders[0]),second=draftItem(orders[1]);
const sixShipContext={...context,credits:30,materials:[5,0,0,6,0,0]};
const sixShipOrder=draftItem(build(0,6));
const sixShipRows=materialReservations(sixShipContext,[sixShipOrder]);
check(sixShipRows.find(row=>row.material==='Ferrite').shortfall===1&&sixShipRows.find(row=>row.material==='Neralite').shortfall===0,
 'Six neutral-price ships fit 30 credits yet require six Ferrite and six Neralite');
const shortDraft=[sixShipOrder],shortDraftBefore=JSON.stringify(shortDraft);
const ferriteShortfall=materialReservations({...sixShipContext,materials:[1,0,0,6,0,0]},shortDraft).find(row=>row.material==='Ferrite');
check(ferriteShortfall.shortfall===5&&materialIssueText(ferriteShortfall).includes('1 available')&&materialIssueText(ferriteShortfall).includes('5 short'),
 'One usable Ferrite clearly reports a five-Ferrite shortage for six ships');
check(JSON.stringify(shortDraft)===shortDraftBefore,'Shortage calculation preserves the six-ship draft for correction');
check(validateEdit(sixShipContext,[sixShipOrder],sixShipOrder.draftId,build(0,6)).length===0,
 'Material warning does not trap a local draft edit before commit');
check(materialReservations(context,[build(0,3),build(1,3)]).some(row=>row.shortfall>0),'Editor can explain insufficient Ferrite across orders');
check(validateEdit(context,[first,second],first.draftId,build(0,2)).length===0,'Correcting draft releases Ferrite reservation and permits valid edit');
check(materialReservations(context,[build(0,2),orders[1]]).every(row=>row.shortfall===0),'Corrected draft has no material shortage before commit');
const local={...context,logisticsVersion:1};
rows=materialReservations(local,[build(0,6)]);
check(rows.find(row=>row.material==='Ferrite').shortfall===1,'Ungated colony cannot spend remote Ferrite');
const gated={...local,stars:local.stars.map(s=>({...s,gate:true}))};
check(materialReservations(gated,[build(0,6)]).every(row=>row.shortfall===0),'Linked operational gates make remote stock accessible');
rows=materialReservations(gated,[build(0,8),build(1,8)]);
check(rows.find(row=>row.orderIndex===1&&row.material==='Ferrite').shortfall===1,'Orders at both ends share one gate-network reservation');
const disconnected={...gated,links:[]};
check(materialReservations(disconnected,[build(0,6)]).find(row=>row.material==='Ferrite').shortfall===1,'Unlinked gates do not share stock');
rows=materialReservations({...local,stars:[{...local.stars[0],stockpile:null},local.stars[1]]},[build(0,6)]);
check(rows.every(row=>row.available===null&&row.shortfall===0),'Unknown stock is not presented as zero or a proven shortage');
const transport={kind:'transport',source:0,target:1,ships:1,cargo:[4,0,0,0,0,0]};
check(materialReservations(context,[transport,build(0,2)]).find(row=>row.orderIndex===1&&row.material==='Ferrite').shortfall===1,'Transport cargo also reserves pooled material');
console.log(`${checks} material reservation checks passed.`);
