#!/usr/bin/env python3
"""
Inspect and summarize subagent and literature-reviewer usage history across sessions.
"""

import argparse
import datetime
import glob
import json
import os
import sys

def get_pi_agent_home():
    env = os.environ.get("PI_CODING_AGENT_DIR")
    if env and os.path.isdir(env):
        return os.path.abspath(env)
    default = os.path.expanduser("~/.pi/agent")
    if os.path.isdir(default):
        return default
    return os.path.expanduser("~/.pi/agent")

def discover_available_agents(agent_home):
    available = set()
    # Builtin subagents from pi-subagents package
    builtin_dir = os.path.join(agent_home, "npm/node_modules/pi-subagents/agents")
    if os.path.isdir(builtin_dir):
        for f in glob.glob(os.path.join(builtin_dir, "*.md")):
            available.add(os.path.splitext(os.path.basename(f))[0])
    # User agents in ~/.pi/agent/agents
    user_agents_dir = os.path.join(agent_home, "agents")
    if os.path.isdir(user_agents_dir):
        for f in glob.glob(os.path.join(user_agents_dir, "*.md")):
            available.add(os.path.splitext(os.path.basename(f))[0])
    # Roles from settings.json
    settings_file = os.path.join(agent_home, "settings.json")
    disabled = set()
    if os.path.isfile(settings_file):
        try:
            with open(settings_file, "r", encoding="utf-8") as f:
                s = json.load(f)
                agent_overrides = s.get("subagents", {}).get("agentOverrides", {})
                for a, cfg in agent_overrides.items():
                    if isinstance(cfg, dict) and cfg.get("disabled"):
                        disabled.add(a)
                    else:
                        available.add(a)
        except Exception:
            pass
    # Exclude internal roles not meant for direct user invocation
    internal_roles = {"literature-coordinator", "literature-leaf"}
    return sorted(list(available - disabled - internal_roles))

def load_subagent_runs(agent_home):
    runs = []
    pattern = os.path.join(agent_home, "sessions/*/subagent-artifacts/*_meta.json")
    for meta_path in glob.glob(pattern):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            ts = data.get("timestamp", 0) / 1000.0
            usage = data.get("usage", {})
            runs.append({
                "type": "subagent",
                "id": data.get("runId", os.path.basename(meta_path).split("_")[0]),
                "agent": data.get("agent", "unknown"),
                "model": data.get("model", data.get("requestedModel", "unknown")),
                "timestamp": ts,
                "duration_s": data.get("durationMs", 0) / 1000.0,
                "exit_code": data.get("exitCode", 0),
                "turns": usage.get("turns", 0),
                "tool_calls": data.get("toolCount", 0),
                "cost": usage.get("cost", 0.0),
                "input_tokens": usage.get("input", 0),
                "output_tokens": usage.get("output", 0),
                "cache_tokens": usage.get("cacheRead", 0),
                "status": "completed" if data.get("exitCode") == 0 else "failed",
                "path": meta_path
            })
        except Exception:
            continue
    return runs

