import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import upstream from "./node_modules/@juicesharp/rpiv-todo/index.ts";

// A thin local prompt adapter; upstream state, replay and UI are unchanged.
export default function (pi: ExtensionAPI) {
  const host = new Proxy(pi, {
    get(target, key) {
      if (key === "registerTool") return (tool: any) => target.registerTool(tool.name === "todo" ? {
        ...tool,
        promptGuidelines: [
          "Use todos for substantial multi-step work or an explicit task list; skip trivial edits and conversation.",
          "Track coarse deliverables and blockers, not every tool call. Update at meaningful milestones and before handoff.",
          "Project markdown is authoritative for objective, scope, decisions and evidence. Todos are session navigation, not permission or proof.",
          "After resumption or context compression, list outstanding todos and restore the relevant project record before consequential work.",
          "Mark completed only when the deliverable and applicable checks are actually complete; retain unresolved failures."
        ],
      } : tool);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  upstream(host);
}
