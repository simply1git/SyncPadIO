# TextShare - API Reference & Quick Start

## 🔧 Custom Hooks

### `useRoom(myUserId: string)`

Main hook for managing room state and operations.

```typescript
const {
  // State
  roomId: string,
  isConnected: boolean,
  isJoined: boolean,
  userCount: number,
  snippets: Snippet[],
  files: FileData[],
  status: string,
  error: string | null,
  
  // Methods
  joinRoom(cleanId: string): Promise<void>,
  addSnippet(text: string): Promise<void>,
  deleteSnippet(snippetId: string): Promise<void>,
  addFile(fileData: FileData): Promise<void>,
  clearError(): void,
  cleanup(): Promise<void>,
} = useRoom(myUserId);
```

**Example:**
```typescript
function MyComponent() {
  const { roomId, snippets, joinRoom, addSnippet } = useRoom('user-123');

  const handleJoin = () => {
    joinRoom('ABC123');
  };

  const handleAdd = async (text: string) => {
    try {
      await addSnippet(text);
    } catch (err) {
      console.error('Failed to add');
    }
  };

  return (
    <div>
      <p>Room: {roomId}</p>
      <p>Snippets: {snippets.length}</p>
      <button onClick={handleJoin}>Join</button>
    </div>
  );
}
```

---

### `useToast()`

Toast notification system.

```typescript
const {
  toasts: Toast[],
  add(msg, type, duration): string,
  remove(id): void,
  success(msg): void,
  error(msg): void,
  info(msg): void,
  warning(msg): void,
} = useToast();
```

**Example:**
```typescript
function MyComponent() {
  const { toasts, remove, success, error } = useToast();

  const handleCopy = async () => {
    try {
      await copyToClipboard(text);
      success('Copied to clipboard!');
    } catch {
      error('Failed to copy');
    }
  };

  return (
    <>
      <button onClick={handleCopy}>Copy</button>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}
```

---

### `useUndoRedo<T>(initialValue: T)`

Undo/Redo functionality.

```typescript
const {
  value: T,
  set(newValue: T): void,
  undo(): void,
  redo(): void,
  canUndo: boolean,
  canRedo: boolean,
} = useUndoRedo('');
```

**Example:**
```typescript
function Editor() {
  const { value, set, undo, redo, canUndo, canRedo } = useUndoRedo('');

  return (
    <>
      <textarea value={value} onChange={e => set(e.target.value)} />
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </>
  );
}
```

---

## 🎨 Components

### `<MobileAccess roomId={string} onCopy={function} showCopyFeedback={boolean} />`

QR code and mobile access section.

**Props:**
- `roomId`: The room to generate QR for
- `onCopy`: Callback when user copies link
- `showCopyFeedback`: Whether to show "Copied!" state

**Example:**
```typescript
<MobileAccess 
  roomId="ABC123"
  onCopy={() => success('Link copied!')}
  showCopyFeedback={showCopy}
/>
```

---

### `<ConnectionStatus isConnected={boolean} userCount={number} status={string} />`

Connection indicator component.

**Props:**
- `isConnected`: Whether connected to Realtime
- `userCount`: Number of users in room
- `status`: Status message (shown in tooltip)

**Example:**
```typescript
<ConnectionStatus 
  isConnected={isConnected}
  userCount={userCount}
  status="Connected to Realtime"
/>
```

---

### `<ToastContainer toasts={Toast[]} onRemove={function} />`

Toast notification display container.

**Props:**
- `toasts`: Array of toast objects
- `onRemove`: Callback to remove a toast

**Example:**
```typescript
const { toasts, remove } = useToast();

return <ToastContainer toasts={toasts} onRemove={remove} />;
```

---

## 🛠 Utility Functions

### Formatting

```typescript
// File size: "1.5 MB", "45 KB"
formatFileSize(1500000) // "1.43 MB"

// Time: "2:45:30 PM"
formatTime(Date.now()) // "2:45:30 PM"

// Date + Time: "Jan 15, 2:45 PM"
formatDateTime(Date.now()) // "Jan 15, 2:45 PM"

// Truncate text: "Long text..."
truncate("This is a very long text", 20) // "This is a very long..."

// Get language from file extension
getLanguageFromExtension("app.ts") // "typescript"
```

