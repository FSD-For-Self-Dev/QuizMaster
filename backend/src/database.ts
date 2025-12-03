import sqlite3 from 'sqlite3';

export interface Quiz {
  id: string;
  title: string;
  description: string;
  type: 'classic' | 'jeopardy';
  created_at: string;
  updated_at: string;
  settings: QuizSettings;
  questions_count: number;
}

export interface QuizSettings {
  timeLimit?: number; // seconds per question
  randomizeQuestions?: boolean;
  showCorrectAnswers?: boolean;
  theme?: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  category?: string; // for jeopardy
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'jeopardy';
  points?: number; // for jeopardy
  order_index: number;
  media_url?: string;
  media_type?: 'image' | 'audio' | 'video';
  created_at: string;
}

export interface Answer {
  id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  order_index: number;
  media_url?: string;
  media_type?: 'image';
}

export interface GameSession {
  id: string;
  quiz_id: string;
  player_name: string;
  score: number;
  started_at: string;
  completed_at?: string;
  answers: GameAnswer[];
}

export interface GameAnswer {
  question_id: string;
  answer_id: string;
  is_correct: boolean;
  time_taken?: number; // seconds
}

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash?: string; // Optional for OAuth users
  provider?: 'local' | 'google'; // OAuth provider
  provider_id?: string; // OAuth provider user ID
  avatar_url?: string; // Profile picture from OAuth provider
  created_at: string;
  updated_at: string;
}

class Database {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database('./quizmaster.db', (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT,
        password_hash TEXT,
        provider TEXT DEFAULT 'local',
        provider_id TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK(type IN ('classic', 'jeopardy')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settings TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        category TEXT,
        question TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('multiple_choice', 'true_false', 'short_answer', 'jeopardy')),
        points INTEGER,
        order_index INTEGER NOT NULL,
        media_url TEXT,
        media_type TEXT CHECK(media_type IN ('image', 'audio', 'video', NULL)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS answers (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL DEFAULT 0,
        order_index INTEGER NOT NULL,
        media_url TEXT,
        media_type TEXT CHECK(media_type IN ('image', NULL)),
        FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        answers TEXT,
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
      )`
    ];

    tables.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) {
          console.error('Error creating table:', err.message);
        }
      });
    });
  }

  // Quiz operations
  async createQuiz(quiz: Omit<Quiz, 'id' | 'created_at' | 'updated_at'>): Promise<Quiz> {
    const id = this.generateId();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO quizzes (id, title, description, type, created_at, updated_at, settings)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const settings = JSON.stringify(quiz.settings);

      this.db.run(sql, [id, quiz.title, quiz.description, quiz.type, now, now, settings], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...quiz,
            id,
            created_at: now,
            updated_at: now
          });
        }
      });
    });
  }

  async getQuizzes(): Promise<Quiz[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM quizzes ORDER BY updated_at DESC', [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const quizzes = rows.map((row: any) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            type: row.type,
            created_at: row.created_at,
            updated_at: row.updated_at,
            settings: JSON.parse(row.settings || '{}')
          } as Quiz));
          resolve(quizzes);
        }
      });
    });
  }

  // Question operations
  async createQuestion(question: Omit<Question, 'id' | 'created_at'>): Promise<Question> {
    const id = this.generateId();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO questions (id, quiz_id, category, question, type, points, order_index, media_url, media_type, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [id, question.quiz_id, question.category, question.question,
                       question.type, question.points, question.order_index, question.media_url, question.media_type, now], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...question,
            id,
            created_at: now
          });
        }
      });
    });
  }

  async getQuestionsByQuiz(quizId: string): Promise<Question[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index', [quizId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as Question[]);
        }
      });
    });
  }

  // Answer operations
  async createAnswer(answer: Omit<Answer, 'id'>): Promise<Answer> {
    const id = this.generateId();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO answers (id, question_id, answer, is_correct, order_index, media_url, media_type)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [id, answer.question_id, answer.answer, answer.is_correct ? 1 : 0, answer.order_index, answer.media_url, answer.media_type], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...answer,
            id
          });
        }
      });
    });
  }

  async getAnswersByQuestion(questionId: string): Promise<Answer[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM answers WHERE question_id = ? ORDER BY order_index', [questionId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map((row: any) => ({
            id: row.id,
            question_id: row.question_id,
            answer: row.answer,
            is_correct: Boolean(row.is_correct),
            order_index: row.order_index
          } as Answer)));
        }
      });
    });
  }

  // User operations
  async createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const id = this.generateId();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [id, user.email, user.username, user.password_hash, now, now], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...user,
            id,
            created_at: now,
            updated_at: now
          });
        }
      });
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as User || null);
        }
      });
    });
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as User || null);
        }
      });
    });
  }

  async findUserByProvider(provider: string, providerId: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE provider = ? AND provider_id = ?', [provider, providerId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as User || null);
        }
      });
    });
  }

  async createOAuthUser(userData: Omit<User, 'id' | 'created_at' | 'updated_at' | 'password_hash'>): Promise<User> {
    const id = this.generateId();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO users (id, email, username, provider, provider_id, avatar_url, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

      this.db.run(sql, [id, userData.email, userData.username, userData.provider, userData.provider_id, userData.avatar_url, now, now], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...userData,
            id,
            created_at: now,
            updated_at: now
          });
        }
      });
    });
  }

  // Game session operations
  async createGameSession(session: Omit<GameSession, 'id' | 'started_at'>): Promise<GameSession> {
    const id = this.generateId();
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO game_sessions (id, quiz_id, player_name, score, started_at, answers)
                   VALUES (?, ?, ?, ?, ?, ?)`;
      const answers = JSON.stringify(session.answers);

      this.db.run(sql, [id, session.quiz_id, session.player_name, session.score, now, answers], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            ...session,
            id,
            started_at: now
          });
        }
      });
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  close(): void {
    this.db.close();
  }
}

export const db = new Database();
