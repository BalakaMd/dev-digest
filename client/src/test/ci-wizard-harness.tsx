/* Test harness for the Export-to-CI wizard: renders the real ExportWizard against a
   routed fetch mock, plus helpers that walk the steps the way a user does.
   Not a test file (no `.test.` suffix). The test file must itself mock
   "@/lib/repo-context" (vi.mock is per file). */
import React from "react";
import { expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import ci from "../../messages/en/ci.json";
import agents from "../../messages/en/agents.json";
import { ToastProvider } from "../lib/toast";
import { ExportWizard } from "../app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard";
import type { WizardInitial } from "../app/agents/[id]/_components/AgentEditor/_components/CiTab/constants";
import { installFetch, type Handler } from "./context-docs-fixtures";
import { CLEAN_CHECK, agentOf, previewOf } from "./ci-fixtures";

/** Debounce of the workflow check is 400 ms; waits for it stay well above that. */
export const CHECK_WAIT = { timeout: 3000 };

export const DEFAULT_ROUTES: Record<string, Handler> = {
  "GET /agents/ag1/ci/installations": [],
  "POST /agents/ag1/ci/preview": () => previewOf(),
  "POST /agents/ag1/ci/check": CLEAN_CHECK,
  "GET /agents/ag1/ci/secrets": { github_token_configured: true, openrouter_key: "set" },
};

export interface WizardRenderOptions {
  agent?: Agent;
  initial?: WizardInitial;
  routes?: Record<string, Handler>;
  onClose?: () => void;
}

export type WizardRender = RenderResult & {
  fx: ReturnType<typeof installFetch>;
  onClose: () => void;
  /** Re-renders the same tree, so a changed `@/lib/repo-context` mock value is read again. */
  rerenderWizard: () => void;
};

export function renderWizard(opts: WizardRenderOptions = {}): WizardRender {
  const onClose = opts.onClose ?? vi.fn();
  const fx = installFetch({ ...DEFAULT_ROUTES, ...(opts.routes ?? {}) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (): React.ReactElement => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ ci, agents }}>
        <ToastProvider>
          <ExportWizard agent={opts.agent ?? agentOf()} initial={opts.initial} onClose={onClose} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, fx, onClose, rerenderWizard: () => view.rerender(tree()) };
}

export const continueBtn = () => screen.getByRole("button", { name: "Continue" });

/** Target -> Preview; resolves once the generated files are listed. */
export async function toPreview() {
  await waitFor(() => expect(continueBtn()).toBeEnabled());
  fireEvent.click(continueBtn());
  await screen.findByRole("list", { name: "Files to create" });
}

/** Preview -> Configure; waits for the debounced workflow check to let the user on. */
export async function toConfigure() {
  await toPreview();
  await waitFor(() => expect(continueBtn()).toBeEnabled(), CHECK_WAIT);
  fireEvent.click(continueBtn());
  await screen.findByRole("heading", { name: "Trigger" });
}

/** Configure -> Install. */
export async function toInstall() {
  await toConfigure();
  fireEvent.click(continueBtn());
  await screen.findByRole("radio", { name: /Copy files as a zip/ });
}