### Room & Validation

```typescript
// Generate 8-char room ID
generateRoomId() // "A7F2K9X1"

// Validate room ID format
isValidRoomId("ABC123") // true
isValidRoomId("abc") // false

// Validate file for upload
const error = validateFile(file);
if (error) console.error(error); // "File exceeds 50MB limit"
```

### Clipboard & Download

```typescript
// Copy to clipboard (returns Promise)
await copyToClipboard("text here") // true or false

// Download file
downloadFile("http://example.com/file.txt", "myfile.txt")
```

### Utilities

```typescript
// Debounce function
const debouncedSearch = debounce((query) => {
  search(query);
}, 500); // Wait 500ms after user stops typing
```

---

## 📦 Types

### Snippet
```typescript
interface Snippet {
  id: string;
  text: string;
  sender_id: string;
  timestamp: number;
}
```

### FileData
```typescript
interface FileData {
  id: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
}
```

### RoomState
```typescript
interface RoomState {
  roomId: string;
  isConnected: boolean;
  isJoined: boolean;
  userCount: number;
  snippets: Snippet[];
  files: FileData[];
  status: string;
  error: string | null;
}
```

### Toast
```typescript
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}
```

---

## 🔌 Quick Integration Example

```typescript
import { useRoom, useToast } from './hooks';
import { ConnectionStatus, MobileAccess, ToastContainer } from './components';
import { copyToClipboard } from './utils/helpers';

function App() {
  const myUserId = Math.random().toString(36).substring(2, 10);
  const { roomId, isConnected, userCount, snippets, joinRoom, addSnippet, error } = useRoom(myUserId);
  const { toasts, remove, success, error: showError } = useToast();
  const [showCopyFeedback, setShowCopyFeedback] = React.useState(false);

  React.useEffect(() => {
    // Auto-join room from URL
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      joinRoom(room).catch(() => showError('Failed to join room'));
    }
  }, []);

  const handleCopyLink = async () => {
    await copyToClipboard(`${window.location.origin}?room=${roomId}`);
    setShowCopyFeedback(true);
    setTimeout(() => setShowCopyFeedback(false), 2000);
    success('Link copied!');
  };

  const handleAddSnippet = async (text: string) => {
    try {
      await addSnippet(text);
      success('Snippet added!');
    } catch (err) {
      showError('Failed to add snippet');
    }
  };

  return (
    <div className="p-8">
      <ToastContainer toasts={toasts} onRemove={remove} />

      <div className="flex gap-8">
        {/* Main editor */}
        <div className="flex-1">
          <h1>TextShare - Room {roomId}</h1>
          <button onClick={() => handleAddSnippet("Test snippet")}>
            Add Snippet
          </button>
          <div>
            {snippets.map(s => (
              <p key={s.id}>{s.text}</p>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 space-y-4">
          <ConnectionStatus 
            isConnected={isConnected}
            userCount={userCount}
            status={error || 'Connected'}
          />
          <MobileAccess 
            roomId={roomId}
            onCopy={handleCopyLink}
            showCopyFeedback={showCopyFeedback}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
```

---

## 🚀 Best Practices

1. **Error Handling**
   ```typescript
   try {
     await addSnippet(text);
     success('Added!');
   } catch (err) {
     error('Failed: ' + (err instanceof Error ? err.message : 'Unknown'));
   }
   ```

2. **Loading States**
   ```typescript
   const [isLoading, setIsLoading] = useState(false);

   const handleAction = async () => {
     setIsLoading(true);
     try {
       await someAsyncAction();
     } finally {
       setIsLoading(false);
     }
   };
   ```

3. **Cleanup**
   ```typescript
   useEffect(() => {
     return () => {
       cleanup(); // From useRoom
     };
   }, []);
   ```

4. **Validation**
   ```typescript
   const error = validateFile(file);
   if (error) {
     showError(error);
     return;
   }
   ```

---

**Happy coding! 🎉**
