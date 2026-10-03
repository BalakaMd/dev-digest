/* serializedContext — the "SERIALIZES AS" preview: the `## Project context`
   heading and one `- <path>` line per attached document, in attachment order (AC-81). */
export function serializedContext(paths: readonly string[]): string {
  return ["## Project context", ...paths.map((p) => `- ${p}`)].join("\n");
}
