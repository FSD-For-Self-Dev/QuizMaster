# Backend 500 Error Debugging Guide

## HTTP 500 "Internal Server Error" Analysis

The frontend is receiving 500 errors, indicating backend code issues. Here's how to debug:

## Common 500 Error Causes

### 1. **Database Connection Issues**
```javascript
// Check your database connection
const db = require('./database');
db.connect((err) => {
  if (err) console.error('Database connection failed:', err);
});
```

### 2. **Missing Route Handler**
```javascript
// Ensure POST /api/quizzes route exists
app.post('/api/quizzes', async (req, res) => {
  try {
    // Quiz creation logic
  } catch (error) {
    console.error('Quiz creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### 3. **Request Body Parsing Issues**
```javascript
// Ensure body parser is configured for large payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Body size:', JSON.stringify(req.body).length);
  next();
});
```

### 4. **Database Schema Issues**
```sql
-- Ensure quiz table has correct structure
CREATE TABLE quizzes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('classic', 'jeopardy') NOT NULL,
  settings JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure questions table exists
CREATE TABLE questions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  quiz_id INT NOT NULL,
  question TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  points INT DEFAULT 10,
  order_index INT DEFAULT 0,
  correct_answer TEXT,  -- <-- This field might be missing
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);
```

### 5. **Missing correct_answer Field**

The frontend now sends `correct_answer` for short answer questions. Your database schema must include this field:

```sql
ALTER TABLE questions ADD COLUMN correct_answer TEXT;
```

### 6. **Validation Errors**
```javascript
// Add proper error handling and logging
app.post('/api/quizzes', async (req, res) => {
  try {
    console.log('Received quiz data:', {
      title: req.body.title,
      questionCount: req.body.questions?.length,
      hasCorrectAnswer: req.body.questions?.some(q => q.correct_answer)
    });

    // Validate required fields
    if (!req.body.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Your quiz creation logic here
    const quiz = await createQuiz(req.body);
    res.json(quiz);

  } catch (error) {
    console.error('Quiz creation failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
```

## Debugging Steps

### 1. **Check Server Logs**
```bash
# Start your server with detailed logging
npm start
# or
node server.js
```

### 2. **Test with Simple Data**
Try creating a quiz without media files first:
```json
{
  "title": "Test Quiz",
  "description": "Simple test",
  "type": "classic",
  "settings": { "randomizeQuestions": false },
  "questions": [{
    "question": "What is 2+2?",
    "type": "short_answer",
    "correct_answer": "4",
    "points": 10,
    "order_index": 0
  }]
}
```

### 3. **Database Connection**
```javascript
// Add connection logging
const mysql = require('mysql');
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'your_user',
  password: 'your_password',
  database: 'quizmaster'
});

connection.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to database');
});
```

### 4. **Environment Variables**
Ensure your `.env` file has correct database credentials:
```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=quizmaster
PORT=3001
```

## Quick Fixes

### If Missing `correct_answer` Column:
```sql
ALTER TABLE questions ADD COLUMN correct_answer TEXT;
```

### If Body Parser Issues:
```javascript
// At the top of your server file
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

### Enable CORS:
```javascript
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  credentials: true
}));
```

## Frontend Debugging

The frontend now logs detailed error information. Check the browser console for:
- Request URL and method
- Response status and headers
- Full error response body
- Request payload details

This will help identify exactly where the backend is failing.
