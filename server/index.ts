import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Unique filename: timestamp-uuid-originalname
    const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Skip internal (non-127.0.0.1) and non-ipv4
      if ('IPv4' !== iface.family || iface.internal) {
        continue;
      }
      return iface.address;
    }
  }
  return 'localhost';
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, this should be restricted to the client URL
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// Health Check / Wake-up Endpoint
app.get('/', (req, res) => {
  res.send('SyncPadIO Server is running');
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Download endpoint
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const originalName = req.query.name as string;
  
  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeFilename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, originalName || safeFilename, (err) => {
      if (err) {
        if (!res.headersSent) {
           res.status(500).send('Error downloading file');
        }
      }
    });
  } else {
    res.status(404).send('File not found');
  }
});

// Store active rooms (in memory for now, could be Redis later)
interface Snippet {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
}

interface RoomData {
  snippets: Snippet[];
  files: Array<{
    id: string;
    name: string;
    size: number;
    url: string;
    timestamp: number;
  }>;
  users: Set<string>;
  lastUpdated: number;
}

const rooms = new Map<string, RoomData>();

// File Upload Endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const roomId = req.body.roomId;
  if (!roomId || !rooms.has(roomId)) {
    // Clean up orphan file
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Room not found' });
  }

  const fileData = {
    id: uuidv4(),
    name: req.file.originalname,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    timestamp: Date.now()
  };

  const room = rooms.get(roomId)!;
  if (!room.files) room.files = []; // Safety check
  room.files.push(fileData);
  room.lastUpdated = Date.now();

  // Broadcast to room
  io.to(roomId).emit('file_uploaded', fileData);

  res.json(fileData);
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Send server info (IP) to client
  socket.emit('server_info', { ip: getLocalIp() });

  // Create a new room
  socket.on('create_room', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms.set(roomId, {
      snippets: [],
      files: [],
      users: new Set([socket.id]),
      lastUpdated: Date.now()
    });
    
    socket.join(roomId);
    socket.emit('room_created', roomId);
    console.log(`Room created: ${roomId}`);
  });

  // Join an existing room
  socket.on('join_room', (roomId: string) => {
    if (rooms.has(roomId)) {
      socket.join(roomId);
      const room = rooms.get(roomId)!;
      room.users.add(socket.id);
      
      // Send current state
      socket.emit('init_snippets', room.snippets);
      socket.emit('init_files', room.files);
      
      io.to(roomId).emit('user_count', room.users.size);
      console.log(`User ${socket.id} joined room ${roomId}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  // Handle snippet updates
  socket.on('add_snippet', ({ roomId, text }: { roomId: string, text: string }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      const newSnippet: Snippet = {
        id: uuidv4(),
        text,
        senderId: socket.id,
        timestamp: Date.now()
      };
      room.snippets.push(newSnippet);
      room.lastUpdated = Date.now();
      io.to(roomId).emit('snippet_added', newSnippet);
    }
  });

  socket.on('update_snippet', ({ roomId, snippetId, text }: { roomId: string, snippetId: string, text: string }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      const snippet = room.snippets.find(s => s.id === snippetId);
      if (snippet) {
        snippet.text = text;
        snippet.timestamp = Date.now();
        room.lastUpdated = Date.now();
        socket.to(roomId).emit('snippet_updated', snippet);
      }
    }
  });

  socket.on('delete_snippet', ({ roomId, snippetId }: { roomId: string, snippetId: string }) => {
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      room.snippets = room.snippets.filter(s => s.id !== snippetId);
      room.lastUpdated = Date.now();
      io.to(roomId).emit('snippet_deleted', snippetId);
    }
  });

  socket.on('disconnect', () => {
    // Cleanup users from rooms
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        io.to(roomId).emit('user_count', room.users.size);
        
        if (room.users.size === 0) {
          // Optional: Clean up empty rooms after a delay
          // For now, we keep them in memory for a bit or delete immediately
          // rooms.delete(roomId); 
        }
      }
    });
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
