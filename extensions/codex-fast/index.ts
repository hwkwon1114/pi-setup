import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Opt-in Codex priority tier. No settings/auth writes, network calls or persistence. */
export default function codexFast(pi: ExtensionAPI) {
  let enabledFor: string | undefined;
  const isCodex = (ctx: ExtensionContext) =>
    /^openai-codex(?:-([2-9]|[1-9]\d+))?$/.test(ctx.model?.provider ?? "") &&
    ctx.model?.api === "openai-codex-responses";
  const isOn = (ctx: ExtensionContext) =>
    enabledFor !== undefined && isCodex(ctx) && enabledFor === ctx.model?.id;

  function status(ctx: ExtensionContext) {
    if (ctx.hasUI) {
      ctx.ui.setStatus("codex-fast", isOn(ctx) ? "Codex fast: priority requested" : undefined);
    }
  }
  function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" = "info") {
    if (ctx.hasUI) ctx.ui.notify(message, level);
  }
  function reset(ctx: ExtensionContext) {
    enabledFor = undefined;
    status(ctx);
  }

  // Deliberately opt in again after reload, session replacement or model change.
  pi.on("session_start", (_event, ctx) => reset(ctx));
  pi.on("session_shutdown", (_event, ctx) => reset(ctx));
  pi.on("model_select", (_event, ctx) => {
    const wasOn = enabledFor !== undefined;
    reset(ctx);
    if (wasOn) notify(ctx, "Codex Fast reset to off after model change. Use /fast on to re-enable.");
  });

  pi.registerCommand("fast", {
    description: "Codex priority tier: /fast on|off|status (default off; may use more quota)",
    getArgumentCompletions(prefix) {
      const items = ["on", "off", "status"]
        .filter((value) => value.startsWith(prefix.toLowerCase()))
        .map((value) => ({ value, label: value }));
      return items.length ? items : null;
    },
    async handler(args, ctx) {
      const action = args.trim().toLowerCase() || "status";
      if (action === "off") {
        reset(ctx);
        notify(ctx, "Codex Fast off. This extension leaves request tiers unchanged.");
      } else if (action === "on") {
        if (!isCodex(ctx)) {
          reset(ctx);
          notify(ctx, "Codex Fast requires openai-codex (or a numbered pi-multi-codex alias) and the Codex Responses API.", "warning");
          return;
        }
        enabledFor = ctx.model!.id;
        status(ctx);
        notify(ctx, "Codex Fast on: requesting priority service; may use more quota/cost. " +
          "Availability depends on OpenAI. Model/thinking unchanged. /fast off disables.", "warning");
      } else if (action === "status") {
        status(ctx);
        notify(ctx, isOn(ctx)
          ? "Codex Fast on: priority requested, not server-confirmed. /fast off disables."
          : "Codex Fast off. Use /fast on with openai-codex to request priority service.");
      } else {
        notify(ctx, "Usage: /fast on | /fast off | /fast status. No change made.", "warning");
      }
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (!isOn(ctx)) return;
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return;
    const payload = event.payload as Record<string, unknown>;
    // The hook's context is the active session: don't affect an auxiliary model.
    if (payload.model !== enabledFor) return;
    return { ...payload, service_tier: "priority" };
  });
}
