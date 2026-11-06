const unitsPerEarth=.3;

export function radiusSceneUnits(radiusEarth:number):number{
 if(!Number.isFinite(radiusEarth)||radiusEarth<=0)throw new RangeError('Planet radius must be positive.');
 return radiusEarth*unitsPerEarth;
}
