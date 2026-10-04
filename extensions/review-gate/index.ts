import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { getAgentDir, ModelRuntime, DefaultResourceLoader, SettingsManager, SessionManager,
  createAgentSession, createEventBus } from '@earendil-works/pi-coding-agent';
import { installReviewGate } from './policy.mjs';
import { loadSubagentApi, runOwnedReview } from './runner.mjs';

export default function (pi: ExtensionAPI) {
  // Package-owned inherited ceilings already apply inside dedicated child runners.
  if (process.env.PI_SUBAGENT_CHILD === '1') return;
  const agentDir = getAgentDir();
  let api: Awaited<ReturnType<typeof loadSubagentApi>>;
  const loadApi = async () => api ??= await loadSubagentApi(agentDir);
  installReviewGate(pi, {
    loadApi,
    runReview: async request => runOwnedReview({ ...request, agentDir, api: await loadApi(),
      sdk: { ModelRuntime, DefaultResourceLoader, SettingsManager, SessionManager, createAgentSession, createEventBus } }),
  });
}
