const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export interface Quiz {
  id?: string;
  title: string;
  description: string;
  type: 'classic' | 'jeopardy';
  settings: QuizSettings;
  questions: Question[];
  created_at?: string;
  updated_at?: string;
  questions_count: number;
}

export interface QuizSettings {
  timeLimit?: number;
  randomizeQuestions?: boolean;
  showCorrectAnswers?: boolean;
  theme?: string;
}

export interface Question {
  id?: string;
  quiz_id?: string;
  category?: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'jeopardy' | 'image_based' | 'audio_based' | 'picture_choice';
  points?: number;
  order_index: number;
  answers?: Answer[];
  image_url?: string;
  audio_url?: string;
  correct_answer?: string;
}

export interface Answer {
  id?: string;
  question_id?: string;
  answer: string;
  is_correct: boolean;
  order_index: number;
  image_url?: string;
}

export interface GameSession {
  id?: string;
  quiz_id: string;
  player_name: string;
  score: number;
  started_at?: string;
  completed_at?: string;
  answers: GameAnswer[];
}

export interface GameAnswer {
  question_id: string;
  answer_id: string;
  is_correct: boolean;
  time_taken?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

class ApiService {
  private getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getAuthToken();

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log(`Making API request: ${config.method || 'GET'} ${url}`);
      const response = await fetch(url, config);
      console.log(`API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error response:`, errorText);
        console.error(`Request URL: ${url}`);
        console.error(`Request method: ${config.method}`);
        console.error(`Request headers:`, config.headers);

        // Try to parse error as JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Parsed error details:', errorJson);
        } catch {
          // Not JSON, just log the text
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
      }

      const responseText = await response.text();
      console.log(`API response:`, responseText);

      if (!responseText) {
        return {}; // Empty response
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      console.error('Request config:', config);
      throw error;
    }
  }

  // Quiz operations
  async createQuiz(quizData: Omit<Quiz, 'id' | 'questions'>): Promise<Quiz> {
    return this.request('/api/v1/quizzes', {
      method: 'POST',
      body: JSON.stringify(quizData),
    });
  }

  async getQuizzes(): Promise<Quiz[]> {
    return this.request('/api/v1/quizzes');
  }

  async deleteQuiz(quizId: string): Promise<void> {
    return this.request(`/api/v1/quizzes/${quizId}`, {
      method: 'DELETE',
    });
  }

  // Question operations
  async createQuestion(questionData: Omit<Question, 'id'>): Promise<Question> {
    return this.request('/api/v1/questions', {
      method: 'POST',
      body: JSON.stringify(questionData),
    });
  }

  async getQuestionsByQuiz(quizId: string): Promise<Question[]> {
    return this.request(`/api/v1/quizzes/${quizId}/questions`);
  }

  // Answer operations
  async createAnswer(answerData: Omit<Answer, 'id'>): Promise<Answer> {
    return this.request('/api/v1/answers', {
      method: 'POST',
      body: JSON.stringify(answerData),
    });
  }

  async getAnswersByQuestion(questionId: string): Promise<Answer[]> {
    return this.request(`/api/v1/questions/${questionId}/answers`);
  }

  // Complex save operation that handles quiz + questions + answers
  async saveCompleteQuiz(quizData: Quiz): Promise<{ quiz: Quiz; questions: Question[]; answers: Answer[] }> {
    try {
      // 1. Create the quiz
      const { questions, ...quizWithoutQuestions } = quizData;
      const createdQuiz = await this.createQuiz(quizWithoutQuestions);

      const createdQuestions: Question[] = [];
      const createdAnswers: Answer[] = [];

      // 2. Create all questions and their answers
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const questionData = {
          ...question,
          quiz_id: createdQuiz.id,
        };

        // Create the question
        const createdQuestion = await this.createQuestion(questionData);
        createdQuestions.push(createdQuestion);

        // Create answers for this question if they exist
        if (question.answers && question.answers.length > 0) {
          for (const answer of question.answers) {
            const answerData = {
              ...answer,
              question_id: createdQuestion.id,
            };
            const createdAnswer = await this.createAnswer(answerData);
            createdAnswers.push(createdAnswer);
          }
        }
      }

      return {
        quiz: createdQuiz,
        questions: createdQuestions,
        answers: createdAnswers,
      };
    } catch (error) {
      console.error('Failed to save complete quiz:', error);
      throw new Error('Failed to save quiz. Please try again.');
    }
  }

  // Authentication operations
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    return this.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async login(credentials: LoginRequest): Promise<{ access_token: string; token_type: string }> {
    const formBody = new URLSearchParams({
      username: credentials.username,
      password: credentials.password,
    }).toString();

    return this.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });
  }

  async getCurrentUser(): Promise<AuthUser> {
    return this.request('/api/v1/auth/me');
  }

  // Game session operations
  async createGameSession(sessionData: Omit<GameSession, 'id' | 'started_at'>): Promise<GameSession> {
    return this.request('/api/v1/game-sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }
}

export const api = new ApiService();
