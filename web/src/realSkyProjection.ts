export type SkyHost={raDeg:number;decDeg:number;distancePc:number};
export type SkyVector={x:number;y:number;z:number};
const radians=(degrees:number)=>degrees*Math.PI/180;

/** Legacy campaign X/Y remains intact; depth is illustrative and stable, never real astronomy. */
export function campaignVector(star:{id:number;x:number;y:number},width:number,height:number):SkyHost{
 const x=(star.x/Math.max(1,width)-.5)*14,y=(.5-star.y/Math.max(1,height))*10;
 const z=(((star.id*73+19)%101)/100-.5)*7,distance=Math.max(.01,Math.hypot(x,y,z));
 return {raDeg:Math.atan2(z,x)*180/Math.PI,decDeg:Math.asin(y/distance)*180/Math.PI,distancePc:distance};
}

/** Equatorial catalog coordinates become Cartesian positions in parsecs from the Sun. */
export function catalogVector(host:SkyHost):SkyVector{
 const ra=radians(host.raDeg),dec=radians(host.decDeg),distance=host.distancePc;
 return {x:distance*Math.cos(dec)*Math.cos(ra),y:distance*Math.sin(dec),z:distance*Math.cos(dec)*Math.sin(ra)};
}
