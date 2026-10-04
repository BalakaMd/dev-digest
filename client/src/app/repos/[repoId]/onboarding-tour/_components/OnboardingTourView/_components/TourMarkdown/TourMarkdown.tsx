import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TourLanguage } from "@devdigest/shared";
import { textDirection } from "../TourText";
import { s } from "./styles";

/**
 * Renders model-written markdown. Unlike the shared `Markdown`, raw HTML is
 * dropped (`skipHtml`) and links render as plain text — generated content must
 * never produce a clickable URL (AC-14, NFR-2). Inline code is LTR-isolated.
 */
export function TourMarkdown({ children, language }: { children?: string | null; language: TourLanguage }) {
  if (!children) return null;
  return (
    <div dir={textDirection(language)} style={s.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p style={s.p}>{children}</p>,
          strong: ({ children }) => <strong style={s.strong}>{children}</strong>,
          code: ({ children }) => (
            <code className="mono" dir="ltr" style={s.code}>
              {children}
            </code>
          ),
          a: ({ children }) => <span>{children}</span>,
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
