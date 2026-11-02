/**
 * High-Performance Origin Private File System (OPFS) Storage Adapter
 * Enables direct disk-streaming file transfers without storing multi-gigabyte blobs in RAM
 */

export interface P2PStreamWriter {
  write(chunk: ArrayBuffer): Promise<void>;
  finish(): Promise<Blob | File>;
  abort(): Promise<void>;
}

class OPFSStreamWriter implements P2PStreamWriter {
  private fileHandle: FileSystemFileHandle;
  private writable: FileSystemWritableFileStream;
  private mimeType: string;
  private fileName: string;

  constructor(
    fileHandle: FileSystemFileHandle,
    writable: FileSystemWritableFileStream,
    fileName: string,
    mimeType: string
  ) {
    this.fileHandle = fileHandle;
    this.writable = writable;
    this.fileName = fileName;
    this.mimeType = mimeType;
  }

  public async write(chunk: ArrayBuffer): Promise<void> {
    await this.writable.write(chunk);
  }

  public async finish(): Promise<Blob | File> {
    await this.writable.close();
    const rawFile = await this.fileHandle.getFile();
    // Return a File instance with original name and MIME type
    return new File([rawFile], this.fileName, {
      type: this.mimeType || rawFile.type || 'application/octet-stream',
      lastModified: Date.now(),
    });
  }

  public async abort(): Promise<void> {
    try {
      await this.writable.abort();
    } catch {
      // Ignored
    }
  }
}

class MemoryStreamWriter implements P2PStreamWriter {
  private chunks: ArrayBuffer[] = [];
  private mimeType: string;
  private fileName: string;

  constructor(fileName: string, mimeType: string) {
    this.fileName = fileName;
    this.mimeType = mimeType;
  }

  public async write(chunk: ArrayBuffer): Promise<void> {
    this.chunks.push(chunk);
  }

  public async finish(): Promise<Blob | File> {
    const blob = new Blob(this.chunks, { type: this.mimeType || 'application/octet-stream' });
    this.chunks = [];
    return new File([blob], this.fileName, {
      type: this.mimeType || 'application/octet-stream',
      lastModified: Date.now(),
    });
  }

  public async abort(): Promise<void> {
    this.chunks = [];
  }
}

/**
 * Creates an optimal stream writer:
 * Prefers OPFS (Origin Private File System) for zero-memory disk streaming;
 * falls back seamlessly to memory-buffer streaming if OPFS is unsupported.
 */
export async function createP2PStreamWriter(
  transferId: string,
  fileName: string,
  mimeType: string
): Promise<P2PStreamWriter> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      // Clean safe name for OPFS handle
      const safeId = `sp_${transferId.replace(/[^a-zA-Z0-9_-]/g, '_')}.tmp`;
      const fileHandle = await root.getFileHandle(safeId, { create: true });
      if (typeof fileHandle.createWritable === 'function') {
        const writable = await fileHandle.createWritable();
        return new OPFSStreamWriter(fileHandle, writable, fileName, mimeType);
      }
    } catch (e) {
      console.warn('[OPFS Storage Fallback to RAM]', e);
    }
  }

  // Memory buffer fallback
  return new MemoryStreamWriter(fileName, mimeType);
}

/**
 * Removes temporary OPFS file when a transfer is cleared
 */
export async function cleanupOPFSFile(transferId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      const safeId = `sp_${transferId.replace(/[^a-zA-Z0-9_-]/g, '_')}.tmp`;
      await root.removeEntry(safeId);
    } catch {
      // Ignored if file doesn't exist
    }
  }
}
