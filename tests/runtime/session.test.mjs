import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"
import { connect } from "node:net"
import { listSessionRuntimes } from "../../dist/core/runtime.js"
import { observeProcessGroup, probeProcessGroupIdentity } from "../../dist/core/process.js"

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "../.."))
const moduleUrl = pathToFileURL(join(repo, "dist/core/runtime.js")).href
const processUrl = pathToFileURL(join(repo, "dist/core/process.js")).href
const cli = join(repo, "dist/cli.js")
const node = realpathSync(process.execPath)
const workerCode = `
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import * as runtime from ${JSON.stringify(moduleUrl)};
import { probeProcessGroupIdentity, observeProcessGroup } from ${JSON.stringify(processUrl)};
const root = process.argv[2], role = process.argv[3], cwd = join(root,'project');
const stamp = probeProcessGroupIdentity(process.pid);
if(role==='producer') {
 const owner=spawn(process.execPath,[process.argv[1],root,'owner'],{detached:true,stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,TASK22_PRODUCER:JSON.stringify(stamp)}});
 owner.on('message',message=>{process.send({...message,producerStamp:stamp});owner.disconnect();owner.unref()});
 process.on('message',()=>{});
 await new Promise(()=>{});
}
let handle, job, child, readyMessage, prepareInput;
const privateControl=Boolean(process.env.TASK22_PRODUCER);
const send = value => {if(privateControl && value.ready) readyMessage=value;else process.send(value)};
const cliCall = (action,input) => {
 const p = spawnSync(process.execPath,[${JSON.stringify(cli)},'runtime',action,'--stdin','--json','--state',root],{input:JSON.stringify(input),encoding:'utf8',env:process.env});
 const parsed=JSON.parse(p.stdout); if(!parsed.ok) throw new Error(parsed.error.code); return parsed.result;
};
if(role==='owner') {
 const ticket={id:'20261020-120000-abcdef',projectId:'example',status:'running',cwd,processGroupIdentity:process.env.TASK22_PRODUCER?JSON.parse(process.env.TASK22_PRODUCER):stamp};
 job=runtime.prepareJobRuntime(root,ticket,['node','-e','0'],process.env);
 ticket.runtime=job.receipt; writeFileSync(join(root,'running.json'),JSON.stringify(ticket));
 Object.assign(process.env,{CI_QUEUE_JOB_ENV_VERSION:'1',CI_QUEUE_JOB_ID:ticket.id,CI_QUEUE_PROJECT_ID:'example',CI_QUEUE_STATE_DIR:root});
 const input={projectId:'example',ticketId:ticket.id,sessionId:'fixture',producerStamp:{pid:ticket.processGroupIdentity.leaderPid,startedAt:ticket.processGroupIdentity.startedAt},sessionStamp:{pid:stamp.leaderPid,startedAt:stamp.startedAt},requirementDigest:job.receipt.requirementDigest,launchBindingDigest:'b'.repeat(64)};
 prepareInput=input;
 handle=cliCall('prepare-session',input);
 const again=runtime.prepareSessionRuntime(root,input);
 if(again.token!==handle.token) throw new Error('idempotency');
 for(const [key,value] of [['launchBindingDigest','c'.repeat(64)],['requirementDigest','d'.repeat(64)]]) {
  let refused=false;try{runtime.prepareSessionRuntime(root,{...input,[key]:value})}catch{refused=true}if(!refused)throw new Error('accepted divergent binding');
 }
 send({ready:true,handle,jobDirectory:job.directory,stamp});
} else send({ready:true,stamp});
const handleMessage=async (message,reply=send)=>{
 try {
 let result;
 if(message.action==='detach-job') {runtime.discardRuntimeDirectory(job.directory);rmSync(join(root,'running.json'));result=true;}
 if(message.action==='node') {
  const p=spawnSync(join(handle.directory,'bin/node'),['-e','console.log(process.execPath)'],{env:{...process.env,...handle.env},encoding:'utf8'});
  if(p.status!==0)throw new Error(p.stderr);result=p.stdout.trim();
 }
 if(message.action==='child') {
  child=spawn(join(handle.directory,'bin/node'),['-e',"const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)"],{env:{...process.env,...handle.env},detached:true,stdio:'ignore'});
  await new Promise(resolve=>setTimeout(resolve,180));result=probeProcessGroupIdentity(child.pid);
 }
 if(message.action==='stop-child') {const done=new Promise(resolve=>child.once('exit',resolve));process.kill(-child.pid,'SIGTERM');await done;result=true;}
 if(message.action==='prepare') result=cliCall('prepare-session',{...prepareInput,...message.input});
 if(message.action==='checkpoint') result=cliCall('checkpoint-session',handle);
 if(message.action==='release') result=cliCall('release-session',handle);
 if(message.action==='recover') result=cliCall('release-session',{...message.input,recoveryOwnerStamp:{pid:stamp.leaderPid,pgid:stamp.pgid,startedAt:stamp.startedAt}});
 reply({id:message.id,result});
 } catch(error) {reply({id:message.id,error:error.message});}
};
if(privateControl) {
 createServer(socket=>{
  let input='';socket.on('data',bytes=>{input+=bytes;if(input.includes('\\n')) {const message=JSON.parse(input.trim());handleMessage(message,result=>socket.end(JSON.stringify(result)+'\\n'))}});
 }).listen(join(root,'control.sock'),()=>process.send(readyMessage));
} else process.on('message',handleMessage);
`
function worker(root, role) {
  const script=join(root,"worker.mjs")
  if(!existsSync(script)) writeFileSync(script,workerCode,{mode:0o600})
  const child = spawn(node, [script, root, role], { detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"] })
  let stderr = ""; child.stderr.on("data", c => stderr += c)
  let sequence = 0, ownedStamp
  const ready = new Promise((resolve, reject) => {
    child.once("message", value => { ownedStamp=value.stamp; resolve(value) })
    child.once("exit", code => reject(new Error(`worker exit ${code}: ${stderr}`)))
  })
  return { child, ready, get ownedStamp() { return role==="producer"?ownedStamp:undefined }, async call(action, input) {
    const id = ++sequence
    if(role==="producer") return await new Promise((resolve,reject)=>{
      const socket=connect(join(root,"control.sock"));let body=""
      socket.setTimeout(15000,()=>socket.destroy(new Error("control timeout")))
      socket.on("error",reject);socket.on("connect",()=>socket.write(JSON.stringify({id,action,input})+"\n"))
      socket.on("data",bytes=>body+=bytes);socket.on("end",()=>resolve(JSON.parse(body)))
    })
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.off("message", listener); reject(new Error(`timeout ${action}: ${stderr}`)) }, 15000)
      const listener = message => { if (message.id === id) { clearTimeout(timer); child.off("message", listener); resolve(message) } }
      child.on("message", listener); child.send({ id, action, input })
    })
  } }
}
async function stop(worker) {
  if(worker.ownedStamp && observeProcessGroup(worker.ownedStamp).state!=="dead") {
    process.kill(-worker.ownedStamp.pgid,"SIGTERM")
    for(let n=0;n<100 && observeProcessGroup(worker.ownedStamp).state!=="dead";n++) await new Promise(r=>setTimeout(r,20))
    assert.equal(observeProcessGroup(worker.ownedStamp).state,"dead")
  }
  if (worker.child.exitCode !== null || worker.child.signalCode !== null) return
  const done = new Promise(resolve => worker.child.once("exit", resolve))
  process.kill(-worker.child.pid, "SIGTERM"); await done
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
  mkdirSync(join(root, "project")); writeFileSync(join(root,"project",".git"),"")
  writeFileSync(join(root,"project",".nvmrc"),process.versions.node)
  writeFileSync(join(root,"runtimes.json"),JSON.stringify({schemaVersion:1,projects:{example:{node:{executable:node,version:process.versions.node},npmCli:realpathSync(join(dirname(node),"npm")),npxCli:realpathSync(join(dirname(node),"npx"))}}}))
  return root
}
const privateRecord = root => join(root, "runtime-sessions/session-fixture.json")
const readRecord = root => JSON.parse(readFileSync(privateRecord(root), "utf8"))
const must = response => { assert.equal(response.error, undefined, response.error); return response.result }
function pythonStatus(root) {
  const p = spawnSync("python3", ["-c", "import json,sys;from ci_queue_api.records import status_snapshot_all;print(json.dumps(status_snapshot_all(sys.argv[1])))", root], { env: {...process.env, PYTHONPATH: join(repo,"backend")}, encoding:"utf8" })
  assert.equal(p.status,0,p.stderr); return JSON.parse(p.stdout)
}