def load_literature_runs(agent_home):
    runs = []
    base_dir = os.path.join(agent_home, "literature-review-runs")
    if not os.path.isdir(base_dir):
        return runs
    for root, dirs, files in os.walk(base_dir):
        if "result.json" in files:
            res_path = os.path.join(root, "result.json")
            try:
                with open(res_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                run_dir = root
                inv_file = os.path.join(run_dir, "invocation.json")
                model = "unknown"
                depth = 1
                if os.path.isfile(inv_file):
                    with open(inv_file, "r", encoding="utf-8") as f:
                        inv = json.load(f)
                        model = inv.get("model", "unknown")
                        depth = inv.get("depth", 1)
                ts = data.get("startedAt", 0) / 1000.0
                usage = data.get("ownUsage", {})

                # Check execution outcome first: do not let declaredStatus conceal failure/timeout
                if not data.get("ok"):
                    error_msg = str(data.get("error") or "failed")
                    if "time limit" in error_msg.lower():
                        status = "timeout"
                    else:
                        status = "failed"
                else:
                    status = data.get("declaredStatus") or "completed"

                runs.append({
                    "type": "literature-review",
                    "id": os.path.basename(run_dir),
                    "agent": f"literature-reviewer (d{depth})",
                    "model": model,
                    "timestamp": ts,
                    "duration_s": data.get("elapsedMs", 0) / 1000.0,
                    "exit_code": data.get("exitCode", 0),
                    "turns": 0,
                    "tool_calls": data.get("toolCalls", 0),
                    "cost": None,  # Literature runs do not log USD cost
                    "input_tokens": usage.get("input", 0),
                    "output_tokens": usage.get("output", 0),
                    "cache_tokens": usage.get("cacheRead", 0),
                    "status": status,
                    "path": res_path
                })
            except Exception:
                continue
    return runs

def format_duration(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    if mins > 0:
        return f"{mins}m {secs}s"
    return f"{secs}s"

def format_tokens(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)

def print_table(rows, headers):
    widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            widths[i] = max(widths[i], len(str(val)))
    header_line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    sep_line = "  ".join("-" * widths[i] for i in range(len(headers)))
    print(header_line)
    print(sep_line)
    for row in rows:
        print("  ".join(str(val).ljust(widths[i]) for i, val in enumerate(row)))

def main():
    parser = argparse.ArgumentParser(description="Track subagent and literature-reviewer usage history.")
    parser.add_argument("--all", "-a", action="store_true", help="Show all runs without truncation")
    parser.add_argument("--json", "-j", action="store_true", help="Output machine-readable JSON")
    parser.add_argument("--agent", type=str, help="Filter by specific agent name")
    parser.add_argument("--subagents-only", action="store_true", help="Include only standard pi-subagents runs")
    parser.add_argument("--literature-only", action="store_true", help="Include only literature review runs")
    args = parser.parse_args()

    agent_home = get_pi_agent_home()
    all_runs = []
    if not args.literature_only:
        all_runs.extend(load_subagent_runs(agent_home))
    if not args.subagents_only:
        all_runs.extend(load_literature_runs(agent_home))

    if args.agent:
        all_runs = [r for r in all_runs if args.agent.lower() in r["agent"].lower()]

    all_runs.sort(key=lambda r: r["timestamp"], reverse=True)

    available_agents = discover_available_agents(agent_home)
    used_agents = {r["agent"].split(" ")[0] for r in all_runs}
    unused_agents = [a for a in available_agents if a not in used_agents and not any(a in u for u in used_agents)]

    if args.json:
        known_cost = sum(r["cost"] for r in all_runs if r["cost"] is not None)
        has_unknown_cost = any(r["cost"] is None for r in all_runs)
        output = {
            "summary": {
                "totalRuns": len(all_runs),
                "totalCost": round(known_cost, 4),
                "hasIncompleteCost": has_unknown_cost,
                "totalDurationSeconds": sum(r["duration_s"] for r in all_runs),
                "totalInputTokens": sum(r["input_tokens"] for r in all_runs),
                "totalOutputTokens": sum(r["output_tokens"] for r in all_runs),
                "availableAgents": available_agents,
                "unusedAgents": unused_agents
            },
            "runs": all_runs
        }
        print(json.dumps(output, indent=2))
        return

    print("================================================================================")
    print("                      PI SUBAGENT USAGE & ACTIVITY AUDIT                       ")
    print("================================================================================")
    total_runs = len(all_runs)
    known_cost = sum(r["cost"] for r in all_runs if r["cost"] is not None)
    has_unknown_cost = any(r["cost"] is None for r in all_runs)
    total_duration = sum(r["duration_s"] for r in all_runs)
    total_in = sum(r["input_tokens"] for r in all_runs)
    total_out = sum(r["output_tokens"] for r in all_runs)
    total_cache = sum(r["cache_tokens"] for r in all_runs)

    print(f"Total Runs:       {total_runs}")
    print(f"Total Duration:   {format_duration(total_duration)}")
    if has_unknown_cost:
        print(f"Total Cost:       ${known_cost:.2f}* (*incomplete: literature runs do not log USD cost)")
    elif known_cost > 0:
        print(f"Total Cost:       ${known_cost:.2f}")
    print(f"Token Activity:   {format_tokens(total_in)} in / {format_tokens(total_out)} out / {format_tokens(total_cache)} cache-read\n")

    # Aggregate by agent
    by_agent = {}
    for r in all_runs:
        a = r["agent"]
        if a not in by_agent:
            by_agent[a] = {
                "count": 0,
                "duration": 0.0,
                "cost": 0.0,
                "has_known_cost": False,
                "turns": 0,
                "tools": 0,
                "models": set()
            }
        by_agent[a]["count"] += 1
        by_agent[a]["duration"] += r["duration_s"]
        if r["cost"] is not None:
            by_agent[a]["cost"] += r["cost"]
            by_agent[a]["has_known_cost"] = True
        by_agent[a]["turns"] += r["turns"]
        by_agent[a]["tools"] += r["tool_calls"]
        by_agent[a]["models"].add(r["model"].split(":")[0])

    print("--- USAGE BY AGENT / ROLE ---")
    agent_rows = []
    for a, stats in sorted(by_agent.items(), key=lambda x: x[1]["count"], reverse=True):
        cost_str = f"${stats['cost']:.2f}" if stats["has_known_cost"] else "-"
        models_str = ", ".join(sorted(list(stats["models"])))[:30]
        agent_rows.append([
            a,
            str(stats["count"]),
            format_duration(stats["duration"]),
            str(stats["tools"]),
            cost_str,
            models_str
        ])
    print_table(agent_rows, ["Agent/Role", "Runs", "Duration", "Tool Calls", "Cost", "Models Used"])
    print()

    if unused_agents:
        print("--- UNUSED CONFIGURED AGENTS ---")
        print("  " + ", ".join(unused_agents))
        print("  (Tip: delegate tasks via /subagent <agent> or natural language)\n")

    print("--- RECENT RUNS ---")
    run_rows = []
    display_runs = all_runs if args.all else all_runs[:10]
    for r in display_runs:
        dt = datetime.datetime.fromtimestamp(r["timestamp"]).strftime("%Y-%m-%d %H:%M") if r["timestamp"] else "-"
        dur = format_duration(r["duration_s"])
        model_short = r["model"].split("/")[-1].split(":")[0]
        run_rows.append([
            r["id"][:8],
            dt,
            r["agent"][:24],
            model_short[:16],
            dur,
            r["status"][:20]
        ])
    print_table(run_rows, ["Run ID", "Date", "Agent", "Model", "Duration", "Status"])
    if len(all_runs) > len(display_runs):
        print(f"\n  ... showing {len(display_runs)} of {len(all_runs)} runs. Use --all to show all runs.")

    print("================================================================================")

if __name__ == "__main__":
    main()
