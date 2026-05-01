import express, { Request, Response } from 'express';
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

// ============================================================================
// VALIDATION & SECURITY
// ============================================================================

const ROOM_ID_REGEX = /^[A-Z0-9]{6,12}$/;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_LENGTH = 100000; // 100KB
const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

function validateRoomId(roomId: any): roomId is string {
  return typeof roomId === 'string' && ROOM_ID_REGEX.test(roomId);
}

function validateText(text: any): text is string {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_TEXT_LENGTH;
}

function validateFile(file: Express.Multer.File): string | null {
  if (!file) return 'No file provided';
  if (file.size > MAX_FILE_SIZE) return `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`;
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return 'File type not allowed';
  }
  return null;
}

// ============================================================================
// SETUP
// ============================================================================

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure Multer with validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const error = validateFile(file);
  if (error) {
    cb(new Error(error));
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' })); // Limit JSON payload

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Requests per window
  message: 'Too many requests from this IP',
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 uploads per minute per IP
  message: 'Too many uploads, please wait',
});

app.use(limiter);

// ============================================================================
// LOGGING
// ============================================================================

const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
};

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Download endpoint with security
app.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const originalName = req.query.name as string;

  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeFilename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, originalName || safeFilename, err => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// File upload endpoint
app.post('/upload', uploadLimiter, upload.single('file'), (req: Request, res: Response) => {
  try {
    const { roomId } = req.body;

    if (!validateRoomId(roomId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = {
      id: uuidv4(),
      name: req.file.originalname,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      timestamp: Date.now(),
    };

    logger.info(`File uploaded: ${req.file.originalname} to room ${roomId}`);
    res.json(fileData);
  } catch (err) {
    logger.error('Upload error', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ============================================================================
// IN-MEMORY ROOM MANAGEMENT
// ============================================================================

interface Room {
  createdAt: number;
  users: Set<string>;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

// Cleanup empty rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  rooms.forEach((room, roomId) => {
    if (room.users.size === 0 && now - room.lastActivity > maxAge) {
      rooms.delete(roomId);
      logger.info(`Cleaned up empty room: ${roomId}`);
    }
  });
}, 30 * 60 * 1000);

// ============================================================================
// SOCKET.IO
// ============================================================================

io.on('connection', socket => {
  logger.info(`Client connected: ${socket.id}`);

  socket.emit('server_info', { ip: getLocalIp() });

  // Create room
  socket.on('create_room', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms.set(roomId, {
      createdAt: Date.now(),
      users: new Set([socket.id]),
      lastActivity: Date.now(),
    });

    socket.join(roomId);
    socket.emit('room_created', roomId);
    logger.info(`Room created: ${roomId}`);
  });

  // Join room
  socket.on('join_room', (roomId: string) => {
    if (!validateRoomId(roomId)) {
      socket.emit('error', 'Invalid room ID format');
      return;
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        createdAt: Date.now(),
        users: new Set([socket.id]),
        lastActivity: Date.now(),
      });
    }

    const room = rooms.get(roomId)!;
    room.users.add(socket.id);
    room.lastActivity = Date.now();

    socket.join(roomId);
    socket.emit('room_joined', roomId);
    io.to(roomId).emit('user_count', room.users.size);

    logger.info(`User ${socket.id} joined room ${roomId} (${room.users.size} users)`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    rooms.forEach(room => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        room.lastActivity = Date.now();
      }
    });

    logger.info(`Client disconnected: ${socket.id}`);
  });

  // Error handling
  socket.on('error', (error: any) => {
    logger.error(`Socket error for ${socket.id}`, error);
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error('Unhandled error', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }

  if (err.message.includes('File type')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Local IP: ${getLocalIp()}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
