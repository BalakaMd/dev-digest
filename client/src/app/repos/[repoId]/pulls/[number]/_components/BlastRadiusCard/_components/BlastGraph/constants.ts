/** Limits and geometry for the blast-radius graph. Everything past a cap is reported via `hidden`, never silently dropped. */

/** Most changed symbols drawn in the left column. */
export const GRAPH_MAX_SYMBOLS = 8;
/** Most callers drawn per symbol (callers shared by several symbols are one node). */
export const GRAPH_MAX_CALLERS_PER_SYMBOL = 5;
/** Most endpoint + cron nodes drawn in the right column. */
export const GRAPH_MAX_TARGETS = 10;
/** Node labels longer than this are cut with an ellipsis; the full text is in the tooltip. */
export const GRAPH_LABEL_MAX_CHARS = 16;

/** Outer padding of the drawing, px. */
export const PAD = 12;
/** Space reserved above the first row for the column headers, px. */
export const HEADER_H = 22;
/** Node box size, px. */
export const NODE_W = 120;
export const NODE_H = 28;
/** Vertical gap between two nodes of the same column, px. */
export const ROW_GAP = 10;
/** Horizontal gap between two columns (room for the edges), px. */
export const COLUMN_GAP = 40;
/** Left edge of the symbol, caller and target columns, px. */
export const COLUMN_X = [PAD, PAD + NODE_W + COLUMN_GAP, PAD + 2 * (NODE_W + COLUMN_GAP)] as const;
