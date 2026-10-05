import path from 'node:path';

// Select declarations without Pi's --tools allowlist, which also excludes dynamically
// registered MCP tools from codemode. Only explicitly loaded role extensions remain.
export function childToolNames(depth) {
  if (depth !== 1 && depth !== 2) throw new Error('Invalid literature child depth');
  const names = ['read', 'bash', 'write', 'edit', 'grep', 'find', 'ls', 'codemode', 'literature_progress'];
  if (depth === 1) names.push('literature_review');
  return names;
}

export function registerChildToolLoadout(pi, depth) {
  const names = childToolNames(depth);
  const allowed = new Set([...names, 'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']);
  const select = () => { pi.setActiveTools(names); };
  pi.on('session_start', select);
  pi.on('before_agent_start', select);
  // Also covers nested calls. This is a tool boundary, not a shell sandbox.
  pi.on('tool_call', event => {
    if (!allowed.has(event.toolName) && !/^mcp__(consensus|researchfasttrack)__/.test(event.toolName))
      return { block: true, reason: `Tool outside literature-reviewer role: ${event.toolName}` };
  });
}

// Deliberately never read global/project mcp.json: children get only these servers.
export function isolatedMcpConfig() {
  return {
    errors: [],
    autoEnableCodemode: true,
    servers: [
      { name: 'consensus', config: { url: 'https://mcp.consensus.app/mcp', oauth: { scope: 'search' }, timeout: 60, exposure: 'codemode' } },
      { name: 'researchfasttrack', config: { url: 'https://literature.researchfasttrack.com/mcp', timeout: 60, exposure: 'codemode' } },
    ].map(entry => ({ ...entry, source: 'literature-reviewer', scope: 'extension' })),
  };
}

export async function installChildMcp(pi, { createMcpExtension, createCodemodeExtension }, runDir) {
  if (!runDir || !path.isAbsolute(runDir)) throw new Error('Invalid literature run directory for MCP');
  await createCodemodeExtension({ mode: 'on' })(pi);
  await createMcpExtension({
    loadConfig: () => isolatedMcpConfig(),
    logPath: path.join(runDir, 'mcp.log'),
    // Existing native mcp-auth.json is used normally, including locked refresh.
    // Interactive sign-in and configuration writes belong to the main session.
    openUrl: () => { throw new Error('Headless reviewer cannot sign in. Ask the user to run /mcp login consensus in the main Pi session.'); },
    updateConfig: () => { throw new Error('Headless reviewer cannot change MCP configuration.'); },
  })(pi);
}
