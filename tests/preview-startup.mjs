// Authored integration regression; do NOT run while Deepfield execution is paused.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'deepfield-preview-startup-'));const save=join(dir,'sentinel.json');
await writeFile(save,'Existing campaign sentinel - must not change');
for(const [connection,expected] of [['Host=127.0.0.1;Port=1;Database=never_connect','rejects ConnectionStrings:Deepfield'],['','rejects SavePath']]){
 const child=spawn('dotnet',[join(root,'src/Deepfield.Api/bin/Debug/net10.0/Deepfield.Api.dll')],{cwd:join(root,'src/Deepfield.Api'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ASPNETCORE_ENVIRONMENT:'Development',ASPNETCORE_URLS:'http://127.0.0.1:5099',IsolatedPreview:'true',ConnectionStrings__Deepfield:connection,SavePath:save,Teams__0__Key:randomBytes(24).toString('hex'),Teams__1__Key:randomBytes(24).toString('hex')}});
 let log='';child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);
 const timeout=setTimeout(()=>child.kill(),10000);
 try{
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  assert.notEqual(code,0);assert.ok(log.includes(expected),`Expected startup rejection: ${expected}`);
  assert.equal(await readFile(save,'utf8'),'Existing campaign sentinel - must not change');
  console.log('PASS startup '+expected+'; sentinel unchanged');
 }finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();}
}
console.log('2 isolated-preview startup checks passed. Sentinel fixture retained at '+dir);
