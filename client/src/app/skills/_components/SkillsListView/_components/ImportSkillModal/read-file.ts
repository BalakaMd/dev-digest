/**
 * Read a File as base64 for `POST /skills/import`, without the data-URL prefix.
 * The server decodes and parses in memory; it never writes the bytes anywhere.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** Extensions the import accepts (the server enforces the same list). */
export const IMPORT_ACCEPT = ".md,.markdown,.zip";
