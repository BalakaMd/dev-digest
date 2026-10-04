import type { TourLanguage } from "@devdigest/shared";
import { isRtl } from "../../helpers";

/** Direction of generated prose for the stored brief language. */
export function textDirection(language: TourLanguage): "ltr" | "rtl" {
  return isRtl(language) ? "rtl" : "ltr";
}
