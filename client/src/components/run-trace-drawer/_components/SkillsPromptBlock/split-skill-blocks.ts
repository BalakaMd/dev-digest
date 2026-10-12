/**
 * Split the joined `## Skills / rules` text back into one block per skill.
 * The server renders each skill as `### <name>\n<body>` and joins them with a
 * blank line, in prompt order — `names` is that order (trace.skill_blocks).
 * Returns null when the text does not match (e.g. a trace from before skills
 * had names), so the caller can fall back to one undivided block.
 */
export function splitSkillBlocks(text: string, names: string[]): string[] | null {
  const starts: number[] = [];
  let from = 0;
  for (const name of names) {
    const at = text.indexOf(`### ${name}\n`, from);
    if (at < 0) return null;
    starts.push(at);
    from = at + 1;
  }
  return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length).trim());
}
