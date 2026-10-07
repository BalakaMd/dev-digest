"use client";

import { useCallback, useState } from "react";

/** State for a polite live region: `announce(text)` updates what `<LiveRegion>` reads out. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => setMessage(text), []);
  return { message, announce };
}
