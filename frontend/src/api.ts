const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';
const MEDIA_BASE_URL = process.env.REACT_APP_MEDIA_URL || API_BASE_URL;

export const resolveMediaUrl = (url?: string): string | undefined => {
  if (!url) return url;
  // Leave absolute URLs, blobs, and data URIs as-is
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  // For paths starting with '/', prefix with media/base URL (backend origin)
  if (url.startsWith('/')) {
    return `${MEDIA_BASE_URL}${url}`;
  }
  return url;
};

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

interface MediaResponse {
  url: string;
  type: string;
  filename: string;
  size: number;
  uploaded_at: string;
}

// Room interfaces
export interface Room {
  id: string;
  quiz_id: string;
  room_code: string;
  pin_code: string;
  host_user_id: string;
  status: 'waiting' | 'started' | 'finished';
  max_players: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id?: string;
  guest_name: string;
  guest_avatar?: string;
  is_host: boolean;
  is_spectator: boolean;
  is_active: boolean;
  joined_at: string;
  left_at?: string;
}

export interface RoomWithParticipants extends Room {
  quiz_title?: string;
  quiz_description?: string;
  quiz_type?: string;
  quiz_questions_count?: number;
  participants: RoomParticipant[];
}

export interface CreateRoomRequest {
  quiz_id: string;
  max_players: number;
}

export interface JoinRoomRequest {
  room_id: string;
  guest_name: string;
  guest_avatar?: string;
  is_host?: boolean;
}

class ApiService {
  private getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  // WebSocket connection cache
  private wsConnections: Map<string, WebSocket> = new Map();