test("session-node-works-after-job-runtime-removal and session-runtime-appears-after-job-terminal", async () => {
  const root = fixture(), owner = worker(root,"producer")
  try {
    const {handle,jobDirectory,producerStamp} = await owner.ready
    assert.notEqual(handle.directory,jobDirectory)
    must(await owner.call("detach-job")); assert.equal(existsSync(jobDirectory),false)
    const producerExit=new Promise(resolve=>owner.child.once("exit",resolve))
    process.kill(-producerStamp.pgid,"SIGTERM");await producerExit
    assert.equal(observeProcessGroup(producerStamp).state,"dead")
    assert.equal(observeProcessGroup(owner.ownedStamp).state,"alive")
    assert.equal(must(await owner.call("node")),node)
    const receipt = must(await owner.call("checkpoint"))
    assert.equal(receipt.coverage,"guarded-node-processes")
    assert.equal(receipt.state,"verified")
    assert.ok(receipt.observations.every(o=>o.execPath===node && o.group))
    const before = readRecord(root).evidenceOffset
    must(await owner.call("checkpoint")); assert.equal(readRecord(root).evidenceOffset,before)
    const rows = listSessionRuntimes(root)
    assert.equal(rows[0].state,"active")
    const api = pythonStatus(root)
    assert.deepEqual(api.sessionRuntimes,rows); assert.equal(api.globalOccupancy,false)
    assert.doesNotMatch(JSON.stringify(api.sessionRuntimes),/token|directory|NODE_OPTIONS|bindingDigest/)
    const status = spawnSync(node,[cli,"status","--state",root,"--json"],{encoding:"utf8"})
    assert.deepEqual(JSON.parse(status.stdout).result.sessionRuntimes,rows)
    const foreign = spawnSync(node,[cli,"runtime","checkpoint-session","--stdin","--state",root,"--json"],{input:JSON.stringify(handle),encoding:"utf8"})
    assert.equal(JSON.parse(foreign.stdout).error.code,"RUNTIME_SESSION_AUTHORITY")
    const child = must(await owner.call("child")); assert.equal(observeProcessGroup(child).state,"alive")
    assert.match((await owner.call("release")).error,/RUNTIME_SESSION_OCCUPIED/)
    must(await owner.call("stop-child"))
    const released = must(await owner.call("release"))
    assert.equal(released.session.disposition,"released"); assert.equal(existsSync(handle.directory),false)
    assert.deepEqual(listSessionRuntimes(root),[]);assert.deepEqual(pythonStatus(root).sessionRuntimes,[])
    assert.deepEqual(must(await owner.call("release")),released)
  } finally { await stop(owner); rmSync(root,{recursive:true,force:true}) }
})

