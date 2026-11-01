/**
 * cc-patch compatibility: keep the system prompt's documentation paths valid under pi-cc-patch.
 *
 * pi-cc-patch (direct Anthropic OAuth requests only) rewrites `pi-coding-agent` to `coding-agent` throughout the system
 * prompt, so the documentation paths the model is given name `.../node_modules/@earendil-works/coding-agent/...`, which
 * does not exist. Rewriting the text back would undo the patch, so this extension instead links that name to the running
 * Pi package directory (relative symlink; a junction on Windows). It checks at each session start, so a new Pi release
 * directory gets its link on the first start after an update. Nothing happens when pi-cc-patch is not configured.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, getPackageDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Create `<scope>/coding-agent` -> `<scope>/pi-coding-agent` next to `pkgDir`. */
export function ensureCodingAgentAlias(pkgDir: string): "created" | "exists" | "skipped" {
	if (path.basename(pkgDir) !== "pi-coding-agent") return "skipped";
	const link = path.join(path.dirname(pkgDir), "coding-agent");
	try { fs.lstatSync(link); return "exists"; } catch { /* absent */ }
	try {
		if (process.platform === "win32") fs.symlinkSync(pkgDir, link, "junction");
		else fs.symlinkSync("pi-coding-agent", link);
	} catch (e) {
		if ((e as { code?: string }).code === "EEXIST") return "exists"; // another Pi process linked it first
		throw e;
	}
	return "created";
}

/** True when settings.json lists a pi-cc-patch package (string or `{ source }` entry). */
export function ccPatchConfigured(agentDir: string): boolean {
	try {
		const s = JSON.parse(fs.readFileSync(path.join(agentDir, "settings.json"), "utf8")) as { packages?: unknown[] };
		return (s.packages ?? []).some((p) => String(typeof p === "string" ? p : (p as { source?: unknown })?.source ?? "").includes("pi-cc-patch"));
	} catch { return false; }
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_e, ctx) => {
		try {
			if (ccPatchConfigured(getAgentDir()) && ensureCodingAgentAlias(getPackageDir()) === "created" && ctx.hasUI)
				ctx.ui.notify("cc-patch-compat: linked @earendil-works/coding-agent so sanitized documentation paths resolve", "info");
		} catch (e) {
			if (ctx.hasUI) ctx.ui.notify(`cc-patch-compat: could not link the coding-agent documentation path (${(e as Error).message})`, "warning");
		}
	});
}
