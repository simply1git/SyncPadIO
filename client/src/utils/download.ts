/**
 * Download a file with streaming progress tracking.
 * Uses ReadableStream to read chunks and track bytes received.
 *
 * If Content-Length is missing (unknown total), onProgress receives -1
 * so the UI can show an indeterminate animation instead.
 */
export async function downloadWithProgress(
  url: string,
  fileName: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentLength = res.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  // No streaming support — fallback to blob (no progress)
  if (!res.body) {
    onProgress(-1);
    const blob = await res.blob();
    onProgress(100);
    triggerSave(blob, fileName);
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

  onProgress(100);
  triggerSave(new Blob(chunks as BlobPart[]), fileName);
}

function triggerSave(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
}
