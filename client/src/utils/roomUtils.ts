import { supabase, supabaseUrl, supabaseAnonKey } from '../supabaseClient';
import { validateFile } from './helpers';
import { encryptFile } from './crypto';

interface UploadFileOptions {
  roomId: string;
  file: File;
  uploaderName?: string;
  encryptionKey?: string;
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  promise: Promise<Record<string, unknown>>;
  abort: () => void;
}

/**
 * Upload using XHR for real progress + cancellation support.
 * Performs client-side hardware-accelerated AES-256-GCM encryption prior to upload.
 * Returns { promise, abort } so callers can cancel mid-upload.
 */
export const uploadFileToRoom = ({
  roomId,
  file,
  uploaderName,
  encryptionKey,
  onProgress,
}: UploadFileOptions): UploadResult => {
  let xhr: XMLHttpRequest | null = null;
  let isAborted = false;

  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    const execute = async () => {
      const validation = validateFile(file);
      if (!validation.valid) {
        return reject(new Error(validation.error || 'Invalid file'));
      }

      if (isAborted) return reject(new Error('Upload cancelled'));

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
      // Prefix storage path with _enc_ to denote client-side E2EE encryption
      const storagePath = `${roomId}/${timestamp}_enc_${safeName}`;

      onProgress?.(3);

      try {
        // 1. Client-Side AES-256-GCM Encryption (Native Web Crypto, hardware-accelerated)
        const { encryptedBlob } = await encryptFile(file, file.name, roomId, encryptionKey);
        if (isAborted) return reject(new Error('Upload cancelled'));
        onProgress?.(8);

        // 2. Transmit raw binary ciphertext over XHR
        xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress?.(Math.round(8 + (e.loaded / e.total) * 78));
          }
        });

        xhr.addEventListener('load', async () => {
          if (!xhr) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(90);
            const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(storagePath);
            const { data: fileRecord, error: dbError } = await supabase
              .from('files')
              .insert({
                room_id: roomId,
                name: file.name,
                size: file.size,
                url: urlData.publicUrl,
                timestamp,
                storage_path: storagePath,
                uploader_name: uploaderName
              })
              .select().single();

            if (dbError) {
              await supabase.storage.from('uploads').remove([storagePath]);
              return reject(dbError);
            }
            if (import.meta.env.DEV) console.log(`[Upload E2EE] ${file.name} → ${storagePath}`);
            onProgress?.(100);
            resolve({
              ...(fileRecord as Record<string, unknown>),
              is_encrypted: true
            });
          } else {
            let msg = `Upload failed (HTTP ${xhr.status})`;
            try { msg = JSON.parse(xhr.responseText)?.message ?? msg; } catch { /* ignore */ }
            reject(new Error(msg));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', `${supabaseUrl}/storage/v1/object/uploads/${storagePath}`);
        xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.send(encryptedBlob);
      } catch (encErr) {
        reject(encErr instanceof Error ? encErr : new Error('Encryption failed prior to upload'));
      }
    };

    execute();
  });

  return {
    promise,
    abort: () => {
      isAborted = true;
      if (xhr) {
        xhr.abort();
      }
    },
  };
};

/** Delete file from storage and DB */
export const deleteFileFromRoom = async (fileId: string, storagePath: string) => {
  const { error: storageErr } = await supabase.storage.from('uploads').remove([storagePath]);
  if (storageErr) console.error('[Delete] Storage error:', storageErr);
  const { error: dbErr } = await supabase.from('files').delete().eq('id', fileId);
  if (dbErr) throw dbErr;
  if (import.meta.env.DEV) console.log(`[Delete] File deleted: ${storagePath}`);
};

/** Get all files for a room */
export const getRoomFiles = async (roomId: string) => {
  const { data, error } = await supabase
    .from('files').select('*').eq('room_id', roomId).order('timestamp', { ascending: false });
  if (error) { console.error('[Files] Error:', error); return []; }
  return data ?? [];
};
