import { supabase, supabaseUrl, supabaseAnonKey } from '../supabaseClient';

interface UploadFileOptions {
  roomId: string;
  file: File;
  onProgress?: (progress: number) => void;
}

const BLOCKED_EXTS = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Upload a file using XHR (for real progress events) then record in DB.
 * Progress: 0-85% = storage upload, 85-100% = DB insert.
 */
export const uploadFileToRoom = ({
  roomId,
  file,
  onProgress,
}: UploadFileOptions): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided'));

    if (file.size > MAX_FILE_SIZE)
      return reject(new Error('File exceeds 50 MB. Use WebRTC P2P for larger files.'));

    const ext = file.name.toLowerCase();
    if (BLOCKED_EXTS.some(e => ext.endsWith(e)))
      return reject(new Error('Executable files are not allowed.'));

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const storagePath = `${roomId}/${timestamp}_${safeName}`;

    onProgress?.(5);

    // ── XHR upload for real progress tracking ──────────────────────────────
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Map 0-100% upload → 5-85% total progress
        const pct = Math.round(5 + (e.loaded / e.total) * 80);
        onProgress?.(pct);
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(87);
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('uploads')
          .getPublicUrl(storagePath);

        // DB insert
        const { data: fileRecord, error: dbError } = await supabase
          .from('files')
          .insert({
            room_id: roomId,
            name: file.name,
            size: file.size,
            url: urlData.publicUrl,
            timestamp,
            storage_path: storagePath,
          })
          .select()
          .single();

        if (dbError) {
          // Rollback storage on DB failure
          await supabase.storage.from('uploads').remove([storagePath]);
          return reject(dbError);
        }

        console.log(`[Upload] File uploaded successfully: ${file.name} (${storagePath})`);
        onProgress?.(100);
        resolve(fileRecord as Record<string, unknown>);
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.message ?? msg; } catch { /* ignore */ }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    // Supabase Storage REST: POST /storage/v1/object/{bucket}/{path}
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/uploads/${storagePath}`);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.send(file);
  });
};

/** Delete file from storage and DB */
export const deleteFileFromRoom = async (fileId: string, storagePath: string) => {
  const { error: storageErr } = await supabase.storage.from('uploads').remove([storagePath]);
  if (storageErr) console.error('[Delete] Storage error:', storageErr);

  const { error: dbErr } = await supabase.from('files').delete().eq('id', fileId);
  if (dbErr) throw dbErr;

  console.log(`[Delete] File deleted successfully: ${storagePath}`);
};

/** Get all files for a room */
export const getRoomFiles = async (roomId: string) => {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('room_id', roomId)
    .order('timestamp', { ascending: false });
  if (error) { console.error('[Files] Error fetching files:', error); return []; }
  return data ?? [];
};
