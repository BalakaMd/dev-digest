"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { copyText } from "../clipboard";

/** Copies `text` and announces the outcome through `announce` (polite live region). */
export function CopyButton({
  text,
  label,
  children,
  announce,
}: {
  text: string;
  /** Accessible name, e.g. "Copy command 2". */
  label: string;
  /** Visible content; icon-only when omitted. */
  children?: React.ReactNode;
  announce: (message: string) => void;
}) {
  const t = useTranslations("onboardingSections");
  const onClick = async () => {
    const ok = await copyText(text);
    announce(t(ok ? "copy.done" : "copy.failed"));
  };
  return (
    <Button kind="secondary" size="sm" icon="Copy" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}
