import type { CiInstallation } from "@devdigest/shared";
import type { WizardInitial } from "./constants";

/** N of the "Active in N repos" badge: installations whose workflow is on the default branch. */
export function countInstalled(items: readonly CiInstallation[]): number {
  return items.filter((i) => i.status === "installed").length;
}

/** AC-69: the agent changed after the installation was last exported. */
export function isOutOfDate(agentVersion: number, inst: CiInstallation): boolean {
  return agentVersion > inst.exported_agent_version;
}

/** AC-42: the wizard preselection taken from an installation's last export. */
export function toWizardInitial(inst: CiInstallation): WizardInitial {
  return { repo: inst.repo, triggers: [...inst.triggers], postAs: inst.post_as };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "4 min. ago" style time since `iso`; unparseable input is returned unchanged. */
export function formatRelative(iso: string, now: number = Date.now(), locale = "en"): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = t - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), "second");
}
