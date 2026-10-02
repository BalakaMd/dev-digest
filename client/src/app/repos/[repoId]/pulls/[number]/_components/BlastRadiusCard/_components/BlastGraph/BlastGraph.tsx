/* BlastGraph — picture of the blast radius: changed symbols → callers, plus the
   endpoints and crons the symbols reach. Inline SVG, derived during render. */
import { useTranslations } from "next-intl";
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import { HEADER_H, NODE_H, NODE_W, COLUMN_X, PAD } from "./constants";
import { buildBlastGraph, type GraphNodeKind } from "./graph-layout";
import { NODE_COLORS, s } from "./styles";

const COLUMN_KEYS = ["symbols", "callers", "targets"] as const;

export function BlastGraph({ data }: { data: PrBlastRadiusResponse }) {
  const t = useTranslations("blast");
  const model = buildBlastGraph(data);

  if (data.downstream.length === 0) return <p style={s.empty}>{t("graph.empty")}</p>;

  const { nodes, edges, width, height, hidden } = model;
  const hiddenTotal = hidden.symbols + hidden.callers + hidden.targets;
  const legend: GraphNodeKind[] = ["symbol", "caller", "endpoint"];
  if (nodes.some((n) => n.kind === "cron")) legend.push("cron");

  return (
    <div>
      <div style={s.scroll}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          preserveAspectRatio="xMinYMin meet"
          style={s.svg}
        >
          {COLUMN_KEYS.map((key, i) => (
            <text
              key={key}
              x={COLUMN_X[i]}
              y={PAD + HEADER_H - 8}
              fontSize={11}
              fill="var(--text-muted)"
            >
              {t(`graph.column.${key}`)}
            </text>
          ))}
          {edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.25}
              strokeDasharray={e.kind === "reach" ? "5 4" : undefined}
            />
          ))}
          {nodes.map((n) => (
            <g key={n.id}>
              <title>{n.fullLabel}</title>
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={NODE_COLORS[n.kind].fill}
                stroke={NODE_COLORS[n.kind].stroke}
              />
              <text x={n.x + 8} y={n.y + NODE_H / 2 + 4} fontSize={12} fill="var(--text-primary)">
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul style={s.legend}>
        {legend.map((kind) => (
          <li key={kind} style={s.legendItem}>
            <svg width={12} height={12} aria-hidden="true">
              <rect
                x={0.5}
                y={0.5}
                width={11}
                height={11}
                rx={3}
                fill={NODE_COLORS[kind].fill}
                stroke={NODE_COLORS[kind].stroke}
              />
            </svg>
            {t(`graph.legend.${kind}`)}
          </li>
        ))}
      </ul>
      {hiddenTotal > 0 && <p style={s.more}>{t("graph.more", { count: hiddenTotal })}</p>}
    </div>
  );
}