test("dead-owner-runtime-recovery-releases-original-bundle with concurrent CAS and durable replay", async () => {
  const root=fixture(),owner=worker(root,"owner"),a=worker(root,"recovery"),b=worker(root,"recovery")
  let group
  try {
    const {handle}=await owner.ready; await Promise.all([a.ready,b.ready])
    must(await owner.call("detach-job")); group=must(await owner.call("child"))
    must(await owner.call("checkpoint"))
    const input={mode:"recover",root,operationId:"recovery-a",original:{runtimeId:handle.runtimeId,projectId:handle.projectId,sessionId:handle.sessionId,bindingDigest:handle.bindingDigest,expectedStateRevision:readRecord(root).stateRevision}}
    assert.match((await a.call("recover",input)).error,/RUNTIME_SESSION_OCCUPIED/)
    await stop(owner)
    // A real guarded group remains after the original producer/owner is dead.
    assert.equal(observeProcessGroup(group).state,"alive")
    assert.match((await a.call("recover",input)).error,/RUNTIME_SESSION_OCCUPIED/)
    process.kill(group.leaderPid,"SIGTERM")
    for(let n=0;n<100 && observeProcessGroup(group).state==="alive";n++) await new Promise(r=>setTimeout(r,20))
    assert.equal(observeProcessGroup(group).state,"uncertain")
    assert.match((await a.call("recover",input)).error,/RUNTIME_SESSION_OCCUPIED/)
    process.kill(-group.pgid,"SIGTERM")
    for(let n=0;n<100 && observeProcessGroup(group).state!=="dead";n++) await new Promise(r=>setTimeout(r,20))
    assert.equal(observeProcessGroup(group).state,"dead")
    const original=readRecord(root), bytes=readFileSync(privateRecord(root),"utf8")
    // Missing group identity is uncertainty, never authorization to delete.
    writeFileSync(privateRecord(root),JSON.stringify({...original,groups:[{...group,hostname:"foreign-host"}]}),{mode:0o600})
    assert.match((await a.call("recover",input)).error,/RUNTIME_SESSION_UNCERTAIN/)
    writeFileSync(privateRecord(root),bytes,{mode:0o600})
    const results=await Promise.all([a.call("recover",input),b.call("recover",{...input,operationId:"recovery-b"})])
    assert.equal(results.filter(x=>x.result).length,1)
    assert.match(results.find(x=>x.error).error,/RUNTIME_SESSION_(CAS|BUSY)/)
    const winner=results[0].result?a:b,operationId=results[0].result?"recovery-a":"recovery-b"
    const receipt=results.find(x=>x.result).result
    assert.equal(receipt.session.disposition,"released");assert.equal(receipt.session.runtimeId,handle.runtimeId)
    assert.equal(receipt.session.bindingDigest,handle.bindingDigest)
    assert.equal(receipt.session.recovery.operationId,operationId)
    assert.equal(receipt.session.recovery.originalStateRevision,input.original.expectedStateRevision)
    assert.equal(existsSync(handle.directory),false)
    assert.deepEqual(must(await winner.call("recover",{...input,operationId})),receipt)
    assert.deepEqual(listSessionRuntimes(root),[])
  } finally {
    if(group && observeProcessGroup(group).state!=="dead") {try{process.kill(-group.pgid,"SIGTERM")}catch{}}
    await Promise.all([stop(owner),stop(a),stop(b)]);rmSync(root,{recursive:true,force:true})
  }
})

