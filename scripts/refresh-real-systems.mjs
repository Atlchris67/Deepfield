// Run explicitly to refresh the checked-in NASA Exoplanet Archive snapshot.
import {readFile,writeFile} from 'node:fs/promises';

const query='select top 500 hostname,pl_name,ra,dec,sy_dist,pl_orbper,pl_orbsmax,pl_rade,st_teff from pscomppars where sy_dist<50 and pl_orbper is not null and pl_orbsmax is not null order by sy_dist';
const source=`https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`;
const rows=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):await (await fetch(source)).json();
const hosts=new Map();
for(const row of rows){
 if(!hosts.has(row.hostname))hosts.set(row.hostname,{name:row.hostname,raDeg:row.ra,decDeg:row.dec,distancePc:row.sy_dist,temperatureK:row.st_teff,planets:[]});
 const host=hosts.get(row.hostname);
 if(host.planets.length<8)host.planets.push({name:row.pl_name,periodDays:row.pl_orbper,semiMajorAu:row.pl_orbsmax,radiusEarth:row.pl_rade});
}
const systems=[...hosts.values()].slice(0,24);
if(systems.length!==24||systems.some(s=>!s.planets.length))throw Error('NASA query did not return 24 usable hosts.');
const snapshot={source:'NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)',sourceUrl:source,retrievedUtc:new Date().toISOString(),systems};
await writeFile('web/src/realSystems.json',JSON.stringify(snapshot,null,2)+'\n');
console.log(`Saved ${systems.length} observed host stars and ${systems.reduce((n,s)=>n+s.planets.length,0)} confirmed planets.`);
