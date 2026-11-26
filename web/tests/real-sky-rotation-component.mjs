import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

let browser,checks=0;
const check=(ok,name)=>{assert.ok(ok,name);checks++;console.log('PASS '+name);};
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},appType:'mpa'});
try{
 await server.listen();browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/real-systems-fixture.html`);
 await page.getByRole('button',{name:'Open campaign atlas'}).click();
 const atlas=page.getByRole('dialog',{name:'Real star and planet atlas'}),sky=atlas.getByRole('group',{name:'Nearby real star systems'}),orbit=atlas.getByRole('img',{name:/Spacekit orbital view/});
 await atlas.waitFor();await sky.locator('.spacekitGalaxyCanvas canvas').waitFor({state:'attached'});
 await mkdir('../test-results',{recursive:true});
 await page.screenshot({path:'../test-results/galaxy-visual-desktop.png',fullPage:true});
 check(await sky.locator('.spacekitGalaxyCanvas canvas').count()===1,'Spacekit renders the galaxy in a fixed canvas');
 check((await sky.locator('.realSkyControls').innerText()).includes('100%'),'Galaxy starts framed at 100%');
 const near=sky.getByRole('button',{name:'Show system details for Proxima Cen'}),far=sky.getByRole('button',{name:/^Show system details for /}).nth(1);
 await near.waitFor({state:'visible'});await far.waitFor({state:'visible'});

 check((await far.getAttribute('class')).includes('unknown')&&await far.locator('.realStarName').isVisible(),'Unknown marker remains hollow with a readable name');
 const skyBox=await sky.boundingBox(),before=await far.getAttribute('style');
 await page.mouse.move(skyBox.x+45,skyBox.y+90);await page.mouse.down();await page.mouse.move(skyBox.x+110,skyBox.y+128,{steps:8});await page.mouse.up();
 await page.waitForTimeout(150);check((await far.getAttribute('style'))!==before,'Dragging the Spacekit canvas rotates the 3D stars and labels');
 await atlas.getByRole('button',{name:'Zoom real sky in'}).click();await atlas.getByRole('button',{name:'Zoom real sky in'}).click();
 check(!(await sky.locator('.realSkyControls').innerText()).includes('100%'),'Spacekit camera zoom changes within fixed viewport');
 await atlas.getByRole('button',{name:'Reset sky'}).click();check((await sky.locator('.realSkyControls').innerText()).includes('100%'),'Sky reset restores framing');
 const nearBox=await near.boundingBox();await page.mouse.move(nearBox.x+nearBox.width/2,nearBox.y+nearBox.height/2);await page.mouse.down();await page.mouse.move(nearBox.x+nearBox.width/2+40,nearBox.y+nearBox.height/2+25,{steps:8});await page.mouse.up();
 check(await page.getByRole('dialog',{name:'Proxima Cen'}).count()===0,'Dragging a star label does not open statistics');
 await far.locator('.realStarName').click();const farName=(await far.getAttribute('aria-label')).replace('Show system details for ','');await atlas.getByRole('button',{name:'Open full system statistics'}).click();const unknown=page.getByRole('dialog',{name:farName});await unknown.waitFor();
 check((await unknown.innerText()).includes('Unknown statistics')&&!(await unknown.innerText()).includes('18 credits / turn'),'Unknown statistics stay fogged');
 await unknown.getByRole('button',{name:'Close planet statistics'}).click();await unknown.waitFor({state:'detached'});
 await near.focus();await page.keyboard.press('Enter');await atlas.getByRole('button',{name:'Open full system statistics'}).click();const own=page.getByRole('dialog',{name:'Proxima Cen'});await own.waitFor();
 check((await own.innerText()).includes('18 credits / turn'),'Keyboard activation opens owned system statistics');
 await own.getByRole('button',{name:'Close planet statistics'}).click();await own.waitFor({state:'detached'});
 const planetEntry=atlas.getByRole('button',{name:/^Open .* planet details$/}).first();
 await planetEntry.focus();await page.keyboard.press('Enter');
 const backToSystem=atlas.getByRole('button',{name:'Back to system'});
 await backToSystem.waitFor();check(await backToSystem.evaluate(button=>button===document.activeElement),'Opening a planet moves keyboard focus to Back to system');
 await page.keyboard.press('Escape');await backToSystem.waitFor({state:'detached'});
 check(await planetEntry.evaluate(button=>button===document.activeElement)&&await atlas.isVisible(),'Escape returns focus to the planet entry without closing the atlas');
 await planetEntry.click();await backToSystem.click();await backToSystem.waitFor({state:'detached'});
 check(await planetEntry.evaluate(button=>button===document.activeElement),'Back to system restores focus after pointer activation');
 const orbitBefore=await orbit.boundingBox();for(let i=0;i<8;i++)await atlas.getByRole('button',{name:'Zoom orbit in'}).click();const orbitAfter=await orbit.boundingBox();
 check(Math.abs(orbitAfter.width-orbitBefore.width)<1&&Math.abs(orbitAfter.height-orbitBefore.height)<1,'Orbital zoom keeps its fixed viewport');
 await page.setViewportSize({width:390,height:690});check((await sky.boundingBox()).width<=390,'Galaxy canvas remains inside mobile viewport');
 await page.screenshot({path:'../test-results/galaxy-visual-mobile.png',fullPage:true});
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 const referenceOpener=page.getByRole('button',{name:'Open reference atlas'});await referenceOpener.click();await atlas.waitFor();await sky.getByRole('button',{name:'Show system details for Proxima Cen'}).focus();await page.keyboard.press('Enter');
 check((await atlas.innerText()).includes('Reference astronomy only; no campaign statistics')&&await page.getByRole('dialog').count()===1,'Reference stars do not invent campaign statistics');
 await page.keyboard.press('Escape');await atlas.waitFor({state:'detached'});
 check(await referenceOpener.evaluate(button=>button===document.activeElement),'Escape without planet detail closes the atlas and restores the opener');
 await page.getByRole('button',{name:'Show primary real sky'}).click();const primary=page.getByRole('region',{name:'Real star and planet atlas'}).first();await primary.waitFor();
 check(await primary.locator('.spacekitGalaxyCanvas canvas').count()===1,'Primary embedded galaxy uses Spacekit');
 const originalCanvas=await primary.locator('.spacekitGalaxyCanvas canvas').elementHandle();
 await page.getByRole('button',{name:'Refresh campaign view'}).click();
 check(await originalCanvas.evaluate(canvas=>canvas.isConnected)&&await primary.locator('.spacekitGalaxyCanvas canvas').count()===1,'Refreshing campaign data reuses one Spacekit simulation and canvas');
 await primary.getByRole('button',{name:'Show system details for Proxima Cen'}).click();await primary.getByRole('button',{name:'Open full system statistics'}).click();const dossier=page.getByRole('dialog',{name:'Proxima Cen'});await dossier.waitFor();
 check(await primary.isVisible()&&await dossier.isVisible(),'Primary galaxy star opens the mapped dossier');
 await dossier.getByRole('button',{name:'Close planet statistics'}).click();
 await dossier.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Open reference atlas'}).click();await atlas.waitFor();
 check(await atlas.evaluate(modal=>{
  const embedded=document.querySelector('.inlineRealSky');
  const labels=[modal,embedded].map(region=>region?.getAttribute('aria-labelledby'));
  return !!labels[0]&&!!labels[1]&&labels[0]!==labels[1]&&[modal,embedded].every((region,index)=>region?.querySelector('h2')===document.getElementById(labels[index]));
 }),'Embedded sky and reference atlas each reference their own heading');
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Open atlas with historical intelligence'}).click();await atlas.waitFor();
 const historical=sky.locator('.realStar.reported-enemy');await historical.waitFor();
 check((await historical.getAttribute('aria-description'))?.includes('current ownership unconfirmed')&&await historical.locator('.realStarDot').evaluate(dot=>getComputedStyle(dot).borderTopStyle==='dashed')&&await sky.getByRole('group',{name:'Galaxy marker legend'}).getByText('Enemy (last seen)',{exact:true}).isVisible(),'Historical enemy reports use a separate marker and legend entry');
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Open atlas with historical intelligence'}).click();await atlas.waitFor();
 await historical.click();
 await atlas.getByRole('button',{name:'Open full system statistics'}).click();
 const surveyDossier=page.locator('dialog.planetDialog');await surveyDossier.waitFor();
 const surveyRow=surveyDossier.locator('.planetFacts div').filter({hasText:'Deep material survey'});
 check((await surveyRow.innerText()).includes('1 planet')&&(await surveyRow.innerText()).includes('observed turn 1'),'Full dossier retains separately dated deep material survey after a newer limited report');
 await surveyDossier.getByRole('tab',{name:'Ships'}).click();
 check((await surveyDossier.getByRole('tabpanel',{name:'Ships'}).innerText()).includes('Enemy fleet count is unknown.')&&
       await surveyDossier.getByText(/A returning deep scout can report exact ship and scout counts/).isVisible()&&
       await surveyDossier.getByText(/No enemy ships were observed/).count()===0,
       'Newer limited recon stays unknown and points to a returning deep scout, not to the older zero count');
 await surveyDossier.getByRole('button',{name:'Close planet statistics'}).click();
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Open atlas with confirmed zero ships'}).click();await atlas.waitFor();
 await sky.locator('.realStar[data-system="1"]').click();
 await atlas.getByRole('button',{name:'Open full system statistics'}).click();await surveyDossier.waitFor();
 await surveyDossier.getByRole('tab',{name:'Ships'}).click();
 check(await surveyDossier.getByText('Fleet observation: turn 1. Not a live count.',{exact:true}).isVisible()&&
       await surveyDossier.getByText('No enemy ships were observed on this report.',{exact:true}).isVisible()&&
       await surveyDossier.getByText(/fleet count is unknown/).count()===0,
       'Confirmed zero remains dated and never displays the unknown-count prompt');
 await surveyDossier.getByRole('button',{name:'Close planet statistics'}).click();
 await atlas.getByRole('button',{name:'Close atlas'}).click();await atlas.waitFor({state:'detached'});
 check(errors.length===0,'No browser errors');console.log(`${checks} Spacekit galaxy browser checks passed.`);
}finally{if(browser)await browser.close();await server.close();}
