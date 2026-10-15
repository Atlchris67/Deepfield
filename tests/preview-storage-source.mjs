// Static wiring checks only. Does not load or execute any .NET assembly.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const program=read('src/Deepfield.Api/Program.cs'),policy=read('src/Deepfield.Api/PreviewStorage.cs');
const profile=JSON.parse(read('src/Deepfield.Api/Properties/launchSettings.json')).profiles['Deepfield isolated preview'];
let checks=0;function check(value,name){assert.ok(value,name);checks++;console.log('PASS '+name);}
check(profile.environmentVariables.IsolatedPreview==='true','IDE profile explicitly opts into isolated storage');
check(!('SavePath' in profile.environmentVariables),'IDE profile does not supply an existing save');
check(program.indexOf('PreviewStorage.Resolve(')<program.indexOf('new PostgresGameStore('),'Preview guard precedes PostgreSQL construction/initialization');
check(program.indexOf('PreviewStorage.Resolve(')<program.indexOf('AddHostedService<TurnWorker>'),'Preview guard precedes background worker registration');
check(program.includes('builder.Configuration.GetConnectionString("Deepfield")')&&program.includes('builder.Configuration["SavePath"]'),'Guard receives effective configuration, including inherited values');
check(program.includes('new FileGameStore(savePath,NewGame)'),'File store consumes policy-selected path');
check(policy.indexOf('if (!isolated) return savePath')<policy.indexOf('rejects ConnectionStrings'),'Normal non-preview configuration stays outside isolation restrictions');
check(policy.includes('Path.GetTempPath()')&&policy.includes('Guid.NewGuid()'),'Preview path uses unique disposable storage');
check(policy.includes('rejects ConnectionStrings:Deepfield')&&policy.includes('rejects SavePath'),'Both inherited database and save path fail closed');
console.log(`${checks} static preview wiring checks passed; runtime behavior is not verified.`);
