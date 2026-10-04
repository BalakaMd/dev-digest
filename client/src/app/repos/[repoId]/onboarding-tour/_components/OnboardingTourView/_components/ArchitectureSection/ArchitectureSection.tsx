import React from "react";
import type { TourArchitecture, TourLanguage } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { TourMarkdown } from "../TourMarkdown";

/** Architecture body: markdown overview plus the optional diagram (renders nothing if unparseable). */
export function ArchitectureSection({
  architecture,
  language,
}: {
  architecture: TourArchitecture;
  language: TourLanguage;
}) {
  return (
    <>
      <TourMarkdown language={language}>{architecture.markdown}</TourMarkdown>
      {architecture.diagram ? <MermaidDiagram chart={architecture.diagram} /> : null}
    </>
  );
}
