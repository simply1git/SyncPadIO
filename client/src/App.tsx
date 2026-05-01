import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Share2, Wifi, WifiOff, Smartphone, Monitor, FileText, Upload, Download, File, Moon, Sun, Code, Users, History, X, Clock, Eye, Bold, Italic } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

const APP_VERSION = '2.0.0-supabase';

interface FileData {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
}

interface Snippet {
  id: string;
  text: string;
  sender_id: string;
  timestamp: number;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

function App() {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [text, setText] = useState<string>(''); // For the current input
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [files, setFiles] = useState<FileData[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'files'>('text');
  const [isUploading, setIsUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [viewCode] = useState(false);
  const [language, setLanguage] = useState('typescript');
  
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const lastSavedRef = useRef('');

  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [status, setStatus] = useState<string>('Ready');
  const [joinInput, setJoinInput] = useState('');
  const [myUserId] = useState(() => Math.random().toString(36).substring(2, 10));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinInput(roomParam.trim().toUpperCase());
      setIsJoining(true);
    }
  }, []);

  const [showToast, setShowToast] = useState(false);
  const [viewPreview, setViewPreview] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);
  
  const joinRoomRealtime = async (cleanId: string) => {
    setRoomId(cleanId);
    setStatus('Joining room...');
    
    if (channel) {
      await supabase.removeChannel(channel);
    }

    const { data: initialSnippets, error: snippetError } = await supabase
      .from('snippets')
      .select('*')
      .eq('room_id', cleanId)
      .order('timestamp', { ascending: true });
      
    if (!snippetError && initialSnippets) {
      setSnippets(initialSnippets as Snippet[]);
    }

    const { data: initialFiles, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('room_id', cleanId)
      .order('timestamp', { ascending: true });
      
    if (!fileError && initialFiles) {
      setFiles(initialFiles as FileData[]);
    }

    const newChannel = supabase.channel(`room:${cleanId}`);

    newChannel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (payload) => {
          setSnippets(prev => [...prev, payload.new as Snippet]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'snippets', filter: `room_id=eq.${cleanId}` },
        (payload) => {
          setSnippets(prev => prev.filter(s => s.id !== payload.old.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'files', filter: `room_id=eq.${cleanId}` },
        (payload) => {
          setFiles(prev => [...prev, payload.new as FileData]);
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const presenceState = newChannel.presenceState();
        const count = Object.keys(presenceState).reduce((acc, key) => acc + presenceState[key].length, 0);
        setUserCount(Math.max(1, count));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setIsJoined(true);
          setIsJoining(false);
          setStatus('Connected to Realtime');
          await newChannel.track({ user: myUserId, online_at: new Date().toISOString() });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setStatus('Disconnected from Realtime');
        }
      });

    setChannel(newChannel);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !isJoined) {
      const cleanId = roomParam.trim().toUpperCase();
      joinRoomRealtime(cleanId);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

 

  // Auto-save history
  useEffect(() => {
    if (!text || text.trim() === '') return;
    
    const timer = setTimeout(() => {
      if (text !== lastSavedRef.current) {
        setHistory(prev => {
          if (prev.length > 0 && prev[0] === text) return prev;
          return [text, ...prev].slice(0, 20);
        });
        lastSavedRef.current = text;
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [text]);

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsJoining(true);
    joinRoomRealtime(newRoomId);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinInput.trim()) {
      const cleanId = joinInput.trim().toUpperCase();
      setIsJoining(true);
      joinRoomRealtime(cleanId);
    }
  };

  const downloadQR = () => {
    const canvas = document.getElementById('qr-code') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `syncpad-qr-${roomId}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    const newText = before + prefix + selectedText + suffix + after;
    
    // Update state
    setText(newText);

    // Restore focus and cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const addSnippet = async () => {
    if (isJoined && text.trim()) {
      const snippetText = text;
      setText(''); // Optimistic clear
      const { error } = await supabase.from('snippets').insert({
        room_id: roomId,
        text: snippetText,
        sender_id: myUserId,
        timestamp: Date.now()
      });
      if (error) {
        console.error('Failed to add snippet:', error);
      }
    }
  };

  const deleteSnippet = async (snippetId: string) => {
    if (isJoined) {
      const { error } = await supabase.from('snippets').delete().eq('id', snippetId);
      if (error) {
        console.error('Failed to delete snippet:', error);
      }
    }
  };

  const deleteFile = async (fileId: string, fileUrl: string) => {
    if (!isJoined) return;
    
    try {
      // Extract the path from the public URL
      const urlParts = fileUrl.split('/uploads/');
      if (urlParts.length < 2) {
        console.error('Invalid file URL');
        return;
      }
      const filePath = urlParts[1];

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('uploads')
        .remove([filePath]);

      if (storageError) {
        console.error('Failed to delete file from storage:', storageError);
        return;
      }

      // Delete from database
      const { error: dbError } = await supabase.from('files').delete().eq('id', fileId);
      if (dbError) {
        console.error('Failed to delete file record:', dbError);
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const copySnippet = async (snippetText: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(snippetText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = snippetText;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };
  
  const uploadFile = async (file: File) => {
    if (!roomId) return;
    
    // Validation: File size limit (50MB for Supabase)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      console.error(`File too large: ${file.name} (${formatSize(file.size)} exceeds 50MB limit)`);
      return;
    }

    // Validation: File type restrictions (optional)
    const BLOCKED_TYPES = ['application/x-executable', 'application/x-msdownload', 'application/x-android-package-archive'];
    const BLOCKED_EXTENSIONS = ['exe', 'dll', 'apk', 'bat', 'cmd', 'scr'];
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    
    if (BLOCKED_TYPES.includes(file.type) || BLOCKED_EXTENSIONS.includes(fileExt)) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      console.error(`File type not allowed: ${file.name} (${fileExt})`);
      return;
    }
    
    const uploadId = Math.random().toString(36).substring(7);
    const newUploadingFile: UploadingFile = {
      id: uploadId,
      name: file.name,
      progress: 0,
      status: 'uploading'
    };
    
    setUploadingFiles(prev => [newUploadingFile, ...prev]);
    setIsUploading(true);

    try {
      const fileName = `${roomId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        const errorMsg = uploadError.message || 'Upload failed';
        console.error('Upload error:', errorMsg);
        throw new Error(errorMsg);
      }

      // Make progress fake for simplicity since supabase doesn't easily expose progress yet
      setUploadingFiles(prev => 
        prev.map(f => f.id === uploadId ? { ...f, status: 'completed', progress: 100 } : f)
      );

      const { data: publicUrlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(data.path);

      await supabase.from('files').insert({
        room_id: roomId,
        name: file.name,
        size: file.size,
        url: publicUrlData.publicUrl,
        timestamp: Date.now()
      });

      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
        if (uploadingFiles.length <= 1) setIsUploading(false);
      }, 3000);
      setActiveTab('files');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      
      console.error('Upload failed:', errorMessage);
      
      setUploadingFiles(prev => 
        prev.map(f => f.id === uploadId ? { ...f, status: 'error' } : f)
      );
      
      // Show error toast
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
        if (uploadingFiles.length <= 1) setIsUploading(false);
      }, 5000);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => uploadFile(file));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => uploadFile(file));
      e.target.value = '';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

 

  if (!isJoined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-950 rounded-2xl shadow-xl p-8 space-y-8 border border-slate-200 dark:border-slate-800">
          <div className="text-center">
            <div className="bg-blue-100 dark:bg-blue-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Share2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white">SyncPadIO</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Real-time text and file sharing for developers</p>
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded">v{APP_VERSION}</span>
              <button 
                onClick={() => window.location.reload()} 
                className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase tracking-widest hover:underline"
              >
                Force Refresh
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <button
              onClick={createRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2"
            >
              <Monitor className="w-5 h-5" />
              Start New Session
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">Or join existing</span>
              </div>
            </div>

            <form onSubmit={joinRoom} className="space-y-4">
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Enter 6-digit Code"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-center text-lg tracking-widest uppercase font-mono dark:text-white transition-colors"
                maxLength={6}
                disabled={isJoining}
              />
              <button
                type="submit"
                disabled={isJoining}
                className={`w-full font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                  isJoining 
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' 
                    : 'bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white'
                }`}
              >
                {isJoining ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    Joining Room...
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5" />
                    Join Session
                  </>
                )}
              </button>
            </form>
          </div>
          
          <div 
            className="flex items-center justify-center gap-2 text-sm text-slate-400 cursor-help"
          >
            {isConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            {status || (isConnected ? "Realtime Connected" : "Connecting...")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors relative"
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl flex flex-col items-center animate-bounce">
            <Upload className="w-16 h-16 text-blue-500 mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Drop file to upload</h2>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="bg-white dark:bg-slate-950 shadow-sm px-4 py-4 flex items-center justify-between sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent">
              SyncPadIO
              <span className="ml-1 text-[8px] font-bold text-slate-400 dark:text-slate-500 align-top opacity-50">v{APP_VERSION}</span>
            </h1>
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider ml-0.5">Room Code</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(roomId);
                    setShowToast(true);
                    setTimeout(() => setShowToast(false), 2000);
                  }}
                  className="group flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md border border-blue-100 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all shadow-sm"
                  title="Click to copy Room Code"
                >
                  <span className="text-sm font-bold font-mono tracking-widest">{roomId}</span>
                  <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
                </button>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider ml-0.5">Online</span>
                <div className="flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800 shadow-sm" title="Users Online">
                  <Users className="w-3.5 h-3.5" />
                  <span>{userCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors relative"
            title="History"
          >
            <History className="w-5 h-5" />
            {history.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-slate-900"></span>
            )}
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
           <button 
            onClick={() => {
              setRoomId('');
              setIsJoined(false);
              setJoinInput('');
            }}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 ml-2"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full p-4 gap-4">
        
        {/* Content Section (Text/Files) */}
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'text' 
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              Text
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 py-4 font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'files' 
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <File className="w-4 h-4" />
              Files ({files.length})
            </button>
          </div>

          <div className="flex-1 relative bg-slate-50/30 dark:bg-transparent overflow-hidden flex flex-col">
            {activeTab === 'text' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Composer at Top */}
              <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => insertMarkdown('**', '**')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertMarkdown('*', '*')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Italic"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertMarkdown('`', '`')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Inline Code"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase py-1 px-2 rounded-md border-none outline-none cursor-pointer"
                    >
                      <option value="typescript">TS</option>
                      <option value="javascript">JS</option>
                      <option value="python">PY</option>
                      <option value="markdown">MD</option>
                    </select>
                    <button
                      onClick={() => setViewPreview(!viewPreview)}
                      className={`p-1.5 rounded-md transition-colors ${viewPreview ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        addSnippet();
                      }
                    }}
                    placeholder="Write something... (Ctrl+Enter to share)"
                    className="w-full min-h-[80px] p-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none dark:text-slate-200"
                  />
                  <button
                    onClick={addSnippet}
                    disabled={!text.trim()}
                    className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Snippets List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
                {snippets.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 space-y-4">
                    <FileText className="w-16 h-16 opacity-20" />
                    <p className="text-sm">No snippets shared yet. Start typing below!</p>
                  </div>
                ) : (
                    [...snippets].sort((a, b) => b.timestamp - a.timestamp).map((snippet) => (
                      <div key={snippet.id} className="group relative bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-all hover:shadow-md">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800/50">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                              style={{ backgroundColor: `hsl(${snippet.sender_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360}, 70%, 50%)` }}
                            >
                              {snippet.sender_id.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                              {new Date(snippet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => copySnippet(snippet.text)}
                              className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                              title="Copy"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            {snippet.sender_id === myUserId && (
                              <button 
                                onClick={() => deleteSnippet(snippet.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                title="Delete"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="p-4">
                          {viewCode ? (
                            <SyntaxHighlighter
                              language={language}
                              style={vscDarkPlus}
                              customStyle={{ margin: 0, padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.875rem' }}
                              showLineNumbers={false}
                            >
                              {snippet.text}
                            </SyntaxHighlighter>
                          ) : viewPreview && language === 'markdown' ? (
                            <div className="prose dark:prose-invert max-w-none text-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{snippet.text}</ReactMarkdown>
                            </div>
                          ) : (
                            <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                              {snippet.text}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

              {/* Input Area (moved to top) - hidden duplicate to keep structure simple */}
              <div className="hidden p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => insertMarkdown('**', '**')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertMarkdown('*', '*')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Italic"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => insertMarkdown('`', '`')}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Inline Code"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase py-1 px-2 rounded-md border-none outline-none cursor-pointer"
                    >
                      <option value="typescript">TS</option>
                      <option value="javascript">JS</option>
                      <option value="python">PY</option>
                      <option value="markdown">MD</option>
                    </select>
                    <button
                      onClick={() => setViewPreview(!viewPreview)}
                      className={`p-1.5 rounded-md transition-colors ${viewPreview ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        addSnippet();
                      }
                    }}
                    placeholder="Write something... (Ctrl+Enter to share)"
                    className="w-full min-h-[80px] p-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none dark:text-slate-200"
                  />
                  <button
                    onClick={addSnippet}
                    disabled={!text.trim()}
                    className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )}
          
          {activeTab === 'files' && (
              <div className="p-6 h-full flex flex-col">
                {/* Upload Area */}
                <div className="mb-6 space-y-4">
                  {uploadingFiles.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Upload className="w-3 h-3" />
                        Active Uploads ({uploadingFiles.length})
                      </h4>
                      <div className="space-y-3">
                        {uploadingFiles.map(file => (
                          <div key={file.id} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[200px]">{file.name}</span>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${file.status === 'error' ? 'text-red-500' : 'text-blue-500'}`}>
                                  {file.status === 'completed' ? 'Done' : file.status === 'error' ? 'Failed' : `${file.progress}%`}
                                </span>
                                {file.status === 'uploading' && (
                                  <button
                                    onClick={() => {
                                      setUploadingFiles(prev => prev.filter(f => f.id !== file.id));
                                      if (uploadingFiles.length <= 1) setIsUploading(false);
                                    }}
                                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-0.5"
                                    title="Cancel upload"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${file.status === 'completed' ? 'bg-green-500' : file.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <label className={`
                    flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                    ${isUploading ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600' : 'bg-white dark:bg-slate-800/50 border-blue-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500'}
                  `}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className={`w-8 h-8 mb-3 ${isUploading ? 'text-slate-400 dark:text-slate-500 animate-bounce' : 'text-blue-500 dark:text-blue-400'}`} />
                      <p className="mb-1 text-sm text-slate-600 dark:text-slate-300">
                      {isUploading ? 'Uploading files...' : <span className="font-semibold">Click to upload files</span>}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">multiple files supported • up to 50MB each</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} multiple />
                </label>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto space-y-3">
                  {files.length === 0 ? (
                    <div className="text-center text-slate-400 dark:text-slate-600 mt-10">
                      <File className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No files shared yet</p>
                    </div>
                  ) : (
                    files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:shadow-sm transition-shadow">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <File className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{formatSize(file.size)} • {new Date(file.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a 
                            href={`${file.url}?download=${encodeURIComponent(file.name)}`}
                            target="_blank" 
                            rel="noreferrer"
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                          <button
                            onClick={() => deleteFile(file.id, file.url)}
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete file"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info / QR Section */}
        <div className="md:w-80 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center transition-colors">
            <h3 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-500" />
              Mobile Access
            </h3>
            
            <div className="bg-white p-3 rounded-xl border-2 border-slate-100 dark:border-slate-700 shadow-inner">
              <QRCodeCanvas 
                id="qr-code"
                value={`${window.location.origin}?room=${roomId}`}
                size={180}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "/icon.svg",
                  x: undefined,
                  y: undefined,
                  height: 24,
                  width: 24,
                  excavate: true,
                }}
              />
            </div>

            <div className="flex gap-2 w-full mt-6">
              <button
                onClick={downloadQR}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Save QR
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}?room=${roomId}`;
                  navigator.clipboard.writeText(url);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 2000);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
            </div>
            
            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
              Scan to instantly join this session
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Pro Tip
            </h3>
            <p className="text-sm text-blue-100 mb-4">
              Open SyncPadIO on your phone to use it as a remote clipboard or to transfer files from your camera roll.
            </p>
            <div className="flex items-center gap-2 text-xs text-blue-200 bg-white/10 p-2 rounded-lg">
              <Wifi className="w-3 h-3" />
              <span>Devices must be on same Wi-Fi for local mode</span>
            </div>
          </div>
        </div>
      </main>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-fade-in-up z-50">
          <Copy className="w-4 h-4" />
          <span className="font-medium">Copied to clipboard!</span>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-blue-500" />
                Clipboard History
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No history yet</p>
                </div>
              ) : (
                history.map((item, i) => (
                  <div key={i} className="group bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer" onClick={() => { setText(item); setShowHistory(false); }}>
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 font-mono break-all">{item}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>{item.length} chars</span>
                      <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">Restore</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
