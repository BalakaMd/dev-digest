import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { ScoreColumn } from "./ScoreColumn";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("ScoreColumn", () => {
  it("renders the score, caption and meta", () => {
    wrap(<ScoreColumn score={61} meta={<span>COST</span>} />);
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText("COST")).toBeInTheDocument();
  });

  it("renders a placeholder ring with a tooltip-only hint when there is no score", () => {
    wrap(<ScoreColumn score={null} hint="Run a review" />);
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.queryByText("Run a review")).toBeNull();
    expect(screen.getByRole("img")).toHaveAttribute("title", "Run a review");
  });
});
