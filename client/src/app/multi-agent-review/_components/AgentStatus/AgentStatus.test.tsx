import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunStatus } from "@devdigest/shared";
import common from "../../../../../messages/en/multiAgentCommon.json";
import { AgentStatus } from "./AgentStatus";

afterEach(cleanup);

function renderStatus(status: RunStatus) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgentCommon: common }}>
      <AgentStatus status={status} />
    </NextIntlClientProvider>,
  );
}

// NFR-5: a status is never conveyed by colour alone — always a word plus an icon.
describe("AgentStatus (NFR-5)", () => {
  const cases: [RunStatus, string][] = [
    ["running", "running"],
    ["done", "done"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ];

  it.each(cases)("%s shows the word %s and its own decorative icon", (status, word) => {
    const { container } = renderStatus(status);
    expect(screen.getByText(word)).toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("uses a different icon for every status", () => {
    const shapes = (["running", "done", "failed", "cancelled"] as RunStatus[]).map((status) => {
      const { container, unmount } = renderStatus(status);
      const html = container.querySelector("svg")!.innerHTML;
      unmount();
      return html;
    });
    expect(new Set(shapes).size).toBe(4);
  });
});
