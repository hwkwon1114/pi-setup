import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Name of the system-prompt section that carries ACP's context-management instructions. */
export const ACP_SECTION = "acp_context";

/**
 * ACP's `before_agent_start` handler returns `{ systemPrompt: <current prompt> + "\n\n" + <ACP text> }`.
 * Pi treats a returned `systemPrompt` as a *forced* prompt: the request's system messages collapse into
 * that one string, rendered when ACP's handler ran. Sections added by later handlers (lab `lab_state`,
 * built-in MCP `mcp_servers`) and later section patches were therefore never sent to the model.
 *
 * This adapter keeps ACP's text but delivers it as an ordinary structured section, so Pi's native
 * section mechanism (initial prompt + diffed patches) carries every extension's sections.
 * Falls back to ACP's original result if its prompt is not `<base>` + suffix.
 */
export function sectionizeBeforeAgentStart(handler: (event: any, ctx: any) => any) {
	return async (event: any, ctx: any) => {
		const sections = event?.systemPromptOptions?.sections;
		const base = sections ? String(event.systemPrompt ?? "") : "";
		const result = await handler(event, ctx);
		const forced = result?.systemPrompt;
		if (!sections || typeof forced !== "string" || !forced.startsWith(base)) return result;
		const extra = forced.slice(base.length).replace(/^\n+/, "");
		if (extra) sections[ACP_SECTION] = extra;
		else delete sections[ACP_SECTION];
		const { systemPrompt: _drop, ...rest } = result;
		return Object.keys(rest).length ? rest : undefined;
	};
}

// In-process context rewriting: no proxy, fetch interception or credential changes.
export default async function (pi: ExtensionAPI) {
	process.env.ACP_AUTO_UPDATE = "0";
	const { createAcpExtension } = await import("./node_modules/billion-context-pi/dist/index.js");
	const api = new Proxy(pi as any, {
		get(target, key, receiver) {
			if (key === "on") {
				return (event: string, handler: any, ...rest: unknown[]) =>
					target.on(event, event === "before_agent_start" ? sectionizeBeforeAgentStart(handler) : handler, ...rest);
			}
			const value = Reflect.get(target, key, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	createAcpExtension({ delegate: false, autoUpdate: false })(api);
}
