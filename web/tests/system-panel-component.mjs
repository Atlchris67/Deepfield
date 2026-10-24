import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

let browser;
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
try{
 await server.listen();browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/real-systems-fixture.html`);
 await page.getByRole('button',{name:'Open campaign atlas'}).click();
 const atlas=page.getByRole('dialog',{name:'Real star and planet atlas'}),sky=atlas.getByRole('group',{name:'Nearby real star systems'});
 const details=atlas.getByRole('region',{name:'Selected system: Proxima Cen'});
 await sky.locator('.spacekitGalaxyCanvas canvas').waitFor();
 assert.equal(await sky.locator('.spacekitGalaxyCanvas canvas').count(),1);
 const marker=sky.getByRole('button',{name:'Show system details for Proxima Cen'});
 await marker.click();await details.waitFor();
 assert.equal(await page.getByRole('dialog',{name:'Proxima Cen'}).count(),0,'marker selects right panel');
 for(const tabName of ['Resources','Ships','Defenses','Orbit']){
  const tab=details.getByRole('tab',{name:tabName});await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowRight');assert.equal(await tab.getAttribute('aria-selected'),'false');
  await tab.click();
 }
 await details.getByRole('button',{name:'Open Proxima Cen b planet details'}).click();
 const planet=details.getByRole('region',{name:'Proxima Cen b size comparison'});await planet.waitFor();
 assert.match(await planet.innerText(),/estimated 1\.02 Earth radii/);
 await planet.locator('canvas').waitFor();
 await planet.getByRole('button',{name:'Back to system'}).click();await planet.waitFor({state:'detached'});
 await details.getByRole('button',{name:'Open Proxima Cen d planet details'}).click();
 assert.match(await details.innerText(),/estimated 0\.69 Earth radii/);
 await page.keyboard.press('Escape');assert.equal(await details.getByRole('region',{name:'Proxima Cen d size comparison'}).count(),0);
 const orbit=details.getByRole('img',{name:/Spacekit orbital view/}),before=await orbit.boundingBox();
 for(let index=0;index<8;index++)await details.getByRole('button',{name:'Zoom orbit in'}).click();
 const after=await orbit.boundingBox();assert.ok(Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1);
 await page.setViewportSize({width:390,height:690});assert.ok((await sky.boundingBox()).width<=390);
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 assert.deepEqual(errors,[]);console.log('System panel, planet comparison, and fixed orbit viewport checks passed.');
}finally{if(browser)await browser.close();await server.close();}
