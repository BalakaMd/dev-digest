import type { TourLanguage } from "@devdigest/shared";

/** Languages of generated prose written right-to-left. */
const RTL_LANGUAGES: readonly TourLanguage[] = ["Hebrew"];

export function textDirection(language: TourLanguage): "ltr" | "rtl" {
  return RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
}
