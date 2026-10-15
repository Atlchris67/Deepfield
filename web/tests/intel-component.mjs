import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
let browser,checks=0;function check(value,name){assert.ok(value,name);checks++;console.log('PASS '+name);}
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/intel-fixture.html`);
 const report=name=>page.locator('.intelReport').filter({has:page.getByRole('heading',{name:new RegExp(name+'$')})});
 const battle=await report('battle').innerText();
 check(battle.includes('4 enemy combat ships')&&battle.includes('Unknown enemy scouts')&&battle.includes('Unknown collectors'),'Battle report distinguishes known combat count from unknown scouts/collectors');
 check(!battle.includes('Observed fixed-defense strength'),'Unknown fixed defenses are omitted');
 check(battle.includes('Last observed turn 3')&&battle.includes('2 turn(s) ago'),'Battle intelligence remains explicitly dated');
 const deep=await report('deep').innerText();
 check(deep.includes('0 enemy combat ships')&&deep.includes('0 enemy scouts')&&deep.includes('0 collectors')&&!deep.includes('Unknown'),'Observed zero counts stay zero rather than Unknown');
 check(deep.includes('Observed fixed-defense strength: 0.')&&deep.includes('Observed owner: Unclaimed.'),'Observed zero defenses and unclaimed ownership remain explicit');
 const limited=await report('close').innerText();
 check(limited.includes('Contact unconfirmed.')&&!limited.includes('Exact at observation:')&&!limited.includes('Observed enemy composition:'),'Lost scout never displays fabricated exact counts or composition');
 check(!limited.includes('Observed owner:'),'Unobserved ownership is omitted');
 await page.setViewportSize({width:390,height:844});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Intelligence panel has no mobile horizontal overflow');
 await page.getByRole('button',{name:'Switch to empty clan'}).click();
 check(await page.locator('.intelReport').count()===0&&await page.getByText('No scout reports yet.',{exact:false}).count()===1,'Replacing reports with another clan clears old intelligence');
 check(errors.length===0,'Intelligence fixture has no uncaught browser errors');
 console.log(`${checks} synthetic intelligence component checks passed; no API or .NET execution.`);
}finally{if(browser)await browser.close();await server.close();}
