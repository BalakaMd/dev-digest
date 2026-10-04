import type { IconName } from "@devdigest/ui";

/** Tour sections in display order; `id` doubles as the URL anchor. */
export const SECTIONS = [
  { id: "architecture", labelKey: "architecture", icon: "Boxes" },
  { id: "critical-paths", labelKey: "criticalPaths", icon: "Activity" },
  { id: "run", labelKey: "run", icon: "Command" },
  { id: "reading-path", labelKey: "readingPath", icon: "ListChecks" },
  { id: "first-tasks", labelKey: "firstTasks", icon: "Sparkles" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: string; icon: IconName }>;

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Relative-time refresh cadence for the provenance line. */
export const NOW_INTERVAL_MS = 60_000;
