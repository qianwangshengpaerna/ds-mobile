export type SaveResult = { cancelled?: boolean; label?: string; uri?: string };
export type ExportDirectory = { mode: "ask" | "folder"; label: string };
export type NativeFiles = {
  save: (name: string, mime: string, base64: string) => Promise<SaveResult>;
  directory: () => ExportDirectory;
  chooseDirectory: () => Promise<SaveResult>;
  resetDirectory: () => void;
};
export const nativeFiles = (): NativeFiles | undefined =>
  (window as unknown as { DSMobileFiles?: NativeFiles }).DSMobileFiles;
export async function saveBlob(name: string, blob: Blob): Promise<SaveResult> {
  const native = nativeFiles();
  if (native) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return native.save(name, blob.type || "application/octet-stream", btoa(binary));
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { label: "浏览器下载位置" };
}
