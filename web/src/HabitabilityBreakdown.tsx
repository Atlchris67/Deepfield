export type Factors={thermalStress?:number|null;gravityStress?:number|null;radiationStress?:number|null};

export function HabitabilityBreakdown({factors,label}:{factors?:Factors|null;label:string}){
 const entries=[
  {name:'Temperature',value:factors?.thermalStress},
  {name:'Gravity',value:factors?.gravityStress},
  {name:'Radiation',value:factors?.radiationStress},
 ];
 const complete=entries.every(entry=>typeof entry.value==='number'&&Number.isInteger(entry.value)&&entry.value>=0&&entry.value<=100);
 if(!complete)return <small>No factor breakdown recorded</small>;
 const worst=Math.max(...entries.map(entry=>entry.value!));
 const limiting=entries.filter(entry=>entry.value===worst).map(entry=>entry.name);
 return <>
  <small>{worst===0?'No limiting stress':(limiting.length===1?'Main limit: ':'Main limits (tied): ')+limiting.join(', ')}</small>
  <details>
   <summary aria-label={'Environmental stress for '+label}>See factors</summary>
   <ul>{entries.map(({name,value})=><li key={name}>{name}: {value}/100</li>)}</ul>
   <small>Higher means more stress. The worst factor weighs most in the score.</small>
  </details>
 </>;
}
