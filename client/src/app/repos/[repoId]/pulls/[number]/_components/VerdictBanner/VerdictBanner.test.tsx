import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("renders optional action, footer, meta and info slots", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary="ok"
        score={90}
        findingsCount={0}
        blockers={0}
        info="From Security Reviewer"
        action={<button>ACT</button>}
        footer={<div>FOOT</div>}
        meta={<div>META</div>}
      />,
    );
    expect(screen.getByRole("button", { name: "ACT" })).toBeInTheDocument();
    expect(screen.getByText("FOOT")).toBeInTheDocument();
    expect(screen.getByText("META")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "From Security Reviewer" })).toBeInTheDocument();
  });

  it("renders none of the optional slots by default", () => {
    renderWithIntl(<VerdictBanner verdict="comment" summary={null} score={null} findingsCount={0} blockers={0} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("PR SCORE")).toBeNull();
  });
});
