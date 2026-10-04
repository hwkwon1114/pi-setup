import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Control both ordinary updates and the independent force-update watcher.
// Set before import so the proxy child inherits the policy.
export default async function (pi: ExtensionAPI) {
  process.env.ACP_AUTO_UPDATE = "0";
  process.env.ACP_AUTO_RESTART_ON_UPDATE = "0";
  process.env.BILI_ADVISORY_CHECK = "0";
  process.env.BILI_RELEASE_NOTES_CHECK = "0";
  process.env.BILI_MITM = "0"; // native fetch routing needs no certificate interception
  const { default: activate } = await import("./node_modules/billion-context/dist/agent/pi-native.js");
  activate(pi);
}
