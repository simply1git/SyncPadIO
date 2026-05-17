/**
 * Zip Download Utility
 * Provides functionality to download multiple files as a zip archive
 */

import JSZip from 'jszip';

export interface FileToDownload {
  name: string;
  url: string;
}

/**
 * Download multiple files as a zip archive
 */
export const downloadFilesAsZip = async (
  files: FileToDownload[],
  zipName: string = 'SyncPadIO-files',
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> => {
  if (files.length === 0) {
    throw new Error('No files to download');
  }

  const zip = new JSZip();
  let completed = 0;

  try {
    // Fetch all files in parallel
    const filePromises = files.map(async (file) => {
      try {
        if (signal?.aborted) throw new Error('Download cancelled');
        
        const response = await fetch(file.url, { signal });
        if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);
        
        const blob = await response.blob();
        const fileName = file.name || `file-${Date.now()}`;
        
        zip.file(fileName, blob);
        completed++;
        onProgress?.(completed, files.length);
      } catch (error) {
        if (error instanceof Error && error.message === 'Download cancelled') {
          throw error;
        }
        console.warn(`⚠️ Failed to download ${file.name}:`, error);
        // Continue with other files even if one fails
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
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Failed to create zip: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Download files sequentially with detailed progress
 * (Alternative to zip if user prefers individual downloads)
 */
export const downloadFilesSequential = async (
  files: FileToDownload[],
  onProgress?: (completed: number, total: number, currentFile: string) => void,
  signal?: AbortSignal
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

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name || `file-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onProgress?.(i + 1, files.length, file.name);

      // Small delay between downloads to avoid overwhelming the browser
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Download cancelled') {
        throw error;
      }
      console.warn(`⚠️ Failed to download ${file.name}:`, error);
      onProgress?.(i + 1, files.length, file.name);
    }
  }
};

export default {
  downloadFilesAsZip,
  downloadFilesSequential
};
