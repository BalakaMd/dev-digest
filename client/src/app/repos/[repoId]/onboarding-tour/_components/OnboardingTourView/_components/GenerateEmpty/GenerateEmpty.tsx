"use client";

import React from "react";
import { Button, EmptyState } from "@devdigest/ui";

/** Empty state with a natively disabled CTA — the vendored EmptyState has no disabled prop (AC-24). */
export function GenerateEmpty({
  title,
  body,
  cta,
  onCta,
  disabled,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 60 }}>
      <EmptyState icon="Boxes" title={title} body={body} />
      <div style={{ marginTop: -36 }}>
        <Button kind="secondary" icon="Plus" disabled={disabled} onClick={onCta}>
          {cta}
        </Button>
      </div>
    </div>
  );
}
