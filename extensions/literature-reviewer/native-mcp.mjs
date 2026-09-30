import path from 'node:path';

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
