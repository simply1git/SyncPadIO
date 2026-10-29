import { safeDecryptFile, getMimeTypeFromName } from './crypto';

/**
 * Download a file with streaming progress tracking and automatic client-side decryption.
 * Uses ReadableStream to read chunks and track bytes received.
 *
 * If Content-Length is missing (unknown total), onProgress receives -1
 * so the UI can show an indeterminate animation instead.
 */
export async function downloadWithProgress(
  url: string,
  fileName: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
  roomId?: string,
  encryptionKey?: string
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentLength = res.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const mimeType = getMimeTypeFromName(fileName);

  // No streaming support — fallback to blob
  if (!res.body) {
    onProgress(-1);
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const finalBlob = roomId || url.includes('_enc_')
      ? await safeDecryptFile(buf, roomId || '', encryptionKey, mimeType)
      : blob;
    onProgress(100);
    triggerSave(finalBlob, fileName);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      reader.cancel('Download cancelled by user');
      throw new Error('Download cancelled');
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total > 0 ? Math.min(99, Math.round((received / total) * 100)) : -1);
  }

  // Combine chunks into contiguous Uint8Array buffer
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decrypt on the fly if file is encrypted
  const finalBlob = roomId || url.includes('_enc_')
    ? await safeDecryptFile(combined.buffer, roomId || '', encryptionKey, mimeType)
    : new Blob(chunks as BlobPart[], { type: mimeType });

  onProgress(100);
  triggerSave(finalBlob, fileName);
}

export function triggerSave(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
}