test("recovery resumes durable closing authority after bundle removal and refuses changed CAS", async () => {
  const root=fixture(),owner=worker(root,"owner"),actor=worker(root,"recovery"),replacement=worker(root,"recovery")
  try {
    const {handle}=await owner.ready;const {stamp}=await actor.ready;await replacement.ready
    must(await owner.call("detach-job"));await stop(owner)
    const r=readRecord(root),input={mode:"recover",root,operationId:"reentry",original:{runtimeId:r.runtimeId,projectId:r.projectId,sessionId:r.sessionId,bindingDigest:r.bindingDigest,expectedStateRevision:r.stateRevision}}
    assert.match((await actor.call("recover",{...input,original:{...input.original,expectedStateRevision:999}})).error,/RUNTIME_SESSION_CAS/)
    assert.equal(existsSync(handle.directory),true)
    // Exact on-disk crash boundary: authority was persisted, effect completed,
    // terminal record not yet published. Do not fake process/group exclusion.
    writeFileSync(privateRecord(root),JSON.stringify({...r,state:"closing",stateRevision:r.stateRevision+1,recovery:{operationId:input.operationId,originalStateRevision:r.stateRevision,recoveryOwnerStamp:{pid:stamp.leaderPid,pgid:stamp.pgid,startedAt:stamp.startedAt}}}),{mode:0o600})
    rmSync(handle.directory,{recursive:true})
    assert.match((await replacement.call("recover",input)).error,/RUNTIME_SESSION_CAS/)
    await stop(actor)
    // The replacement uses a current runtime and stamp, never the removed bundle.
    const receipt=must(await replacement.call("recover",input))
    assert.equal(receipt.session.disposition,"released")
    assert.equal(receipt.session.recovery.operationId,"reentry")
    assert.deepEqual(must(await replacement.call("recover",input)),receipt)
  } finally {await Promise.all([stop(owner),stop(actor),stop(replacement)]);rmSync(root,{recursive:true,force:true})}
})


