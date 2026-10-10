import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const config=JSON.parse(fs.readFileSync(new URL('../config/settings.json',import.meta.url),'utf8'));
test('portable routing standardizes on Codex without removing other providers',()=>{
 assert.equal(config.defaultProvider,'openai-codex');
 assert(!fs.existsSync(new URL('../extensions/multi-openai',import.meta.url)));
 assert(config.packages.includes('npm:pi-subagents@latest'));
 assert(config.packages.includes('npm:pi-antigravity@latest'));
 assert(config.packages.includes('npm:@juicesharp/rpiv-ask-user-question'));
 assert(config.packages.includes('npm:pi-goal-x'));
 const runtime=JSON.parse(fs.readFileSync(new URL('../packages/research-runtime/package.json',import.meta.url),'utf8'));
 assert(!runtime.dependencies?.['@juicesharp/rpiv-todo']);
 assert(!runtime.pi.extensions.includes('./todo.ts'));
 assert(config.enabledModels.includes('antigravity/gemini-3.8-flash'));
 for(const [name,role] of Object.entries(config.subagents.agentOverrides)) if(role.model) {
  assert(role.model.startsWith(name.startsWith('literature-')?'openai-codex/':'codex-auto/'));
  assert(config.enabledModels.includes(role.model));
 }
 assert.equal(config.subagents.defaultModel,'codex-auto/gpt-6.1-sol');
 assert.deepEqual(config.subagents.defaultSubagentOnlyExtensions,['~/.pi/agent/extensions/multi-codex/index.ts']);
 assert.equal(config.subagents.agentOverrides['astra-code-reviewer'].model,'codex-auto/gpt-6-astra');
 const reviewer=fs.readFileSync(new URL('../agents/astra-code-reviewer.md',import.meta.url),'utf8');
 assert.match(reviewer,/^model: openai-codex\/gpt-6-astra$/m);
});

let piDir=process.env.PI_CODEX_TEST_PI_DIR;
if(!piDir) try {
 const command=process.platform==='win32'?'where':'which';
 const executable=execFileSync(command,['pi'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
 let candidate=path.dirname(fs.realpathSync(executable));
 while(candidate!==path.dirname(candidate)) {
  const manifest=path.join(candidate,'package.json');
  if(fs.existsSync(manifest)&&JSON.parse(fs.readFileSync(manifest,'utf8')).name==='@earendil-works/pi-coding-agent') {piDir=candidate;break;}
  candidate=path.dirname(candidate);
 }
} catch {}
const installed=piDir&&fs.existsSync(path.join(piDir,'dist/index.js'));
test('installed Pi loader discovers Codex and usage extensions', {skip:!installed},async t=>{
 const sdk=await import(pathToFileURL(path.join(piDir,'dist/index.js')).href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pi-codex-discovery-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const agentDir=path.join(root,'agent');fs.mkdirSync(agentDir);
 for(const [relative,command] of [['multi-codex/index.ts','codex-command'],['usage-limits.ts','usage-command']]) {
  const target=path.join(agentDir,'extensions',relative);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`export default function(pi) { pi.registerCommand('${command}', {description:'offline fixture',handler:async()=>{}}); }`);
 }
 // No real credentials, packages, providers, MCP or model calls are loaded.
 const loader=new sdk.DefaultResourceLoader({cwd:root,agentDir,
  settingsManager:sdk.SettingsManager.inMemory({extensions:[...config.extensions,'-builtin:mcp','-builtin:llama.cpp','-builtin:codemode','-builtin:tool-search']}),
  noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true});
 await loader.reload();
 const result=loader.getExtensions();assert.deepEqual(result.errors,[]);
 const commands=result.extensions.flatMap(extension=>[...extension.commands.keys()]);
 assert(commands.includes('codex-command'));assert(commands.includes('usage-command'));
});
