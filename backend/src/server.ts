import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import { db } from './database';
import { authService } from './auth';
import { authenticateToken } from './middleware/auth';
import { oauthHandlers } from './oauth';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize Passport
app.use(passport.initialize());

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const result = await authService.register({ email, username, password });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Login failed' });
  }
});

// Google OAuth routes
app.get('/api/auth/google', oauthHandlers.googleAuth);
app.get('/api/auth/google/callback', oauthHandlers.googleCallback, oauthHandlers.googleSuccess);
app.get('/api/auth/google/failure', oauthHandlers.googleFailure);

// Protected routes middleware
app.use('/api/quizzes', authenticateToken);
app.use('/api/questions', authenticateToken);
app.use('/api/answers', authenticateToken);
app.use('/api/game-sessions', authenticateToken);

// Quiz routes
app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await db.getQuizzes();
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

app.post('/api/quizzes', async (req, res) => {
  try {
    const quiz = await db.createQuiz(req.body);
    res.status(201).json(quiz);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

app.get('/api/quizzes/:id/questions', async (req, res) => {
  try {
    const questions = await db.getQuestionsByQuiz(req.params.id);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.post('/api/questions', async (req, res) => {
  try {
    const question = await db.createQuestion(req.body);
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create question' });
  }
});

app.get('/api/questions/:id/answers', async (req, res) => {
  try {
    const answers = await db.getAnswersByQuestion(req.params.id);
    res.json(answers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

app.post('/api/answers', async (req, res) => {
  try {
    const answer = await db.createAnswer(req.body);
    res.status(201).json(answer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create answer' });
  }
});

app.post('/api/game-sessions', async (req, res) => {
  try {
    const session = await db.createGameSession(req.body);
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create game session' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'QuizMaster Backend API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      quizzes: '/api/quizzes',
      questions: '/api/questions',
      answers: '/api/answers',
      gameSessions: '/api/game-sessions'
    }
  });
});

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get current user info (protected)
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close();
  process.exit(0);
});
