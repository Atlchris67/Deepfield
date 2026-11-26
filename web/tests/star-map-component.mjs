import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

let browser,checks=0;
const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
try{
 await server.listen();browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/star-map-fixture.html`);
 const opener=page.getByRole('button',{name:'Open star map setup'});await opener.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 await page.getByLabel('Generated star map preview').waitFor();
 check((await dialog.innerText()).includes('24 systems')&&(await dialog.innerText()).includes('Real catalog v1'),'Default real-catalog preview generates on open');
 check((await dialog.innerText()).includes('Your current campaign remains unchanged'),'Separate campaign boundary is explicit');
 const modePicker=dialog.getByRole('combobox',{name:'Rules mode'});
 check(await modePicker.inputValue()==='advanced'&&await dialog.getByRole('slider').count()===2&&(await dialog.innerText()).includes('Rules mode: Advanced'),'The local tool defaults to advanced mode with an industrial focus for each clan');
 await modePicker.selectOption('simple');
 check(await dialog.getByRole('slider').count()===0&&(await dialog.innerText()).includes('Rules mode: Simple')&&(await dialog.innerText()).includes('credits only')&&await dialog.getByRole('radio').count()===0&&await dialog.getByRole('combobox',{name:'Fleet rules'}).count()===0,
  'Simple mode is one choice: no industrial focus, and the separate material and fleet switches are gone');
 await modePicker.selectOption('advanced');
 await page.getByRole('button',{name:'Generate preview'}).click();await page.getByRole('button',{name:'Start new campaign'}).waitFor();
 check((await page.getByRole('img').getAttribute('aria-label'))==='Preview of 24 generated star systems','Map exposes an accessible preview description');
 check(await dialog.getByText('Proxima Cen',{exact:false}).count()>0,'Real catalog homeworld is named in the preview');
 check(await dialog.getByLabel('Seed').count()===0,'Fictional seed controls are absent');
 await page.setViewportSize({width:390,height:700});
 check(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth&&element.getBoundingClientRect().height<=innerHeight),'Mobile setup modal fits the viewport');
 await page.getByRole('button',{name:'Close star map setup'}).click();await dialog.waitFor({state:'detached'});
 check(await opener.evaluate(element=>element===document.activeElement),'Closing restores focus to the opener');
 check((await page.getByTestId('start-status').innerText())==='No campaign started','Cancel leaves campaign unstarted');
 await opener.click();await page.getByRole('button',{name:'Start new campaign'}).waitFor();
 await page.getByRole('button',{name:'Start new campaign'}).evaluate(button=>{button.click();button.click();});
 await page.getByRole('alert').filter({hasText:'Fixture start failed'}).waitFor();
 const firstId=await page.getByTestId('start-attempts').innerText();
 check(firstId.length===32,'Repeated clicks issue one start and preserve its ID for recovery');
 await page.getByRole('button',{name:'Start new campaign'}).click();
 await dialog.waitFor({state:'detached'});
 check((await page.getByTestId('start-status').innerText())==='Started real catalog 1'&&
       (await page.getByTestId('start-attempts').innerText())===`${firstId},${firstId}`,'Retry uses the same preview and ID, then starts once');
 check(errors.length===0,'No browser errors');
 console.log(`${checks} star-map component checks passed.`);
}finally{if(browser)await browser.close();await server.close();}
