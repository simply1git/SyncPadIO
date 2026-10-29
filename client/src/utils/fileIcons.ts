import { Image, Video, Music, FileText, Archive, Code, File } from 'lucide-react';

export function getFileType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext))
    return { Icon: Image, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', isImage: true, isVideo: false };
  if (['mp4','webm','mov','avi','mkv','m4v'].includes(ext))
    return { Icon: Video, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', isImage: false, isVideo: true };
  if (['mp3','wav','ogg','aac','flac','m4a'].includes(ext))
    return { Icon: Music, color: '#f472b6', bg: 'rgba(244,114,182,0.1)', isImage: false, isVideo: false };
  if (['pdf'].includes(ext))
    return { Icon: FileText, color: '#f87171', bg: 'rgba(248,113,113,0.1)', isImage: false, isVideo: false };
  if (['zip','rar','7z','tar','gz'].includes(ext))
    return { Icon: Archive, color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', isImage: false, isVideo: false };
  if (['js','ts','jsx','tsx','py','go','rs','java','c','cpp','html','css','json','sql','sh'].includes(ext))
    return { Icon: Code, color: '#34d399', bg: 'rgba(52,211,153,0.1)', isImage: false, isVideo: false };
  return { Icon: File, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', isImage: false, isVideo: false };
}

