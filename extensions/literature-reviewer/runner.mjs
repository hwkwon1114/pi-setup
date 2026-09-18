import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { REVIEW_TIMEOUT_MS, collectArtifacts, readBoundedText } from './runtime.mjs';
import { createProgress } from './progress.mjs';

export const MAX_DEPTH = 2;
export function depthFrom(env) {
  const raw = env.PI_LITERATURE_DEPTH ?? '0';
  if (!/^[0-2]$/.test(raw)) throw new Error('Invalid literature delegation depth');
  return Number(raw);
}
export function buildArgs({ cli, extension, agentDir, promptFile, model, thinking, depth }) {
  if (!model) throw new Error('A selected model is required');
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) throw new Error('Delegation depth exceeded');
  const tools = ['read','bash','write','edit','grep','find','ls','mcp','literature_progress'];
  if (depth < MAX_DEPTH) tools.push('literature_review');
  const args = [cli,'--mode','json','-p','--no-session','--no-extensions','--no-skills',
    '--no-context-files','--no-prompt-templates','--no-themes','--no-approve',
    '--tools',tools.join(','),'--model',model,'--append-system-prompt',promptFile,'-e',extension];
  if (thinking) args.push('--thinking',thinking);
  // Native providers are explicitly loaded without discovering unrelated extensions.
  const modules = path.join(agentDir,'npm','node_modules');
  for (const file of ['@rahularya01/pi-cursor/dist/index.js','pi-antigravity/src/index.ts']) {
    const target = path.join(modules,file);
    if (fs.existsSync(target)) args.push('-e',target);
  }
  for (const skill of ['research-ideas','pdf-read']) {
    const target = skill === 'research-ideas'
      ? path.join(agentDir,'roles','literature-reviewer','skills',skill,'SKILL.md')
      : path.join(agentDir,'skills',skill,'SKILL.md');
    if (!fs.existsSync(target)) throw new Error(`Missing assigned skill: ${skill}`);
    args.push('--skill',target);
  }
  return args;
}