  connectToRoomWebSocket(roomId: string): WebSocket {
    // Reuse existing connection if available
    const existingConnection = this.wsConnections.get(roomId);
    if (existingConnection && existingConnection.readyState === WebSocket.OPEN) {
      console.log('🔄 Reusing existing WebSocket connection for room:', roomId);
      return existingConnection;
    }
    
    const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/api/v1/rooms/${roomId}/ws`;
    console.log('🔗 Creating new WebSocket connection to:', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected to room:', roomId);
      };
      
      ws.onmessage = (event) => {
        console.log('📨 WebSocket message received:', event.data);
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected from room:', roomId, 'Code:', event.code, 'Reason:', event.reason);
        // Clean up connection when closed
        if (this.wsConnections.get(roomId) === ws) {
          this.wsConnections.delete(roomId);
        }
      };
      
      // Store the connection
      this.wsConnections.set(roomId, ws);
      
      return ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      throw error;
    }
  }

  disconnectFromRoomWebSocket(roomId: string): void {
    const connection = this.wsConnections.get(roomId);
    if (connection) {
      connection.close();
      this.wsConnections.delete(roomId);
      console.log('🔌 Manually disconnected WebSocket for room:', roomId);
    }
  }

  async sendWebSocketMessage(ws: WebSocket, message_type: string, message_data: any): Promise<void> {
    const message = { type: message_type, data: message_data };
    
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('???', JSON.stringify(message));
        ws.send(JSON.stringify(message));
        resolve();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify(message));
          resolve();
        }, { once: true });
        
        // Add timeout for connection attempts
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);
      } else {
        reject(new Error(`WebSocket is not in a state to send messages. State: ${ws.readyState}`));
      }
    });
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getAuthToken();

    const isFormData = options.body instanceof FormData;

    const config: RequestInit = {
      headers: {
        // Only set JSON content-type when we're not sending FormData.
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

        // Create answers for this question
        // 1) Multiple choice / others that use explicit answer options
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

        // 2) Short answer: store the correct answer as a single Answer row for consistency
        if (
          question.type === 'short_answer' &&
          question.correct_answer &&
          question.correct_answer.trim() !== ''
        ) {
          const shortAnswerData: Omit<Answer, 'id'> = {
            answer: question.correct_answer,
            is_correct: true,
            order_index: 0,
            question_id: createdQuestion.id,
          };
          const createdShortAnswer = await this.createAnswer(shortAnswerData);
          createdAnswers.push(createdShortAnswer);
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

  // Upload operations
  async uploadAudio(formData: FormData): Promise<MediaResponse> {
    return this.request('/api/v1/upload/audio', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadImage(formData: FormData): Promise<MediaResponse> {
    return this.request('/api/v1/upload/image', {
      method: 'POST',
      body: formData,
    });
  }

  // Room management methods
  async createRoom(roomData: CreateRoomRequest): Promise<Room> {
    return this.request('/api/v1/rooms/', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
  }

  async getRoomByCode(roomCode: string): Promise<RoomWithParticipants> {
    return this.request(`/api/v1/rooms/code/${roomCode}`);
  }

  async getRoom(roomId: string): Promise<RoomWithParticipants> {
    return this.request(`/api/v1/rooms/${roomId}`);
  }

  async joinRoom(joinData: JoinRoomRequest): Promise<RoomParticipant> {
    return this.request(`/api/v1/rooms/${joinData.room_id}/participants`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: joinData.room_id,
        guest_name: joinData.guest_name,
        guest_avatar: joinData.guest_avatar,
        is_host: joinData.is_host || false,
      }),
    });
  }

  async leaveRoom(participantId: string): Promise<void> {
    return this.request(`/api/v1/rooms/participants/${participantId}`, {
      method: 'DELETE',
    });
  }

  async updateRoomParticipant(participantId: string, updates: Partial<RoomParticipant>): Promise<RoomParticipant> {
    return this.request(`/api/v1/rooms/participants/${participantId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
    return this.request(`/api/v1/rooms/${roomId}/participants`);
  }

  // Cooperative Quiz WebSocket Methods
  async sendQuizStart(ws: WebSocket, roomId: string, quizData: any): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_quiz_start', {
      room_id: roomId,
      quiz_data: quizData
    });
  }

  async sendAnswerSubmit(ws: WebSocket, roomId: string, answerData: {
    question_id: string;
    answer_id: string;
    participant_id: string;
    time_taken_ms: number;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_answer_submitted', {
      room_id: roomId,
      ...answerData
    });
  }

  async sendAnswerStatusRequest(ws: WebSocket, roomId: string, questionId: string): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_answer_status_request', {
      room_id: roomId,
      question_id: questionId
    });
  }

  async sendNextQuestion(ws: WebSocket, roomId: string, questionIndex: number): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_next_question', {
      room_id: roomId,
      question_index: questionIndex
    });
  }

  async sendQuestionResults(ws: WebSocket, roomId: string, results: {
    question_id: string;
    all_answers: Array<{
      participant_id: string;
      participant_name: string;
      answer_id: string;
      is_correct: boolean;
      time_taken: number;
    }>;
    ratings: Array<{
      participant_id: string;
      participant_name: string;
      total_score: number;
      rating_change: number;
    }>;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_question_results', {
      room_id: roomId,
      ...results
    });
  }

  async sendQuizEnd(ws: WebSocket, roomId: string, finalResults: {
    participants: Array<{
      participant_id: string;
      participant_name: string;
      total_score: number;
      correct_answers: number;
      total_questions: number;
    }>;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_quiz_end', {
      room_id: roomId,
      ...finalResults
    });
  }

  async sendNewQuestion(
    ws: WebSocket,
    roomId: string,
    data: {
      question_index: number;
      time_limit: number;
    }
  ): Promise<void> {
    return this.sendWebSocketMessage(ws, 'cooperative_new_question', {
      room_id: roomId,
      ...data,
    });
  }

  // Jeopardy Mode API Methods

  async sendJeopardyStart(ws: WebSocket, roomId: string, quizData: {
    quiz_data: any;
    categories: string[];
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_start', {
      room_id: roomId,
      quiz_data: quizData.quiz_data,
      categories: quizData.categories,
    });
  }

  async sendJeopardyChooserSelected(ws: WebSocket, roomId: string, chooserData: {
    chooser_id: string;
    chooser_name: string;
    is_initial: boolean;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_chooser_selected', {
      room_id: roomId,
      ...chooserData,
    });
  }

  async sendJeopardyCategorySelected(ws: WebSocket, roomId: string, categoryData: {
    category_name: string;
    question: any;
    selected_by: string;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_category_selected', {
      room_id: roomId,
      ...categoryData,
    });
  }

  async sendJeopardyQuestionStarted(ws: WebSocket, roomId: string, questionData: {
    question: any;
    time_limit: number;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_question_started', {
      room_id: roomId,
      ...questionData,
    });
  }

  async sendJeopardyAnswerSubmit(ws: WebSocket, roomId: string, answerData: {
    question_id: string;
    answer_id: string;
    participant_id: string;
    time_taken_ms: number;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_answer_submitted', {
      room_id: roomId,
      ...answerData
    });
  }

  async sendJeopardyQuestionResults(ws: WebSocket, roomId: string, results: {
    question_id: string;
    all_answers: Array<{
      participant_id: string;
      participant_name: string;
      answer_id: string;
      is_correct: boolean;
      time_taken: number;
    }>;
    ratings: Array<{
      participant_id: string;
      participant_name: string;
      total_score: number;
      rating_change: number;
    }>;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_question_results', {
      room_id: roomId,
      ...results
    });
  }

  async sendJeopardyNextChooser(ws: WebSocket, roomId: string, winnersData: {
    winners: Array<{
      participant_id: string;
      participant_name: string;
    }>;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_next_chooser', {
      room_id: roomId,
      ...winnersData,
    });
  }

  async sendJeopardyQuizEnd(ws: WebSocket, roomId: string, finalResults: {
    participants: Array<{
      participant_id: string;
      participant_name: string;
      total_score: number;
      correct_answers: number;
      total_questions: number;
    }>;
  }): Promise<void> {
    return this.sendWebSocketMessage(ws, 'jeopardy_quiz_end', {
      room_id: roomId,
      ...finalResults,
    });
  }
}

export const api = new ApiService();
