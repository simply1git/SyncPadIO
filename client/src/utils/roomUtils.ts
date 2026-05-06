import { supabase, supabaseUrl, supabaseAnonKey } from '../supabaseClient';

interface UploadFileOptions {
  roomId: string;
  file: File;
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  promise: Promise<Record<string, unknown>>;
  abort: () => void;
}

const BLOCKED_EXTS = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Upload using XHR for real progress + cancellation support.
 * Returns { promise, abort } so callers can cancel mid-upload.
 */
export const uploadFileToRoom = ({
  roomId, file, onProgress,
}: UploadFileOptions): UploadResult => {
  let xhr: XMLHttpRequest;

  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));
    if (file.size > MAX_FILE_SIZE)
      return reject(new Error('File exceeds 50 MB limit.'));
    const ext = file.name.toLowerCase();
    if (BLOCKED_EXTS.some(e => ext.endsWith(e)))
      return reject(new Error('Executable files are not allowed.'));

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const storagePath = `${roomId}/${timestamp}_${safeName}`;

    onProgress?.(5);

    xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable)
        onProgress?.(Math.round(5 + (e.loaded / e.total) * 80));
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(87);
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(storagePath);
        const { data: fileRecord, error: dbError } = await supabase
          .from('files')
          .insert({ room_id: roomId, name: file.name, size: file.size, url: urlData.publicUrl, timestamp, storage_path: storagePath })
          .select().single();
        if (dbError) {
          await supabase.storage.from('uploads').remove([storagePath]);
          return reject(dbError);
        }
        console.log(`[Upload] ${file.name} → ${storagePath}`);
        onProgress?.(100);
        resolve(fileRecord as Record<string, unknown>);
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
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.send(file);
  });

  return {
    promise,
    abort: () => xhr?.abort(),
  };
};

/** Delete file from storage and DB */
export const deleteFileFromRoom = async (fileId: string, storagePath: string) => {
  const { error: storageErr } = await supabase.storage.from('uploads').remove([storagePath]);
  if (storageErr) console.error('[Delete] Storage error:', storageErr);
  const { error: dbErr } = await supabase.from('files').delete().eq('id', fileId);
  if (dbErr) throw dbErr;
  console.log(`[Delete] File deleted: ${storagePath}`);
};

/** Get all files for a room */
export const getRoomFiles = async (roomId: string) => {
  const { data, error } = await supabase
    .from('files').select('*').eq('room_id', roomId).order('timestamp', { ascending: false });
  if (error) { console.error('[Files] Error:', error); return []; }
  return data ?? [];
};
