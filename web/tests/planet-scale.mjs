import assert from 'node:assert/strict';
import {radiusSceneUnits} from '../src/planetScale.ts';

const earth=radiusSceneUnits(1),b=radiusSceneUnits(1.02),d=radiusSceneUnits(.69);
assert.equal(b/earth,1.02);
assert.equal(d/earth,.69);
assert.ok(Math.abs(b/d-1.02/.69)<1e-12);
assert.throws(()=>radiusSceneUnits(0),RangeError);
console.log('Planet radius ratios retain the catalog estimates on one linear scale.');
