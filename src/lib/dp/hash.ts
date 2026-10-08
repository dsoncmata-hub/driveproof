/** Cálculo de SHA-256 no navegador (Web Crypto). */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256OfArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(digest);
}

export async function sha256OfBlob(blob: Blob): Promise<string> {
  return sha256OfArrayBuffer(await blob.arrayBuffer());
}

export async function sha256OfString(value: string): Promise<string> {
  return sha256OfArrayBuffer(new TextEncoder().encode(value).buffer as ArrayBuffer);
}