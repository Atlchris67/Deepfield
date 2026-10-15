import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
let browser;let checks=0;function check(value,name){assert.ok(value,name);checks++;console.log('PASS '+name);}
try{
 await server.listen();const address=server.httpServer.address();
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${address.port}/tests/fleet-fixture.html`);
 const open=()=>page.getByRole('button',{name:'Open selector',exact:true}).click();
 const add=()=>page.getByRole('button',{name:'Add expedition to draft',exact:true});
 const orders=()=>page.getByTestId('orders').innerText();
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('10');
 check(await add().isDisabled()&&await page.getByText('Interceptor: only 8 available after drafted departures; 10 selected.').count()===1,'Actual modal distinguishes insufficient inventory');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();check(await orders()==='0','Cancel adds no orders');
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('2');await page.getByLabel('Expedition source').selectOption('1');
 check(await page.getByLabel('Send Interceptor',{exact:true}).inputValue()==='0'&&await page.getByTestId('available-interceptor').innerText()==='2','Actual source switch resets counts and availability');
 await page.keyboard.press('Escape');check(await page.getByRole('dialog').count()===0&&await orders()==='0','Escape discards dialog state');
 await open();await page.goBack();check(await page.getByRole('dialog').count()===0,'Back closes the modal');
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('3');await add().evaluate(button=>{button.click();button.click();});
 check(await page.getByTestId('calls').innerText()==='1','Synchronous repeated Add clicks invoke onAdd once');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Complete pending read',exact:true}).click();
 check(await orders()==='0','Cancel during asynchronous confirmation cannot append orders');
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('3');await add().click();
 await page.getByRole('button',{name:'Complete pending read',exact:true}).evaluate(button=>button.click());await page.getByRole('dialog').waitFor({state:'detached'});
 check(await orders()==='1','Confirmed selection adds exactly one order');
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('6');
 check(await page.getByTestId('available-interceptor').innerText()==='5'&&await add().isDisabled(),'Actual modal reserves prior three and blocks another six');
 await page.getByLabel('Send Interceptor',{exact:true}).fill('5');await add().click();await page.getByRole('button',{name:'Complete pending read',exact:true}).evaluate(button=>button.click());await page.getByRole('dialog').waitFor({state:'detached'});
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('1');
 check(await add().isDisabled()&&await page.getByText('Interceptor: no ships remain available after drafted departures.').count()===1,'Actual modal explicitly reports exhausted inventory');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Fill order slots',exact:true}).click();
 await open();await page.getByLabel('Send Interceptor',{exact:true}).fill('1');
 check(await add().isDisabled()&&await page.getByText(/Turn order limit: 24 of 24 slots already used/).count()===1,'Actual modal shows distinct 24-order capacity message');
 check(errors.length===0,'Component interactions have no uncaught browser errors');
 await mkdir('../test-results',{recursive:true});await page.screenshot({path:'../test-results/fleet-validation.png'});
 console.log(`${checks} isolated frontend component checks passed; synthetic fixture only, no API or .NET process.`);
}finally{if(browser)await browser.close();await server.close();}
