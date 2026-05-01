import { supabase } from '../supabaseClient';

interface UploadFileOptions {
  roomId: string;
  file: File;
  onProgress?: (progress: number) => void;
}

/**
 * Upload file to Supabase Storage and record in database
 * Automatically tracks storage path for cleanup
 */
export const uploadFileToRoom = async ({
  roomId,
  file,
  onProgress,
}: UploadFileOptions) => {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }

    // Check file size (50MB limit for Supabase direct upload)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File size exceeds 50MB limit. Use WebRTC P2P for larger files.');
    }

    // Block executable files
    const executableExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const fileName = file.name.toLowerCase();
    if (executableExtensions.some(ext => fileName.endsWith(ext))) {
      throw new Error('Executable files are not allowed for security reasons');
    }

    // Generate storage path: room_id/timestamp_filename
    const timestamp = Date.now();
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100);
    const storagePath = `${roomId}/${timestamp}_${sanitizedName}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(storagePath, file, {
        cacheControl: '0',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    if (!uploadData) {
      throw new Error('Upload failed');
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(storagePath);

    const fileUrl = publicUrlData.publicUrl;

    // Record in database with storage path for cleanup
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        room_id: roomId,
        name: file.name,
        size: file.size,
        url: fileUrl,
        timestamp: timestamp,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (dbError) {
      // If database insert fails, cleanup the uploaded file
      await supabase.storage
        .from('uploads')
        .remove([storagePath]);
      throw dbError;
    }

    console.log(`[Upload] File uploaded successfully: ${file.name} (${storagePath})`);
    onProgress?.(100);

    return fileRecord;
  } catch (err) {
    console.error('[Upload] Error uploading file:', err);
    throw err;
  }
};

/**
 * Delete file from both storage and database
 */
export const deleteFileFromRoom = async (fileId: string, storagePath: string) => {
  try {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('uploads')
      .remove([storagePath]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (dbError) {
      throw dbError;
    }

    console.log(`[Delete] File deleted successfully: ${storagePath}`);
  } catch (err) {
    console.error('[Delete] Error deleting file:', err);
    throw err;
  }
};

/**
 * Get all files for a room
 */
export const getRoomFiles = async (roomId: string) => {
  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('[Files] Error fetching room files:', err);
    return [];
  }
};

/**
 * Get room info
 */
export const getRoomInfo = async (roomId: string) => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[Room] Error fetching room info:', err);
    return null;
  }
};
