import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PromptAssembly } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { SkillsPromptBlock } from "./SkillsPromptBlock";
import { splitSkillBlocks } from "./split-skill-blocks";

afterEach(cleanup);

const SKILLS = "### secret-leakage-gate\nFlag secrets.\n\n### lethal-trifecta\nCheck the trifecta.";

function renderBlock(assembly: Partial<PromptAssembly>) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <SkillsPromptBlock assembly={{ system: "s", user: "u", ...assembly }} color="red" />
    </NextIntlClientProvider>,
  );
}

describe("splitSkillBlocks", () => {
  it("splits the joined section back into one block per skill, in order", () => {
    expect(splitSkillBlocks(SKILLS, ["secret-leakage-gate", "lethal-trifecta"])).toEqual([
      "### secret-leakage-gate\nFlag secrets.",
      "### lethal-trifecta\nCheck the trifecta.",
    ]);
  });

  it("returns null when a name is missing from the text", () => {
    expect(splitSkillBlocks(SKILLS, ["unknown"])).toBeNull();
  });
});

describe("SkillsPromptBlock", () => {
  it("shows one sub-block per skill in prompt order and the skills-block token count", () => {
    renderBlock({
      skills: SKILLS,
      skills_tokens: 21,
      skill_blocks: [
        { name: "secret-leakage-gate", tokens: 9 },
        { name: "lethal-trifecta", tokens: 10 },
      ],
    });
    expect(screen.getByText("~21 tokens · skills block only")).toBeInTheDocument();
    expect(screen.getByText("2 skills")).toBeInTheDocument();
    const labels = screen.getAllByText(/^\d\. /).map((el) => el.textContent);
    expect(labels).toEqual(["1. secret-leakage-gate", "2. lethal-trifecta"]);
    expect(screen.getByText("~9 tokens")).toBeInTheDocument();
  });

  it("falls back to a single block for traces without per-skill stats", () => {
    renderBlock({ skills: SKILLS });
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.queryByTestId("skills-prompt-block")).not.toBeInTheDocument();
  });
});
