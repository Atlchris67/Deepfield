export const hulls=[{id:'interceptor',label:'Interceptor',cost:5,counters:'Torpedo boats and bombers'},
 {id:'torpedo',label:'Torpedo boat',cost:10,counters:'Cruisers and disruptors'},
 {id:'cruiser',label:'Cruiser',cost:15,counters:'Interceptors and bombers'},
 {id:'bomber',label:'Bomber',cost:12,counters:'Torpedo boats and disruptors'},
 {id:'disruptor',label:'Disruptor',cost:8,counters:'Interceptors and cruisers'}];
export function Composition({counts}:{counts:number[]}){
 return <span>{hulls.map((h,i)=>`${counts[i]} ${h.label.toLowerCase()}`).join(' · ')}</span>;
}
export function FleetPanel({counts}:{counts:number[]}){
 return <div className="fleetPanel" aria-label="Your fleet composition"><strong>Your fleet composition</strong><p><Composition counts={counts}/></p><details><summary>Hull counters and costs</summary><ul>{hulls.map(h=><li key={h.id}>{h.label} · {h.cost} credits · counters {h.counters.toLowerCase()}</li>)}</ul><p>Two interceptors establish a colony; specialist ships cannot. Fixed defenses use the interceptor matchup profile. Simultaneous counter salvos are followed by a rout of the side with less surviving credit value. This preview is provisional balance.</p></details></div>;
}
