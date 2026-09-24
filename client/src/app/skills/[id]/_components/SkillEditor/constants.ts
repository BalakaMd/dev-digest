import type { IconName } from "@devdigest/ui";

/** Editor tabs, in order. `labelKey` resolves under the `skills` namespace. */
export const EDITOR_TABS: readonly { key: string; labelKey: string; icon: IconName }[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versioning", labelKey: "editor.tabs.versioning", icon: "History" },
];

export const VALID_TABS: readonly string[] = EDITOR_TABS.map((tb) => tb.key);
