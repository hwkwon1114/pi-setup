import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Provider, Model, TranscriptContext } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aliasStream, getAgentDir } from "./stream.ts";
export { getAgentDir, aliasStream };
import { createQuotaService, registerCodexRouter } from "./router.mjs";
import { installAccountStatus } from "./account-status.mjs";

const BASE = "openai-codex";
const SLOT = /^openai-codex-([2-9]|[1-9]\d+)$/;
const providerFor = (slot: number) => slot === 1 ? BASE : `${BASE}-${slot}`;
const slotFor = (id: string) => id === BASE ? 1 : Number(SLOT.exec(id)?.[1]) || undefined;

export function createCodexAlias(native: Provider<any>, slot: number): Provider<any> {
  const id = providerFor(slot);
  const nativeModel = (model: Model<any>) => ({ ...model, provider: BASE });
  const nativeContext = (context: TranscriptContext): TranscriptContext => ({
    ...context,
    messages: context.messages.map(message => {
      if (message.role !== "assistant" || !SLOT.test(message.provider)) return message;
      return { ...message, provider: BASE,
        ...(message.deferred ? { deferred: { ...message.deferred, provider: BASE } } : {}) };
    }),
  });
  const oauth = native.auth.oauth;
  if (!oauth) throw new Error("Native Codex OAuth unavailable");
  return {
    id, name: `Codex #${slot}`, baseUrl: native.baseUrl, headers: native.headers,
    auth: { oauth: {
      ...oauth,
      name: `Codex #${slot} (ChatGPT subscription)`,
      login: (interaction, options) => oauth.login({ ...interaction,
        notify: notice => {
          if (notice.type === "auth_url") interaction.notify({ type: "info",
            message: `Codex account #${slot}: use a private browser window to sign into a different account.` });
          interaction.notify(notice);
        },
      }, options),
      refresh: (credential, signal) => oauth.refresh(credential, signal),
      toAuth: credential => oauth.toAuth(credential),
    } },
    getModels: () => native.getModels().map(model => ({ ...model, provider: id })),
    getAllModels: () => (native.getAllModels?.() ?? native.getModels()).map(model => ({ ...model, provider: id })),
    stream: (model, context, options) => aliasStream(native.stream(nativeModel(model), nativeContext(context), options), model, id),
    streamSimple: (model, context, options) => aliasStream(native.streamSimple(nativeModel(model), nativeContext(context), options), model, id),
    ...(native.filterModels ? { filterModels: (models, credential) =>
      native.filterModels!(models.map(nativeModel), credential).map(model => ({ ...model, provider: id })) } : {}),
  };
}

export default async function multiCodex(pi: ExtensionAPI, suppliedNative?: Provider<any>) {
  const native = suppliedNative ?? (await import("@earendil-works/pi-ai/providers/all")).builtinProviders().find(provider => provider.id === BASE);
  if (!native) throw new Error("Native Codex provider unavailable");
  const registered = new Set<number>();
  function credentials(): number[] {
    try {
      const auth = JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8"));
      return Object.entries(auth).filter(([key, value]: [string, any]) =>
        slotFor(key) && value?.type === "oauth" && typeof value.access === "string" && typeof value.accountId === "string")
        .map(([key]) => slotFor(key)!).sort((a, b) => a - b);
    } catch { return []; }
  }
  function register(slot: number) {
    if (slot === 1 || registered.has(slot)) return;
    pi.registerProvider(createCodexAlias(native!, slot));
    registered.add(slot);
  }
  function sync() { register(2); credentials().forEach(register); }
  sync();
  const quotaService = createQuotaService({ readCredentials: () => {
    try { return JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8")); }
    catch { return {}; }
  } });
  registerCodexRouter(pi, native, quotaService);
  installAccountStatus(pi, () => {
    try { return JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8")); }
    catch { return {}; }
  });
  pi.on("session_start", sync);
  pi.registerCommand("codex-add", {
    description: "Add a Codex OAuth account slot without modifying OpenAI logins",
    handler: async (_args, ctx) => {
      sync();
      // Reuse the ready-to-login slot before allocating higher slots.
      const authenticated = new Set(credentials());
      let slot = 2;
      while (authenticated.has(slot)) slot++;
      register(slot);
      ctx.ui.notify(`Codex #${slot} ready. Run /login ${providerFor(slot)}. Use a private browser window for a different account.`, "info");
    },
  });
  pi.registerCommand("codex-status", {
    description: "Show Codex account slot authentication status",
    handler: async (_args, ctx) => {
      sync();
      const authenticated = new Set(credentials());
      ctx.ui.notify([...new Set([1, ...registered])].sort((a,b) => a-b).map(slot =>
        `${providerFor(slot)}: ${authenticated.has(slot) ? "signed in" : "not signed in"}`).join("\n"), "info");
    },
  });
  pi.registerCommand("codex-switch", {
    description: "Select an authenticated Codex account using the current model ID",
    handler: async (_args, ctx) => {
      sync();
      if (!ctx.model || !slotFor(ctx.model.provider)) {
        ctx.ui.notify("Select a Codex model via /model first.", "warning"); return;
      }
      const ids = credentials().map(providerFor);
      if (!ids.length) { ctx.ui.notify("Run /login openai-codex first.", "warning"); return; }
      const selected = await ctx.ui.select("Select Codex account", ids);
      if (!selected) return;
      const model = ctx.modelRegistry.find(selected, ctx.model.id);
      if (!model || !(await pi.setModel(model))) ctx.ui.notify("Model unavailable for that account; use /model.", "warning");
    },
  });
}
