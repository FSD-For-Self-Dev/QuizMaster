# Backend Configuration for QuizMaster

## HTTP 413 "Payload Too Large" Fix

The frontend is sending large quiz data with embedded media files (images/audio as base64). The server needs to be configured to handle larger request payloads.

### Express.js Configuration

Add this to your main server file (e.g., `server.js` or `index.js`):

```javascript
const express = require('express');
const app = express();

// Increase payload size limits for media-heavy quiz data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// For multipart/form-data if you switch to file uploads later
// app.use(multer({ limits: { fileSize: 10 * 1024 * 1024 } })); // 10MB per file
```

### Alternative: File Upload Instead of Base64

For better performance, consider switching to proper file uploads instead of embedding media as base64:

#### Frontend Change (api.ts):
```typescript
// Instead of embedding base64 in JSON, upload files separately
async uploadMedia(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return this.request('/api/upload', {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - let browser set it with boundary
  });
}
```

#### Backend Implementation:
```javascript
const multer = require('multer');
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Validate file types
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  // Return file URL
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));
```

### Database Considerations

If storing base64 data in database:
- Use `LONGTEXT` or `BLOB` fields for large media data
- Consider compression before storage
- Implement file cleanup for deleted quizzes

### Current Workaround

The frontend now warns about large payloads and suggests backend configuration. For immediate testing, you can:

1. Use smaller images/audio files (< 2MB images, < 5MB audio)
2. Or implement the file upload approach above
3. Or increase server limits as shown

### Recommended Server Limits

```javascript
// For a quiz app with media
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Nginx (if using reverse proxy)
client_max_body_size 50M;

// Apache
LimitRequestBody 52428800  # 50MB
```
