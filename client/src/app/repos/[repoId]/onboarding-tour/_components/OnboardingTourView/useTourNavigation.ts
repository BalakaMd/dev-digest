"use client";

import React from "react";

/**
 * Active section + scroll/focus for the "On this page" list and the Share link.
 * `ready` flips true once the section headings are in the DOM; the URL hash is
 * honoured exactly once at that point (AC-28).
 */
export function useTourNavigation(ids: readonly string[], ready: boolean) {
  const [activeId, setActiveId] = React.useState<string>(ids[0] ?? "");
  const initialised = React.useRef(false);

  const goTo = React.useCallback((id: string, updateHash: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView?.({ block: "start" });
    el.focus({ preventScroll: true });
    setActiveId(id);
    if (updateHash) window.history.replaceState(null, "", `#${id}`);
  }, []);

  const select = React.useCallback((id: string) => goTo(id, true), [goTo]);

  React.useEffect(() => {
    if (!ready || initialised.current) return;
    initialised.current = true;
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (hash && ids.includes(hash)) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView?.({ block: "start" });
        setActiveId(hash);
      }
    }
  }, [ready, ids]);

  const shareUrl = () => `${window.location.origin}${window.location.pathname}#${activeId}`;

  return { activeId, select, shareUrl };
}
