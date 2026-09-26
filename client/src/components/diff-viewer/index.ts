/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   generic annotation slots (e.g. Smart Diff findings). Public surface: the
   DiffViewer/FileCard components, the DiffCommentApi/FileAnnotations
   contracts, and the `lineKey` helper callers use to key their annotations. */
export { DiffViewer } from "./DiffViewer";
export { FileCard, type FileOpenCommand } from "./FileCard";
export { lineKey } from "./comments";
export type { DiffCommentApi } from "./comments";
export type { FileAnnotations } from "./annotations";
