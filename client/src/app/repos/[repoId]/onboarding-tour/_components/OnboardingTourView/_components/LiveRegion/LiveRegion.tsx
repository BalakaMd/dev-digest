import React from "react";
import { s } from "./styles";

/** Visually hidden `aria-live="polite"` region — always mounted so changes are announced. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={s.hidden}>
      {message}
    </div>
  );
}
