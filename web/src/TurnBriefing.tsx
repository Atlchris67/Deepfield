/** Reports are newest first. A completed turn's summary marks its report block. */
export function latestTurnReports(turn:number,reports:string[]):string[]{
 if(turn<2)return [];
 const marker=`Turn ${turn-1} complete.`;
 const start=reports.findIndex(report=>report.startsWith(marker));
 if(start<0)return [];
 const older=reports.findIndex((report,index)=>index>start&&/^Turn \d+ complete\./.test(report));
 return reports.slice(start,older<0?undefined:older);
}

export function TurnBriefing({turn,reports,onOpenReports}:{turn:number;reports:string[];onOpenReports:()=>void}){
 const latest=latestTurnReports(turn,reports);
 if(latest.length===0)return null;
 const events=latest.filter(report=>!/^Turn \d+( complete\.|: \d+ orders executed\.)/.test(report));
 return <section className="turnBriefing" aria-label={`Turn ${turn-1} debrief`}>
  <div><strong>Turn {turn-1} debrief</strong><span>{events.length?`${events.length} field event${events.length===1?'':'s'}`:'Your orders resolved'}</span></div>
  <ul>{(events.length?events:latest).slice(0,3).map((report,index)=><li key={index}>{report}</li>)}</ul>
  {latest.length>3&&<button type="button" className="quiet" onClick={onOpenReports}>Read all field reports</button>}
 </section>;
}
