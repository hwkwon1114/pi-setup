// Observable activity is separate from reviewer-reported scientific progress.
const clean = (v, max=180) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,max) : '';
export function createProgress(startedAt) {
  let lastEventAt=startedAt, phase='', summary='', screened, verified;
  const active=new Map(), children=new Map();
  return {
    observe(event, now=Date.now()) {
      lastEventAt=now;
      const id=clean(event.toolCallId,100);
      if(event.type==='tool_execution_start') {
        active.set(id,clean(event.toolName,80)||'tool');
        if(event.toolName==='literature_review' && children.size<4) children.set(id,{id,status:'running'});
      }
      if(event.type==='tool_execution_update' || event.type==='tool_execution_end') {
        const details=(event.partialResult ?? event.result)?.details;
        if(event.toolName==='literature_progress' && event.type==='tool_execution_end' && !event.isError) {
          phase=clean(details?.phase,80); summary=clean(details?.summary);
          screened=Number.isSafeInteger(details?.screened) && details.screened>=0 ? details.screened : undefined;
          verified=Number.isSafeInteger(details?.verified) && details.verified>=0 ? details.verified : undefined;
        }
        const child=children.get(id);
        if(child) {
          if(typeof details?.runDir==='string') child.runDir=clean(details.runDir,4096);
          if(typeof details?.phase==='string') child.phase=clean(details.phase,80);
          if(typeof details?.summary==='string') child.summary=clean(details.summary);
          if(Number.isFinite(details?.remainingMs)) child.remainingMs=Math.max(0,details.remainingMs);
          if(Number.isFinite(details?.idleMs)) child.idleMs=Math.max(0,details.idleMs);
          if(typeof details?.error==='string' && details.error) child.status=details.error.includes('Time limit exceeded')?'timed out':'failed';
          if(event.type==='tool_execution_end' && child.status==='running') child.status=event.isError?'failed':'completed';
        }
        if(event.type==='tool_execution_end') active.delete(id);
      }
    },
    snapshot(now=Date.now()) {
      return {phase,summary,screened,verified,lastEventAt,idleMs:Math.max(0,now-lastEventAt),
        activeTools:[...active.values()].slice(0,12),children:[...children.values()].map(c=>({...c}))};
    }
  };
}

// Older loaded runners may call onProgress with only the tool-call count.
export function progressUpdate(calls, timing, runDir, deadlineAt, now=Date.now()) {
  const remainingMs=Number.isFinite(timing?.remainingMs) ? Math.max(0,timing.remainingMs)
    : Number.isFinite(deadlineAt) ? Math.max(0,deadlineAt-now) : null;
  const lines=[`Literature reviewer: ${calls} tool calls, ${remainingMs===null?'no wall-clock deadline':`${Math.ceil(remainingMs/1000)}s remaining`}${Number.isFinite(timing?.elapsedMs)?`; ${Math.floor(timing.elapsedMs/1000)}s elapsed`:''}`];
  if(timing?.phase) lines.push(`Phase (reviewer-reported): ${clean(timing.phase,80)} — ${clean(timing.summary)}`);
  if(timing?.screened!==undefined || timing?.verified!==undefined)
    lines.push(`Papers (reviewer-reported, not independently audited): ${timing.screened??'?'} screened; ${timing.verified??'?'} verified`);
  if(timing?.activeTools?.length) lines.push(`Active tools: ${timing.activeTools.map(t=>clean(t,80)).join(', ')}`);
  for(const c of timing?.children??[]) {
    lines.push(`Child ${clean(c.id,100)}: ${clean(c.status,40)}${c.status==='running' && Number.isFinite(c.remainingMs)?` (${Math.ceil(c.remainingMs/1000)}s remaining)`:''}${c.phase?` — ${clean(c.phase,80)}`:''}${c.summary?`: ${clean(c.summary)}`:''}${c.runDir?`; ${clean(c.runDir,4096)}`:''}`);
    if(c.status==='running' && c.idleMs>=180000) lines.push(`  Warning: child has no subprocess events for ${Math.floor(c.idleMs/1000)}s (may be a model/service wait).`);
  }
  if(timing?.idleMs>=180000) lines.push(`Warning: no subprocess events for ${Math.floor(timing.idleMs/1000)}s; may be waiting on a model/service (not proof of a stall).`);
  if(timing?.checkpoint) lines.push(`Saved checkpoint: ${timing.checkpoint}`);
  lines.push(`Run/logs: ${runDir}`);
  return {content:[{type:'text',text:lines.join('\n')}],details:{...timing,runDir,remainingMs}};
}
