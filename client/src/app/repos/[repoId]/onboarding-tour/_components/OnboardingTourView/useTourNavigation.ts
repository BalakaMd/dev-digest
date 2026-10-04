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
  // A click scrolls programmatically; the spy ignores the scroll events it causes.
  const lockUntil = React.useRef(0);

  const goTo = React.useCallback((id: string, updateHash: boolean) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView?.({ block: "start" });
    el.focus({ preventScroll: true });
    lockUntil.current = Date.now() + 800;
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

  // Scroll spy: the active section is the last heading above a line near the top.
  // Capture phase, because the page may scroll inside an app-shell container.
  React.useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      const line = 120;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [ready, ids]);

  const shareUrl = () => `${window.location.origin}${window.location.pathname}#${activeId}`;

  return { activeId, select, shareUrl };
}
