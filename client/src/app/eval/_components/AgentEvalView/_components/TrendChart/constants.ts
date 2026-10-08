/** Series of the trend chart; colours follow the design (blue, green, orange). */
export const SERIES = [
  { key: "recall", labelKey: "dashboard.legend.recall", color: "#4f7cff" },
  { key: "precision", labelKey: "dashboard.legend.precision", color: "#3fb97f" },
  { key: "citation_accuracy", labelKey: "dashboard.legend.citation", color: "#f0a43a" },
] as const;
