/* useUnsavedGuard — protects unsaved edits (AC-74, Q-6). While `dirty` it
   registers `beforeunload` (reload / close / external links) and a capture-phase
   click listener for same-origin `<a href>` (sidebar, breadcrumbs). `guard(run)`
   runs `run` at once when clean, otherwise parks it behind a Discard / Keep
   editing prompt. Browser Back is knowingly not covered (no popstate hack). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";

interface Pending {
  run: () => void;
}

export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending | null>(null);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      // External links are covered by `beforeunload`.
      if (url.origin !== window.location.origin) return;
      const next = url.pathname + url.search + url.hash;
      if (next === window.location.pathname + window.location.search + window.location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ run: () => router.push(next) });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  const guard = React.useCallback(
    (run: () => void) => {
      if (dirty) setPending({ run });
      else run();
    },
    [dirty],
  );
  const discard = () => {
    const p = pending;
    setPending(null);
    p?.run();
  };
  const keepEditing = () => setPending(null);

  return { guard, prompting: pending !== null, discard, keepEditing };
}
