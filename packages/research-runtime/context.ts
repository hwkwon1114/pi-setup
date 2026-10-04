import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// In-process context rewriting: no proxy, fetch interception or credential changes.
export default async function (pi: ExtensionAPI) {
  process.env.ACP_AUTO_UPDATE = "0";
  const { createAcpExtension } = await import("./node_modules/billion-context-pi/dist/index.js");
  createAcpExtension({ delegate: false, autoUpdate: false })(pi);
}
