import type { IconName } from "@devdigest/ui";

export interface AgentTone {
  /** Accent colour of the agent (border, icon, column strip). */
  color: string;
  icon: IconName;
}

/* First match wins; matched against the agent name (lower-cased). */
const BY_NAME: Array<{ re: RegExp; tone: AgentTone }> = [
  { re: /secur|vuln|owasp|auth/, tone: { color: "#ef4444", icon: "Shield" } },
  { re: /perform|perf\b|speed|latency/, tone: { color: "#f59e0b", icon: "Zap" } },
  { re: /junior|mentor|readab|style|clean/, tone: { color: "#3b82f6", icon: "Lightbulb" } },
  { re: /customer|product|contract|\bdx\b|\bux\b|user/, tone: { color: "#a855f7", icon: "Users" } },
  { re: /architect|design|structure|layer|domain/, tone: { color: "#10b981", icon: "Boxes" } },
  { re: /test|quality/, tone: { color: "#14b8a6", icon: "FlaskConical" } },
];

/* Colours for agents no keyword recognises, picked by a stable hash. */
const FALLBACK_COLORS = ["#ec4899", "#f97316", "#6366f1", "#06b6d4", "#84cc16", "#eab308"];

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Colour and icon of an agent, derived on the client: a keyword in the name
 * decides first (security → red shield, …); otherwise a colour is picked by a
 * stable hash of the id (or the name), so the same agent keeps its colour.
 */
export function agentTone(agent: { id?: string | null; name?: string | null }): AgentTone {
  const name = (agent.name ?? "").toLowerCase();
  const hit = BY_NAME.find((m) => m.re.test(name));
  if (hit) return hit.tone;
  const key = agent.id ?? agent.name ?? "";
  return { color: FALLBACK_COLORS[hash(key) % FALLBACK_COLORS.length]!, icon: "Cpu" };
}

/** Tinted background for an icon square, derived from the agent colour. */
export function toneBackground(color: string, percent = 14): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
