/* download.ts — turn the base64 zip the install endpoint returns into a file download. */

/** Decode base64 into a Blob of the given type. Throws on malformed input. */
export function base64ToBlob(base64: string, type = "application/zip"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Save a Blob under `filename` through a temporary object URL (revoked right after). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBase64Zip(base64: string, filename: string): void {
  downloadBlob(base64ToBlob(base64), filename);
}
