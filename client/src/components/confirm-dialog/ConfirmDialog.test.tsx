import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmDialog title="Delete skill?" body="Gone for good." confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("confirms", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(h.onConfirm).toHaveBeenCalled();
    expect(h.onCancel).not.toHaveBeenCalled();
  });

  it("cancels via Cancel and via the ✕", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(h.onCancel).toHaveBeenCalledTimes(2);
    expect(h.onConfirm).not.toHaveBeenCalled();
  });
});
