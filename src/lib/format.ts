import type { AttentionState, QueueSummary } from "@/lib/activity-types";

export function formatAge(value: string | null, now = Date.now()): string {
  if (!value) return "no recent activity";
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return "unknown time";

  const elapsed = Math.max(0, now - time);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function shortSha(sha: string): string {
  return sha ? sha.slice(0, 7) : "unknown";
}

export function formatLines(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : pluralForm ?? `${singular}s`;
}

export function initials(value: string): string {
  return value
    .split(/[\s-]/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function statusLabel(state: AttentionState): string {
  const labels: Record<AttentionState, string> = {
    "your-review": "Your review",
    approved: "Approved",
    "agent-revising": "Changes requested",
    "in-review": "In review",
    "checks-failing": "Checks failing",
    draft: "Draft",
    "no-pull-request": "No pull request",
    unknown: "State unavailable",
  };
  return labels[state];
}

export type StatusTone = "signal" | "clear" | "hold" | "muted";

export function statusTone(state: AttentionState): StatusTone {
  if (state === "your-review" || state === "agent-revising" || state === "checks-failing") return "signal";
  if (state === "approved") return "clear";
  if (state === "in-review") return "hold";
  return "muted";
}

export function deploymentLabel(state: string): string {
  const labels: Record<string, string> = {
    success: "Live",
    in_progress: "Deploying",
    queued: "Queued",
    failure: "Failed",
    error: "Failed",
    inactive: "Inactive",
  };
  return labels[state] ?? "Unknown";
}

export function queueHeadline(summary: QueueSummary): string {
  if (summary.needsYou === 0) return "Nothing is waiting on you.";
  return `${summary.needsYou} ${plural(summary.needsYou, "change")} ${
    summary.needsYou === 1 ? "is" : "are"
  } waiting on you.`;
}

export function queueTriage(summary: QueueSummary): string {
  const parts: string[] = [];
  if (summary.failedChecks > 0) {
    parts.push(`${summary.failedChecks} ${plural(summary.failedChecks, "check")} failing`);
  }
  if (summary.large > 0) {
    parts.push(`${summary.large} large ${plural(summary.large, "diff")}`);
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : "All checks are passing.";
}

export function repositoryBranchUrl(repoUrl: string, branch: string): string {
  return `${repoUrl}/tree/${encodeURIComponent(branch)}`;
}
