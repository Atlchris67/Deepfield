export type Intel={id:string;star:number;turn:number;at:string;phase:string;mission:string;returned:boolean;enemyPresent:boolean|null;ownerObserved:boolean;owner:number|null;fleetBand:string|null;enemyShips:number|null;enemyScouts:number|null;collectors:number|null};

export function IntelligencePanel({reports,turn,stars}:{reports:Intel[];turn:number;stars:{id:number;name:string;visible:boolean}[]}){
 return <section className="panel intelPanel" aria-label="Clan intelligence"><div className="panelTitle"><h2>Clan intelligence</h2><span>PRIVATE · LAST-KNOWN OBSERVATIONS</span></div>
 <p>These reports describe what a scout encountered, not what is there now. Exact details require a deep mission and a safe return.</p>
 {reports.length===0?<p className="empty">No scout reports yet. Build scouts at your colony, then send a mission on a later turn.</p>:<div className="intelReports">{reports.map(report=><article key={report.id} className="intelReport">
 <h3>{stars.find(s=>s.id===report.star)?.name} · {report.mission}</h3>
 <small>Last observed turn {report.turn} · {Math.max(0,turn-report.turn)} turn(s) ago · {new Date(report.at).toLocaleString()} · {report.phase}</small>
 <p>{report.returned?'Scout returned':'Scout destroyed — limited contact only'}. {report.enemyPresent===true?'Enemy contact detected.':report.enemyPresent===false?'No enemy contact detected at that time.':'Contact unconfirmed.'}</p>
 {report.ownerObserved&&<p>Observed owner: {report.owner===null?'Unclaimed':report.owner===0?'Aurora Federation':'Ember Empire'}.</p>}
 {report.enemyShips!==null?<p>Exact at observation: {report.enemyShips} enemy combat ships · {report.enemyScouts} enemy scouts · {report.collectors} collectors.</p>:report.fleetBand!==null&&<p>Estimated enemy combat fleet: {report.fleetBand} ships.</p>}
 {stars.find(s=>s.id===report.star)?.visible&&<small>Live observation is also available on the map; this record remains historical.</small>}
 </article>)}</div>}
 </section>;
}