test("recovery completes normal closing after bundle removal under original CAS", async () => {
  const root=fixture(),owner=worker(root,"owner"),actor=worker(root,"recovery")
  try {
    const {handle}=await owner.ready;await actor.ready
    must(await owner.call("detach-job"));await stop(owner)
    const original=readRecord(root)
    // Normal release persisted closing and removed its bundle, then its owner
    // died before publishing released. No recovery authority existed yet.
    const closing={...original,state:"closing",stateRevision:original.stateRevision+1}
    writeFileSync(privateRecord(root),JSON.stringify(closing),{mode:0o600})
    rmSync(handle.directory,{recursive:true})
    assert.equal(closing.recovery,undefined)
    assert.ok([closing.owner,closing.producer,...closing.groups].every(g=>observeProcessGroup(g).state==="dead"))
    const input={mode:"recover",root,operationId:"finish-normal-release",original:{runtimeId:closing.runtimeId,projectId:closing.projectId,sessionId:closing.sessionId,bindingDigest:closing.bindingDigest,expectedStateRevision:closing.stateRevision}}
    assert.match((await actor.call("recover",{...input,original:{...input.original,expectedStateRevision:original.stateRevision}})).error,/RUNTIME_SESSION_CAS/)
    assert.deepEqual(readRecord(root),closing)
    const receipt=must(await actor.call("recover",input))
    assert.equal(receipt.session.disposition,"released")
    assert.equal(receipt.session.bindingDigest,closing.bindingDigest)
    assert.equal(receipt.session.recovery.originalStateRevision,closing.stateRevision)
    assert.deepEqual(readRecord(root).directoryIdentity,closing.directoryIdentity)
    assert.deepEqual(readRecord(root).catalogIdentity,closing.catalogIdentity)
    assert.deepEqual(must(await actor.call("recover",input)),receipt)
    assert.equal(existsSync(handle.directory),false)
  } finally {await Promise.all([stop(owner),stop(actor)]);rmSync(root,{recursive:true,force:true})}
})

for(const field of ["sessionId","launchBindingDigest","requirementDigest"]) {
  test(`prepare rejects JSON array ${field} before publication`,async()=>{
    const root=fixture(),owner=worker(root,"owner")
    try {
      await owner.ready
      const before=readFileSync(privateRecord(root),"utf8")
      const sessionId="invalid-array-"+field
      const value=field==="sessionId"?sessionId:field==="launchBindingDigest"?"b".repeat(64):readRecord(root).requirementDigest
      const result=await owner.call("prepare",{sessionId,[field]:[value]})
      assert.match(result.error??"",/RUNTIME_SESSION_INVALID/)
      assert.equal(existsSync(join(root,"runtime-sessions",`session-${sessionId}.json`)),false)
      assert.equal(existsSync(join(root,"runtime",`session-${sessionId}`)),false)
      assert.equal(readFileSync(privateRecord(root),"utf8"),before)
    } finally {await stop(owner);rmSync(root,{recursive:true,force:true})}
  })
}

test("recovery rejects JSON array operationId before authority or bundle effects",async()=>{
  const root=fixture(),owner=worker(root,"owner"),actor=worker(root,"recovery")
  try {
    const {handle}=await owner.ready;await actor.ready
    must(await owner.call("detach-job"));await stop(owner)
    const r=readRecord(root),before=readFileSync(privateRecord(root),"utf8")
    const input={mode:"recover",root,operationId:["invalid-array-operation"],original:{runtimeId:r.runtimeId,projectId:r.projectId,sessionId:r.sessionId,bindingDigest:r.bindingDigest,expectedStateRevision:r.stateRevision}}
    assert.match((await actor.call("recover",input)).error??"",/RUNTIME_SESSION_INVALID/)
    assert.equal(existsSync(handle.directory),true)
    assert.equal(readFileSync(privateRecord(root),"utf8"),before)
    assert.equal(must(await actor.call("recover",{...input,operationId:"valid-operation"})).session.disposition,"released")
  } finally {await Promise.all([stop(owner),stop(actor)]);rmSync(root,{recursive:true,force:true})}
})
