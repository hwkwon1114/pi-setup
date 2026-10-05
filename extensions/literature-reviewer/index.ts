import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { getAgentDir, truncateHead, createMcpExtension, createCodemodeExtension } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArgs, depthFrom, runProcess, resolveRoleModel, MAX_DEPTH } from './runner.mjs';
import { progressUpdate } from './progress.mjs';
import { installChildMcp, registerChildToolLoadout } from './native-mcp.mjs';
import { budgetFrom, planBudget, budgetNotice, registerBudgetHooks, formatFailure } from './runtime.mjs';

export default async function (pi: ExtensionAPI) {
  const depth = depthFrom(process.env);
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const agentDir = getAgentDir();
  const budget = depth > 0 ? budgetFrom(process.env) : undefined;
  if (depth > 0) {
    if (!budget || (depth === 2 && budget.deadlineAt === null)) throw new Error('Missing or invalid role runtime budget');
    registerBudgetHooks(pi, budget);
    registerChildToolLoadout(pi, depth);
    pi.registerTool({
      name:'literature_progress',label:'Review progress',
      description:'Publish a concise progress checkpoint at phase changes: current work, blockers, and optional cumulative paper counts. Counts are reviewer-reported, not independently audited. Do not include private source text.',
      parameters:Type.Object({phase:Type.String({minLength:1,maxLength:80}),summary:Type.String({maxLength:180}),
        screened:Type.Optional(Type.Integer({minimum:0})),verified:Type.Optional(Type.Integer({minimum:0}))}),
      async execute(_id,params) { return {content:[{type:'text',text:`Progress: ${params.phase} — ${params.summary}`}],details:params}; }
    });
  }
  // Isolated in-memory MCP config: never import ambient/project servers into children.
  if (depth > 0) {
    await installChildMcp(pi, { createMcpExtension, createCodemodeExtension }, process.env.PI_LITERATURE_RUN_DIR);
  }
  if (depth >= MAX_DEPTH) return;
  let active=0, dispatched=0;
  let latestStatus='No review has run in this extension session.';
  const controllers=new Set<AbortController>();
  pi.on('session_shutdown',()=>{for(const controller of controllers) controller.abort();});
  if(depth===0) pi.registerCommand('literature-status',{
    description:'Show the latest review activity without starting or interrupting a review',
    handler:async(_args,ctx)=>{ctx.ui.notify(latestStatus,'info');}
  });
  const maxConcurrent=depth===0?1:4;
  // Main-session follow-ups are separate scoped reviews; only child fan-out has a lifetime cap.
  const maxDispatches=depth===0?Infinity:4;
  pi.registerTool({
    name:'literature_review',label:'Literature reviewer',
    description:'Delegate a bounded literature task to an isolated literature-reviewer Pi process. Assigned skills: research-ideas, pdf-read; MCP: Consensus and ResearchFastTrack. The coordinating reviewer uses Astra xhigh; leaf retrieval reviewers use Sol medium. Main-session follow-ups have no lifetime dispatch cap, with one active reviewer at a time. Each review is a one-shot task; supply prior reports for continuation. Reviewer may spawn up to four child reviewers, four concurrently; leaf children cannot delegate. No Zotero or computational experiments. Authored reports and partial artifacts preserved locally; no coordinator wall-clock deadline, independent 10-minute leaf deadlines with finalization reserves, live activity checkpoints, and bounded output. Pass a narrowly ranked task with essential versus optional deliverables, relevant context and absolute source paths; parent conversation is not copied.',
    parameters:Type.Object({task:Type.String({minLength:1,maxLength:60000,description:'Research question, scope, sources, constraints, child responsibilities and expected evidence.'})}),
    async execute(_id,params,signal,onUpdate,ctx) {
      if(!params.task.trim()) throw new Error('Task must be non-empty');
      if(active>=maxConcurrent) throw new Error(`At most ${maxConcurrent} literature reviewers may run concurrently here`);
      if(dispatched>=maxDispatches) throw new Error('Four-child dispatch budget reached for this review; continue synthesis without new delegates');
      if(signal?.aborted) throw new Error('Cancelled before dispatch');
      const currentScript=process.argv[1];
      if(!currentScript || !fs.existsSync(currentScript)) throw new Error('Cannot resolve Pi CLI entry point');
      const profile=fs.readFileSync(path.join(dir,'literature-reviewer.md'),'utf8');
      const base=depth>0 ? process.env.PI_LITERATURE_RUN_DIR : path.join(agentDir,'literature-review-runs');
      if(!base || !path.isAbsolute(base)) throw new Error('Invalid literature run directory');
      // Explicit role routing: the coordinating reviewer reasons deeply; leaf
      // retrieval workers use a lower-cost non-orchestrator model.
      const dispatchedDepth=depth+1;
      const model=dispatchedDepth===1
        ? 'openai-codex/gpt-6-astra'
        : 'openai-codex/gpt-6.1-sol';
      const thinking=dispatchedDepth===1 ? 'xhigh' : 'medium';
      const effectiveRole = resolveRoleModel(agentDir, dispatchedDepth, model, thinking);
      const effectiveModel = effectiveRole.model;
      const effectiveThinking = effectiveRole.thinking;
      const childBudget=planBudget({depth:dispatchedDepth,parentBudget:budget});
      active++;dispatched++;
      const controller=new AbortController();controllers.add(controller);
      const runSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
      let fleetRunId: string | undefined;
      let fleetSessionId: string | undefined;
      let extRunsApi: any;
      try {
        fs.mkdirSync(base,{recursive:true,mode:0o700});
        const runDir=fs.mkdtempSync(path.join(base,'review-'));fs.chmodSync(runDir,0o700);
        try {
          const extRunsModulePath = path.join(agentDir, 'npm/node_modules/pi-subagents/src/api/external-runs.js');
          if (fs.existsSync(extRunsModulePath)) {
            const sm = (ctx as any)?.sessionManager;
            fleetSessionId = (typeof sm?.getSessionFile === 'function' && sm.getSessionFile()) || (typeof sm?.getSessionId === 'function' && sm.getSessionId()) || undefined;
            if (fleetSessionId) {
              extRunsApi = await import(extRunsModulePath);
              fleetRunId = path.basename(runDir);

              // Evict older terminal runs if near registry cache cap (100)
              try {
                const regKey = Symbol.for(extRunsApi.EXTERNAL_RUN_REGISTRY_KEY ?? 'pi-subagents.external-runs.v2');
                const reg = (globalThis as any)[regKey];
                if (reg?.runs && reg.runs.size >= 90) {
                  for (const [k, v] of reg.runs.entries()) {
                    if (v?.state === 'completed' || v?.state === 'failed') {
                      reg.runs.delete(k);
                    }
                  }
                }
              } catch {}

              extRunsApi.registerExternalRun({
                id: fleetRunId,
                sessionId: fleetSessionId,
                source: 'literature-reviewer',
                label: `Literature review (depth ${dispatchedDepth})`,
                state: 'running',
                startedAt: Date.now(),
                currentAction: `Reviewer started (depth ${dispatchedDepth})`
              });
            }
          }
        } catch {}
        const promptFile=path.join(runDir,'system.md');
        fs.writeFileSync(promptFile,profile+`\n\nRuntime: depth ${depth+1}/${MAX_DEPTH}. Your private run directory: ${runDir}. ${depth>0?'You are a child: write only in this run directory.':'You coordinate the review and own integration; project writes remain task-scoped.'}\n${budgetNotice(childBudget)}\nSave your concise report at ${path.join(runDir,'report.md')} and artifact declarations at ${path.join(runDir,'handoff.json')}. Never write runner-owned final-response.md, artifacts.json, result.json, progress.json or progress.json.tmp.\n`,{mode:0o600});
        fs.writeFileSync(path.join(runDir,'task.md'),params.task,{mode:0o600});
        const args=buildArgs({cli:currentScript,extension:path.join(dir,'index.ts'),agentDir,promptFile,model:effectiveModel,thinking:effectiveThinking,depth:dispatchedDepth});
        fs.writeFileSync(path.join(runDir,'invocation.json'),JSON.stringify({model:effectiveModel,depth:depth+1,cwd:ctx.cwd,args,budget:childBudget},null,2),{mode:0o600});
        latestStatus=`Literature reviewer started (depth ${depth+1}); ${childBudget.deadlineAt===null?'no wall-clock deadline':`deadline ${new Date(childBudget.deadlineAt).toISOString()}`}; ${runDir}`;
        onUpdate?.({content:[{type:'text',text:latestStatus}],details:{runDir,budget:childBudget}});
        const result=await runProcess({command:process.execPath,args,cwd:ctx.cwd,
          env:{...process.env,PI_LITERATURE_DEPTH:String(depth+1),PI_LITERATURE_RUN_DIR:runDir,
            PI_LITERATURE_DEADLINE_MS:childBudget.deadlineAt===null?'none':String(childBudget.deadlineAt),PI_LITERATURE_FINALIZE_MS:childBudget.finalizeAt===null?'none':String(childBudget.finalizeAt),MCP_UI_VIEWER:'none'},
          task:params.task,runDir,signal:runSignal,detached:depth===0,deadlineAt:childBudget.deadlineAt,
          timeoutMs:childBudget.timeoutMs,allowProjectArtifacts:depth===0,
          onProgress:(calls:number,timing?:any)=>{
            const update=progressUpdate(calls,timing,runDir,childBudget.deadlineAt);
            latestStatus=update.content[0].text;
            if(depth===0 && ctx.hasUI) ctx.ui.setStatus('literature-review',`Review ${Math.floor((timing?.elapsedMs??0)/1000)}s · ${timing?.phase||'working'} · ${calls} calls`);
            if (extRunsApi && fleetSessionId && fleetRunId) {
              try {
                extRunsApi.updateExternalRun(fleetSessionId, fleetRunId, {
                  currentAction: (latestStatus || 'Working...').slice(0, 160),
                  updatedAt: Date.now()
                });
              } catch {}
            }
            onUpdate?.(update);
          }});
        latestStatus=`Review ${result.ok?'finished':'incomplete'}: ${result.error||result.declaredStatus||'scope status not declared'}\nReport: ${result.report??'(none)'}\nRun/logs: ${runDir}`;
        if (extRunsApi && fleetSessionId && fleetRunId) {
          try {
            extRunsApi.updateExternalRun(fleetSessionId, fleetRunId, {
              state: result.ok ? 'completed' : 'failed',
              endedAt: Date.now(),
              reportPath: result.report || undefined,
              preview: result.text ? result.text.slice(0, 500) : undefined
            });
          } catch {}
        }
        const details={runDir,report:result.report,artifactManifest:result.artifactManifest,
          finalResponse:result.finalResponse,artifacts:result.artifacts,error:result.error,
          processCompleted:result.processCompleted,declaredStatus:result.declaredStatus,
          elapsedMs:result.elapsedMs,budgetMs:result.budgetMs,deadlineAt:result.deadlineAt,toolCalls:result.toolCalls,ownUsage:result.ownUsage};
        if(!result.ok) {
          const partial=truncateHead(formatFailure(result),{maxBytes:45000,maxLines:1500});
          onUpdate?.({content:[{type:'text',text:partial.content}],details});
          // Pi requires throwing to mark the result isError. Keep the causal reason and
          // recovery paths in that error; do not silently return a successful tool result.
          throw new Error(partial.content);
        }
        const view=truncateHead(result.text,{maxBytes:45000,maxLines:1500});
        return {content:[{type:'text',text:`Review process finished; reported scope status: ${result.declaredStatus ?? 'not declared'}. File checks are not scientific verification.\n\n`+view.content+`\n\n${view.truncated?'[Truncated] ':''}Report: ${result.report ?? '(none)'}\nArtifact inventory: ${result.artifactManifest}`}],details};
      } catch(error) {
        if (extRunsApi && fleetSessionId && fleetRunId) {
          try {
            extRunsApi.updateExternalRun(fleetSessionId, fleetRunId, {
              state: 'failed',
              endedAt: Date.now(),
              preview: error instanceof Error ? error.message.slice(0, 300) : String(error)
            });
          } catch {}
        }
        latestStatus=`${latestStatus}\nStopped: ${error instanceof Error?error.message.slice(0,300):String(error)}`;
        throw error;
      } finally {
        active--;controllers.delete(controller);
        if(depth===0 && ctx.hasUI) ctx.ui.setStatus('literature-review',undefined);
      }
    }
  });
  if(depth===0) pi.registerCommand('literature-reviewer',{
    description:'Delegate a literature review; usage: /literature-reviewer <question or review task>',
    handler:async(args,ctx)=>{
      if(!args.trim()){ctx.ui.notify('Usage: /literature-reviewer <task>','info');return;}
      pi.sendUserMessage('Use the literature_review tool for the following task. Supply the relevant known context and absolute source paths. Task: '+args);
    }
  });
}
