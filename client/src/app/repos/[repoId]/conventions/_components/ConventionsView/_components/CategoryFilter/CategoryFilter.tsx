/* CategoryFilter — "All", one chip per category present (with counts), and a
   separate "Rejected (N)" chip once anything has been rejected. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import type { ConventionCategory } from "@devdigest/shared";

/** What the list shows: everything, one category, or the rejected pile. */
export type ConventionFilter = ConventionCategory | "rejected" | null;

export function CategoryFilter({
  total,
  categories,
  rejectedCount,
  active,
  onChange,
}: {
  total: number;
  categories: { category: ConventionCategory; count: number }[];
  rejectedCount: number;
  active: ConventionFilter;
  onChange: (next: ConventionFilter) => void;
}) {
  const t = useTranslations("conventions");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group">
      <Chip active={active === null} count={total} onClick={() => onChange(null)}>
        {t("page.filterAll")}
      </Chip>
      {categories.map(({ category, count }) => (
        <Chip key={category} active={active === category} count={count} onClick={() => onChange(category)}>
          {t(`category.${category}`)}
        </Chip>
      ))}
      {rejectedCount > 0 && (
        <Chip
          active={active === "rejected"}
          count={rejectedCount}
          icon="XCircle"
          color="var(--text-muted)"
          onClick={() => onChange("rejected")}
        >
          {t("page.filterRejected")}
        </Chip>
      )}
    </div>
  );
}