export function runProcess({ command, args, cwd, env, task, runDir, signal, timeoutMs=REVIEW_TIMEOUT_MS,
  deadlineAt, allowProjectArtifacts=false, detached=true, outputLimit=64*1024*1024, onProgress,
  heartbeatMs=10000 }) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled before spawn'));
    const startedAt=Date.now();
    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REVIEW_TIMEOUT_MS))
      return reject(new Error('Invalid review timeout'));
    if (timeoutMs === null && env.PI_LITERATURE_DEPTH !== '1')
      return reject(new Error('Only the coordinator may run without a timeout'));
    if (!Number.isFinite(heartbeatMs) || heartbeatMs < 10) return reject(new Error('Invalid heartbeat interval'));
    if (deadlineAt != null && (!Number.isSafeInteger(deadlineAt) || deadlineAt <= startedAt))
      return reject(new Error('Review deadline already elapsed or invalid'));
    const hardDeadline=Math.min(timeoutMs === null ? Infinity : startedAt+timeoutMs,deadlineAt ?? Infinity);
    const stdoutPath=path.join(runDir,'events.jsonl'), stderrPath=path.join(runDir,'stderr.log');
    const out=fs.openSync(stdoutPath,'wx',0o600);
    let err;
    try { err=fs.openSync(stderrPath,'wx',0o600); } catch(e) { fs.closeSync(out); throw e; }
    let child, timer, heartbeat, escalation, buffer='', final='', reason='', calls=0, bytes=0, failure='', stopped=false;
    const decoder=new StringDecoder('utf8');
    const ownUsage={input:0,output:0,cacheRead:0,cacheWrite:0};
    const kill=(sig) => {
      if (!child?.pid) return;
      try { if(detached && process.platform!=='win32') process.kill(-child.pid,sig); else child.kill(sig); } catch {}
    };
    const stop=(why) => {
      if(stopped) return;
      stopped=true; failure=why; kill('SIGTERM');
      escalation=setTimeout(()=>kill('SIGKILL'),1500);
    };
    const abort=()=>stop('Cancelled');
    const activity=createProgress(startedAt);
    const publish=()=>{
      if(stopped) return;
      try {
        const now=Date.now();
        const report=path.join(runDir,'report.md');
        let checkpoint;
        try { const stat=fs.lstatSync(report); if(stat.isFile()) checkpoint=report; } catch {}
        const snapshot={...activity.snapshot(now),elapsedMs:now-startedAt,
          remainingMs:Number.isFinite(hardDeadline)?Math.max(0,hardDeadline-now):null,checkpoint};
        // Atomic, bounded snapshot; never write the author's report or evidence files.
        const temp=path.join(runDir,'progress.json.tmp');
        fs.writeFileSync(temp,JSON.stringify({version:1,status:'running',updatedAt:now,toolCalls:calls,...snapshot}),{mode:0o600});
        fs.renameSync(temp,path.join(runDir,'progress.json'));
        onProgress?.(calls,snapshot);
      } catch(e) { stop(`Progress callback failed: ${e instanceof Error ? e.message : String(e)}`); }
    };
    const line=(text)=>{
      let event; try {event=JSON.parse(text);} catch {return;}
      if(!event || typeof event!=='object' || Array.isArray(event)) return;
      activity.observe(event);
      if(event.type==='tool_execution_start') calls++;
      if(['tool_execution_start','tool_execution_update','tool_execution_end'].includes(event.type)) publish();
      if(event.type==='message_end' && event.message?.role==='assistant') {
        const m=event.message;
        const content=Array.isArray(m.content)?m.content:[];
        const text=content.filter(p=>p?.type==='text' && typeof p.text==='string').map(p=>p.text).join('\n');
        reason=m.stopReason??reason;
        // Streaming deltas and tool-calling commentary are not final responses.
        final=m.stopReason==='stop' && !content.some(p=>p?.type==='toolCall') ? text : '';
        if(typeof m.errorMessage==='string' && m.errorMessage && !failure) failure=m.errorMessage;
        for(const k of Object.keys(ownUsage)) ownUsage[k]+=m.usage?.[k]??0;
      }
    };
    const finish=(code, sig)=>{
      buffer+=decoder.end();if(buffer.trim()) line(buffer);
      clearTimeout(timer);clearInterval(heartbeat);clearTimeout(escalation);signal?.removeEventListener('abort',abort);
      if(stopped) kill('SIGKILL'); // also clean up a detached root's nested processes
      fs.closeSync(out);fs.closeSync(err);
      try {
        const processCompleted=code===0 && !failure && reason==='stop' && !!final.trim();
        const finalResponse=path.join(runDir,'final-response.md');
        // report.md belongs to the reviewer. Never overwrite it, even on failure.
        fs.writeFileSync(finalResponse,final || '(No completed final response)\n',{mode:0o600,flag:'wx'});
        const inventory=collectArtifacts({runDir,cwd,allowProjectArtifacts,hasFinalResponse:!!final.trim()});
        let text=final;
        if(inventory.localReport) {
          try { text=readBoundedText(inventory.localReport); }
          catch(e) { inventory.errors.push(`Cannot preview authored report: ${e.message}`); }
        }
        const ok=processCompleted && inventory.errors.length===0;
        const processError=failure || (sig?`Child terminated by ${sig}`:
          code!==0?`Child exited with code ${code ?? 'unknown'}`:
          !processCompleted?'Child did not return a completed final response':'');
        const error=processError || (inventory.errors.length?'Artifact handoff incomplete; see artifacts.json':'');
        const artifactManifest=path.join(runDir,'artifacts.json');
        fs.writeFileSync(artifactManifest,JSON.stringify({version:1,processCompleted,
          note:'Existence/path checks only; not scientific verification.',...inventory},null,2),{mode:0o600,flag:'wx'});
        const result={ok,exitCode:code,signal:sig,stopReason:reason,error,processCompleted,
          startedAt,deadlineAt:Number.isFinite(hardDeadline)?hardDeadline:null,
          budgetMs:Number.isFinite(hardDeadline)?hardDeadline-startedAt:null,elapsedMs:Date.now()-startedAt,
          runDir,toolCalls:calls,ownUsage,report:inventory.report,finalResponse,artifactManifest,
          artifacts:inventory.artifacts,artifactErrors:inventory.errors,declaredStatus:inventory.declaredStatus};
        fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
        const finalActivity=activity.snapshot();
        fs.writeFileSync(path.join(runDir,'progress.json'),JSON.stringify({version:1,
          status:ok?'finished':'incomplete',updatedAt:Date.now(),toolCalls:calls,...finalActivity,
          activeTools:[],children:finalActivity.children.map(c=>c.status==='running'?{...c,status:'interrupted'}:c),
          error,report:inventory.report,elapsedMs:result.elapsedMs,remainingMs:null}),{mode:0o600});
        resolve({...result,text});
      } catch(e) { reject(new Error(`Reviewer runtime could not save its handoff: ${e.message}. Authored reports were not overwritten; inspect ${runDir}`)); }
    };
    try {
      child=spawn(command,args,{cwd,env,shell:false,detached:detached&&process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      child.stdout.on('data',chunk=>{
        bytes+=chunk.length;if(bytes>outputLimit){stop('Output limit exceeded');return;}
        fs.writeSync(out,chunk);buffer+=decoder.write(chunk);
        let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i));buffer=buffer.slice(i+1);}
      });
      child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>outputLimit){stop('Output limit exceeded');return;}fs.writeSync(err,chunk);});
      child.on('error',(e)=>{if(!failure) failure=`Failed to launch Pi subprocess: ${e.message}`;});
      child.on('close',finish);
      child.stdin.on('error',()=>{});child.stdin.end(task);
      if(Number.isFinite(hardDeadline)) timer=setTimeout(()=>stop('Time limit exceeded'),Math.max(0,hardDeadline-Date.now()));
      heartbeat=setInterval(publish,heartbeatMs);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted) abort();
    } catch(e) {clearTimeout(timer);clearInterval(heartbeat);fs.closeSync(out);fs.closeSync(err);reject(e);}
  });
}
