"use client";

import React from "react";

/**
 * Milliseconds since `startedAt` (ISO string), re-computed every second while
 * `active`. Returns null when inactive or when `startedAt` is not a valid date.
 */
export function useElapsed(startedAt: string, active: boolean): number | null {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, now - start);
}
