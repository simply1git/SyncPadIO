import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Share2, Wifi, WifiOff, Smartphone, Monitor, FileText, Upload, Download, File, Moon, Sun, Code, Users, History, X, Clock, Eye, EyeOff, Bold, Italic, List, Link as LinkIcon, Save } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// In production, this should point to your deployed server URL
// For local development (offline mode), it defaults to window.location.hostname
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

interface FileData {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'files'>('text');
  const [isUploading, setIsUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [viewCode, setViewCode] = useState(false);
  const [language, setLanguage] = useState('typescript');
  
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const lastSavedRef = useRef('');

  const [isJoined, setIsJoined] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [joinInput, setJoinInput] = useState('');
  const [localIp, setLocalIp] = useState<string>('');
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
  
  // Debounce text updates to avoid flooding the server
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setStatus('Connected to server');

      // Auto-join from URL
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        const cleanId = roomParam.trim().toUpperCase();
        newSocket.emit('join_room', cleanId);
        setRoomId(cleanId);
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setStatus('Disconnected');
    });

    newSocket.on('server_info', (data: { ip: string }) => {
      setLocalIp(data.ip);
    });

    newSocket.on('room_created', (id: string) => {
      setRoomId(id);
      setIsJoined(true);
      setStatus(`Room created: ${id}`);
    });

    newSocket.on('init_text', (initialText: string) => {
      setText(initialText);
      setIsJoined(true);
      setStatus('Joined room successfully');
    });

    newSocket.on('init_files', (initialFiles: FileData[]) => {
      setFiles(initialFiles);
    });

    newSocket.on('user_count', (count: number) => {
      setUserCount(count);
    });

    newSocket.on('text_updated', (newText: string) => {
      setText(newText);
    });

    newSocket.on('file_uploaded', (file: FileData) => {
      setFiles(prev => [...prev, file]);
      // Optional: switch to files tab or show notification
    });

    newSocket.on('error', (msg: string) => {
      alert(msg);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
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
    if (socket) {
      socket.emit('create_room');
    }
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && joinInput.trim()) {
      // Clean up input: remove spaces, uppercase
      const cleanId = joinInput.trim().toUpperCase();
      socket.emit('join_room', cleanId);
      setRoomId(cleanId);
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
    
    // Update state and trigger socket
    setText(newText);
    
    // Debounce emission
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (socket && isJoined) {
        socket.emit('update_text', { roomId, text: newText });
      }
    }, 100);

    // Restore focus and cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const downloadText = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `textshare-${roomId || 'draft'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);

    // Debounce emission
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(() => {
      if (socket && isJoined) {
        socket.emit('update_text', { roomId, text: newText });
      }
    }, 100); // 100ms delay
  };

  const uploadFile = async (file: File) => {
    if (!roomId) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', roomId);

    try {
      const uploadUrl = SERVER_URL.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${uploadUrl}/upload`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      setActiveTab('files');
    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
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

  const copyToClipboard = async () => {
    try {
      // Try modern API first (works on localhost/HTTPS)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for HTTP LAN access
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
          return;
        }
        document.body.removeChild(textArea);
      }
      
      // Show feedback
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
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
              />
              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Smartphone className="w-5 h-5" />
                Join Session
              </button>
            </form>
          </div>
          
          <div 
            className="flex items-center justify-center gap-2 text-sm text-slate-400 cursor-help"
            title={`Server: ${SERVER_URL}`}
          >
            {isConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            {status || (isConnected ? "Server Connected" : "Connecting...")}
          </div>
          
          {(window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (SERVER_URL.includes('localhost') || SERVER_URL.includes('127.0.0.1'))) && (
            <div className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-900/30">
              ⚠️ <b>Configuration Error</b><br/>
              App is running in production but trying to connect to localhost.<br/>
              Please set <code>VITE_SERVER_URL</code> in your Vercel project settings.
            </div>
          )}
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
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {roomId}
              </span>
              <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-md border border-slate-100 dark:border-slate-800" title="Users Online">
                <Users className="w-3 h-3" />
                <span>{userCount}</span>
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

          <div className="flex-1 relative bg-slate-50/30 dark:bg-transparent">
            {activeTab === 'text' && (
            <div className="flex-1 flex flex-col h-full">
              {/* Toolbar */}
              <div className="flex items-center justify-between p-2 px-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm">
                <div className="flex items-center gap-1">
                  {!viewPreview && !viewCode && (
                    <>
                      <button
                        onClick={() => insertMarkdown('**', '**')}
                        className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Bold"
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => insertMarkdown('*', '*')}
                        className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Italic"
                      >
                        <Italic className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => insertMarkdown('- ')}
                        className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="List"
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => insertMarkdown('[', '](url)')}
                        className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-2"></div>
                    </>
                  )}
                  <button
                    onClick={downloadText}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Download as File"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium py-2 px-3 rounded-lg border-none outline-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors appearance-none pr-8"
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="json">JSON</option>
                      <option value="html">HTML</option>
                      <option value="css">CSS</option>
                      <option value="markdown">Markdown</option>
                      <option value="bash">Bash</option>
                    </select>
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                  {language === 'markdown' && (
                    <button
                      onClick={() => setViewPreview(!viewPreview)}
                      className={`p-2 rounded-lg transition-colors ${viewPreview ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-slate-100 text-slate-500 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-blue-400'}`}
                      title={viewPreview ? "Show Source" : "Show Preview"}
                    >
                      {viewPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => setViewCode(!viewCode)}
                    className={`p-2 rounded-lg transition-colors ${viewCode ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'bg-slate-100 text-slate-500 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-blue-400'}`}
                    title="Toggle Code View"
                  >
                    <Code className="w-4 h-4" />
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                    title="Copy Text"
                  >
                    {showToast ? <span className="text-xs font-bold text-green-600 dark:text-green-400">Copied!</span> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex-1 relative flex flex-col overflow-hidden">
                {viewPreview && language === 'markdown' ? (
                  <div className="flex-1 overflow-auto bg-white dark:bg-slate-950 p-8 prose dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                ) : viewCode ? (
                  <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[#1e1e1e] p-0">
                    <SyntaxHighlighter
                      language={language}
                      style={vscDarkPlus}
                      customStyle={{ margin: 0, height: '100%', fontSize: '1rem', lineHeight: '1.5' }}
                      showLineNumbers={true}
                      wrapLines={true}
                    >
                      {text || ' '}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleTextChange}
                    placeholder="Type or paste text here..."
                    className="flex-1 w-full p-6 resize-none focus:outline-none text-slate-700 dark:text-slate-300 bg-transparent text-lg leading-relaxed font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    spellCheck={false}
                  />
                )}
              </div>
            </div>
            )}
          
          {activeTab === 'files' && (
              <div className="p-6 h-full flex flex-col">
                {/* Upload Area */}
                <div className="mb-6">
                  <label className={`
                    flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                    ${isUploading ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600' : 'bg-white dark:bg-slate-800/50 border-blue-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500'}
                  `}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className={`w-8 h-8 mb-3 ${isUploading ? 'text-slate-400 dark:text-slate-500 animate-bounce' : 'text-blue-500 dark:text-blue-400'}`} />
                      <p className="mb-1 text-sm text-slate-600 dark:text-slate-300">
                        {isUploading ? 'Uploading...' : <span className="font-semibold">Click to upload file</span>}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">up to 50MB</p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
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
                        <a 
                          href={`${SERVER_URL}/download/${file.url.split('/').pop()}?name=${encodeURIComponent(file.name)}`}
                          target="_blank" 
                          rel="noreferrer"
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Download className="w-5 h-5" />
                        </a>
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
                value={(localIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
                  ? `http://${localIp}:${window.location.port || 5173}?room=${roomId}`
                  : `${window.location.origin}?room=${roomId}`
                } 
                size={180}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "/pwa-192x192.png",
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
                  const url = (localIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
                    ? `http://${localIp}:${window.location.port || 5173}?room=${roomId}`
                    : `${window.location.origin}?room=${roomId}`;
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
