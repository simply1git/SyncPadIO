/**
 * Zip Download Utility
 * Provides functionality to download multiple files as a zip archive
 * with client-side zero-knowledge decryption.
 */

import JSZip from 'jszip';
import { safeDecryptFile, getMimeTypeFromName } from './crypto';

export interface FileToDownload {
  name: string;
  url: string;
  storage_path?: string;
  is_encrypted?: boolean;
}

/**
 * Download multiple files as a zip archive with client-side decryption.
 */
export const downloadFilesAsZip = async (
  files: FileToDownload[],
  zipName: string = 'SyncPadIO-files',
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal,
  roomId?: string,
  encryptionKey?: string
): Promise<void> => {
  if (files.length === 0) {
    throw new Error('No files to download');
  }

  const zip = new JSZip();
  let completed = 0;

  try {
    // Fetch and decrypt all files concurrently in parallel
    const filePromises = files.map(async (file) => {
      try {
        if (signal?.aborted) throw new Error('Download cancelled');

        const response = await fetch(file.url, { signal });
        if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);

        const buf = await response.arrayBuffer();
        const mimeType = getMimeTypeFromName(file.name);
        const isEncrypted = Boolean(file.is_encrypted || file.url.includes('_enc_') || file.storage_path?.includes('_enc_'));

        const blob = roomId || isEncrypted
          ? await safeDecryptFile(buf, roomId || '', encryptionKey, mimeType)
          : new Blob([buf], { type: mimeType });

        const fileName = file.name || `file-${Date.now()}`;
        zip.file(fileName, blob);
        completed++;
        onProgress?.(completed, files.length);
      } catch (error: unknown) {
        if (
          (error instanceof Error && error.message === 'Download cancelled') ||
          (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError')
        ) {
          throw new Error('Download cancelled');
        }
        if (import.meta.env.DEV) console.warn(`Failed to process ${file.name}:`, error);
        completed++;
        onProgress?.(completed, files.length);
      }
    });

    await Promise.all(filePromises);

    // Generate zip file
    const blob = await zip.generateAsync({ type: 'blob' });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${zipName}-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  } catch (error) {
    throw new Error(`Failed to create zip: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Download files sequentially with detailed progress
 */
export const downloadFilesSequential = async (
  files: FileToDownload[],
  onProgress?: (completed: number, total: number, currentFile: string) => void,
  signal?: AbortSignal,
  roomId?: string,
  encryptionKey?: string
): Promise<void> => {
  if (files.length === 0) {
    throw new Error('No files to download');
  }

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new Error('Download cancelled');
    }

    const file = files[i];
    try {
      const response = await fetch(file.url, { signal });
      if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);

      const buf = await response.arrayBuffer();
      const mimeType = getMimeTypeFromName(file.name);
      const isEncrypted = Boolean(file.is_encrypted || file.url.includes('_enc_') || file.storage_path?.includes('_enc_'));

      const blob = roomId || isEncrypted
        ? await safeDecryptFile(buf, roomId || '', encryptionKey, mimeType)
        : new Blob([buf], { type: mimeType });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name || `file-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 15_000);

      onProgress?.(i + 1, files.length, file.name);

      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error: unknown) {
      if (
        (error instanceof Error && error.message === 'Download cancelled') ||
        (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError')
      ) {
        throw new Error('Download cancelled');
      }
      if (import.meta.env.DEV) console.warn(`Failed to download ${file.name}:`, error);
      onProgress?.(i + 1, files.length, file.name);
    }
  }
};

export default {
  downloadFilesAsZip,
  downloadFilesSequential,
};
