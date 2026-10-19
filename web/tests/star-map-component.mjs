import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
let browser,checks=0;const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
try{
 await server.listen();browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/star-map-fixture.html`);
 const opener=page.getByRole('button',{name:'Open star map setup'});await opener.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 await page.getByLabel('Generated star map preview').waitFor();
 check((await dialog.innerText()).includes('24 systems · 23 routes')&&(await dialog.innerText()).includes('Seed 42017'),'Default deterministic preview generates on open');
 check((await dialog.innerText()).includes('does not replace or modify the current campaign'),'Preview boundary is explicit');
 await page.getByLabel('Seed').fill('73');await page.getByRole('button',{name:'Generate preview'}).click();await page.getByText('Seed 73 · Generator v1').waitFor();
 check((await page.getByRole('img').getAttribute('aria-label'))==='Preview of 24 generated star systems','Map exposes an accessible preview description');
 await page.getByLabel('Systems').fill('51');await page.getByRole('button',{name:'Generate preview'}).click();await page.getByRole('alert').waitFor();
 check((await page.getByRole('alert').innerText()).includes('above 50'),'Generator errors appear inside the modal');
 await page.setViewportSize({width:390,height:700});
 check(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth&&element.getBoundingClientRect().height<=innerHeight),'Mobile setup modal fits the viewport');
 await page.getByRole('button',{name:'Close star map setup'}).click();await dialog.waitFor({state:'detached'});
 check(await opener.evaluate(element=>element===document.activeElement),'Closing restores focus to the opener');
 check(errors.length===0,'No browser errors');
 console.log(`${checks} star-map component checks passed.`);
}finally{if(browser)await browser.close();await server.close();}
