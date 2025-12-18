import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, Quiz, Question, resolveMediaUrl, RoomParticipant } from '../api';
import './CooperativeQuizPlayer.css';

interface CooperativeAnswer {
  participant_id: string;
  participant_name: string;
  answer_id: string;
  is_correct: boolean;
  time_taken: number;
}

interface ParticipantRating {
  participant_id: string;
  participant_name: string;
  total_score: number;
  rating_change: number;
}

interface RoundContext {
  quizRoundId: string;
  roundIndex: number;
  returnTo?: string;
}

interface CooperativeLocationState {
  quiz: Quiz;
  roomId: string;
  isHost: boolean;
  currentParticipantId?: string;
  participants: RoomParticipant[];
  roundContext?: RoundContext;
}

export const CooperativeQuizPlayer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as CooperativeLocationState;

  const { quiz, roomId, isHost, currentParticipantId, participants, roundContext } = navState;

  // Quiz state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [showResults, setShowResults] = useState(false);

  // Cooperative state
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [participantAnswers, setParticipantAnswers] = useState<
    Map<string, CooperativeAnswer>
  >(new Map());
  const [waitingForAnswers, setWaitingForAnswers] = useState<Set<string>>(
    new Set()
  );
  const [allParticipants, setAllParticipants] = useState<RoomParticipant[]>(
    participants || []
  );
  const [showQuestionResults, setShowQuestionResults] = useState(false);
  const [questionResults, setQuestionResults] = useState<{
    answers: CooperativeAnswer[];
    ratings: ParticipantRating[];
    correct_answer_text?: string | null;
  } | null>(null);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(false);

  // Rating tracking
  const [participantRatings, setParticipantRatings] = useState<
    Map<string, ParticipantRating>
  >(new Map());

  // WebSocket and refs
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Control flags
  const hasInitializedFirstQuestionRef = useRef(false);
  const hasProcessedCurrentQuestionRef = useRef(false);

  const questionsRef = useRef<Question[]>([]);
  const allParticipantsRef = useRef<RoomParticipant[]>([]);

  const QUESTION_DEFAULT_TIME = 30; // seconds, fallback

  // WebSocket: connect once per room, do NOT disconnect on unmount (room navigation)
  useEffect(() => {
    if (!roomId) {
      console.error('No room ID provided');
      return;
    }

    isMountedRef.current = true;

    const ws = api.connectToRoomWebSocket(roomId);
    wsRef.current = ws;

    const onMessage = (event: MessageEvent) => {
      if (!isMountedRef.current) return;

      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;

      try {
        const message = JSON.parse(raw);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    const onOpen = () => {
      console.log('Connected to cooperative quiz WebSocket');
    };

    const onClose = () => {
      console.log('Disconnected from cooperative quiz WebSocket');
    };

    const onError = (error: Event) => {
      console.error('WebSocket error:', error);
    };

    ws.addEventListener('message', onMessage);
    ws.addEventListener('open', onOpen);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onError);

    return () => {
      isMountedRef.current = false;

      // IMPORTANT: only remove listeners; do NOT close/disconnect here
      // because other screens in the same room may be using the same socket.
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onError);

      wsRef.current = null;
    };
  }, [roomId]);

  // Load questions
  useEffect(() => {
    if (!quiz) return;

    const loadQuestions = async () => {
      try {
        if (quiz.questions && quiz.questions.length > 0) {
          setQuestions(quiz.questions);
        } else if (quiz.id) {
          const quizQuestions = await api.getQuestionsByQuiz(quiz.id);
          const questionsWithAnswers = await Promise.all(
            quizQuestions.map(async question => {
              const answers = await api.getAnswersByQuestion(question.id!);
              return { ...question, answers };
            })
          );
          setQuestions(questionsWithAnswers);
        }
      } catch (error) {
        console.error('Failed to load questions:', error);
      }
    };

    void loadQuestions();
  }, [quiz]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setTimerActive(false);
            handleTimeExpired();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive, timeRemaining]);

  // Initial start for host & initial question for guests
  useEffect(() => {
    if (questions.length === 0) return;
    if (!wsRef.current) return;

    if (!hasInitializedFirstQuestionRef.current) {
      const timeLimit =
        (quiz.settings?.timeLimit as number | undefined) ??
        QUESTION_DEFAULT_TIME;

      if (isHost) {
        // Host: start quiz & broadcast first question
        startCooperativeQuiz();
      } else {
        // Guest: initialize first question locally
        initializeQuestion(0, timeLimit);
      }

      hasInitializedFirstQuestionRef.current = true;
    }
  }, [questions, isHost, quiz.settings]);

  // Auto-finish when all non-host participants have answered (host only)
  useEffect(() => {
    if (!isHost) return;
    if (hasProcessedCurrentQuestionRef.current) return;

    // active, non-spectator, non-host players
    const activeNonHostPlayers = allParticipants.filter(
      p => p.is_active && !p.is_spectator && !p.is_host
    );

    if (activeNonHostPlayers.length === 0) return;

    const allAnswered = activeNonHostPlayers.every(p =>
      participantAnswers.has(p.id)
    );

    if (allAnswered) {
      console.log(
        'All non-host participants answered, processing results early'
      );
      void processQuestionResults();
    }
  }, [participantAnswers, allParticipants, isHost]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    allParticipantsRef.current = allParticipants;
  }, [allParticipants]);

  const handleWebSocketMessage = (message: any) => {
    if (!isMountedRef.current) return;

    try {
      const { type, data } = message;
      console.log('WebSocket message received:', type, data);

      switch (type) {
        case 'cooperative_quiz_start':
          handleQuizStart(data);
          break;
        case 'cooperative_new_question':
          handleNewQuestion(data);
          break;
        case 'cooperative_answer_submitted':
          handleAnswerSubmitted(data);
          break;
        case 'cooperative_answer_status':
          handleAnswerStatusUpdate(data);
          break;
        case 'cooperative_question_results':
          handleQuestionResults(data);
          break;
        case 'cooperative_quiz_end':
          handleQuizEnd(data);
          break;
        case 'quiz_round_next':
          console.log('Guest received quiz_round_next message:', data);
          handleQuizRoundNext(data);
          break;
        case 'participant_joined':
        case 'participant_left':
          handleParticipantUpdate(type, data);
          break;
        default:
          console.log('Unhandled message type:', type, data);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  };

  const initializeQuestion = (questionIndex: number, durationSeconds?: number) => {
    hasProcessedCurrentQuestionRef.current = false;

    const latestQuestions = questionsRef.current;
    const latestParticipants = allParticipantsRef.current;

    console.log(
      'initializeQuestion: latestParticipants for waiting set:',
      latestParticipants
    );

    const question = latestQuestions[questionIndex];
    if (!question) {
      console.warn(
        'initializeQuestion: question not found yet',
        { questionIndex, latestQuestionsLen: latestQuestions.length }
      );
      return;
    }

    const timeLimit =
      durationSeconds ??
      (quiz.settings?.timeLimit as number | undefined) ??
      QUESTION_DEFAULT_TIME;

    const activeNonHostPlayers = latestParticipants.filter(
      p => p.is_active && !p.is_spectator && !p.is_host
    );

    // leave results view
    setShowResults(false);
    setShowQuestionResults(false);
    setQuestionResults(null);

    setCurrentQuestionIndex(questionIndex);
    setSelectedAnswer('');
    setParticipantAnswers(new Map());

    setQuestionStartTime(Date.now());
    setTimeRemaining(timeLimit);
    setTimerActive(true);

    setWaitingForAnswers(new Set(activeNonHostPlayers.map(p => p.id)));
  };

  const startCooperativeQuiz = () => {
    if (!isHost || !wsRef.current || questions.length === 0) return;

    const questionIndex = 0;
    const timeLimit =
      (quiz.settings?.timeLimit as number | undefined) ??
      QUESTION_DEFAULT_TIME;

    // Locally initialize
    initializeQuestion(questionIndex, timeLimit);

    // Broadcast to others via API helper (includes room_id)
    api
      .sendNewQuestion(wsRef.current, roomId, {
        question_index: Number(questionIndex),
        time_limit: Number(timeLimit),
      })
      .catch(error => {
        console.error('Failed to send cooperative_new_question:', error);
      });
  };

  const handleQuizStart = (data: any) => {
    console.log('Quiz started (cooperative_quiz_start message):', data);
    // We rely on cooperative_new_question for actual question data.
  };

  const handleNewQuestion = (data: any) => {
    const index = Number(data.question_index);
    const timeLimit = Number(data.time_limit);

    setShowQuestionResults(false);
    setQuestionResults(null);

    const tryInit = () => {
      const len = questionsRef.current.length;
      if (len === 0) {
        console.log('Questions not loaded yet, retrying init in 100ms...');
        setTimeout(tryInit, 100);
        return;
      }
      initializeQuestion(
        Number.isFinite(index) ? index : 0,
        Number.isFinite(timeLimit) ? timeLimit : QUESTION_DEFAULT_TIME
      );
    };

    tryInit();
  };

  const handleAnswerSubmitted = (data: any) => {
    console.log('Answer submitted:', data);

    setParticipantAnswers(prevAnswers => {
      const newMap = new Map(prevAnswers);
      newMap.set(data.participant_id, {
        participant_id: data.participant_id,
        participant_name: data.participant_name,
        answer_id: data.answer_id,
        is_correct: data.is_correct ?? false, // host will recalc anyway
        time_taken: data.time_taken ?? 0,
      });
      return newMap;
    });

    // Update waiting list for UI only
    setWaitingForAnswers(prev => {
      const newSet = new Set(prev);
      newSet.delete(data.participant_id);
      return newSet;
    });
  };

  const handleAnswerStatusUpdate = (data: any) => {
    // Update the waiting list
    setWaitingForAnswers(new Set(data.waiting_participants));
  };

  const handleQuestionResults = (data: any) => {
    console.log('Question results:', data);

    // Stop timer on all clients
    setTimerActive(false);
    setTimeRemaining(0);

    setQuestionResults({
      answers: data.all_answers,
      ratings: data.ratings,
      correct_answer_text: data.correct_answer_text ?? null,
    });

    // Update participant ratings
    setParticipantRatings(prev => {
      const newMap = new Map(prev);
      data.ratings.forEach((rating: ParticipantRating) => {
        newMap.set(rating.participant_id, rating);
      });
      return newMap;
    });

    setShowQuestionResults(true);
  };

  const handleQuizEnd = (data: any) => {
    console.log('Quiz ended:', data);
    setShowResults(true);
  };

  const handleQuizRoundNext = (data: any) => {
    console.log('Quiz round next received:', data);
    console.log('Guest navigation check:', {
      isHost,
      hasRoundContext: !!roundContext,
      roundContext,
      roomId
    });
    
    // Navigate guests to the next round
    if (!isHost && roundContext) {
      console.log('Guest navigating to quiz-round-player with state:', {
        quizRoundId: data.quizRoundId || roundContext.quizRoundId,
        roundIndex: data.roundIndex || roundContext.roundIndex + 1,
        isHost: false,
        participants: allParticipants,
        roomId: roomId
      });
      navigate('/quiz-round-player', {
        state: {
          quizRoundId: data.quizRoundId || roundContext.quizRoundId,
          roundIndex: data.roundIndex || roundContext.roundIndex + 1,
          isHost: false,
          participants: allParticipants,
          roomId: roomId
        }
      });
    } else {
      console.log('Guest navigation blocked:', {
        isHost,
        hasRoundContext: !!roundContext
      });
    }
  };

  // Handle participants joining/leaving during quiz
  const handleParticipantUpdate = (type: string, data: any) => {
    console.log(`Participant update: ${type}`, data);

    if (type === 'participant_joined' && data.participant) {
      const participant = data.participant;

      setAllParticipants(prev => {
        const existing = prev.find(p => p.id === participant.id);
        if (existing) return prev;
        return [...prev, participant];
      });

      handleLateParticipantJoin(participant);
    } else if (type === 'participant_left' && data.participant_id) {
      setAllParticipants(prev =>
        prev.filter(p => p.id !== data.participant_id)
      );

      setWaitingForAnswers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.participant_id);
        return newSet;
      });

      setParticipantAnswers(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.participant_id);
        return newMap;
      });
    }
  };

  const handleLateParticipantJoin = (participant: RoomParticipant) => {
    if (participant.is_spectator || participant.is_host) return;

    console.log('Late participant joined:', participant.guest_name);

    setAllParticipants(prev => {
      const existing = prev.find(p => p.id === participant.id);
      if (existing) return prev;
      return [...prev, participant];
    });

    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion && timerActive) {
      const hasAnswered = participantAnswers.has(participant.id);
      if (!hasAnswered) {
        setWaitingForAnswers(prev => {
          const newSet = new Set(prev);
          newSet.add(participant.id);
          return newSet;
        });
      }
    }
  };

  const handleAnswerSelect = (answerId: string) => {
    setSelectedAnswer(answerId);
  };

  const handleSubmitAnswer = async () => {
    console.log('handleSubmitAnswer clicked');

    if (isHost) {
      console.warn('Host cannot submit answers in cooperative mode');
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];

    if (!currentQuestion) {
      console.error('No current question in handleSubmitAnswer');
      return;
    }
    if (!selectedAnswer) {
      console.error('No selected answer in handleSubmitAnswer');
      return;
    }
    if (!currentParticipantId) {
      console.error('No currentParticipantId in handleSubmitAnswer');
      return;
    }

    const timeTakenMs = Date.now() - questionStartTime;

    console.log('Submitting answer payload:', {
      roomId,
      question_id: currentQuestion.id!,
      answer_id: selectedAnswer,
      participant_id: currentParticipantId,
      time_taken_ms: timeTakenMs,
      wsExists: !!wsRef.current,
    });

    if (wsRef.current) {
      try {
        await api.sendAnswerSubmit(wsRef.current, roomId, {
          question_id: currentQuestion.id!,
          answer_id: selectedAnswer,
          participant_id: currentParticipantId,
          time_taken_ms: timeTakenMs,
        });
        console.log('sendAnswerSubmit call finished');
      } catch (error) {
        console.error('Failed to submit answer:', error);
      }
    }
  };

  const handleTimeExpired = () => {
    console.log('Time expired for question');
    if (isHost) {
      void processQuestionResults();
    }
  };

  const computeCorrectAnswerText = (q: Question): string | null => {
    if (!q) return null;

    if (q.type === 'short_answer') {
      const canonical =
        q.correct_answer?.trim() ||
        q.answers?.find(a => a.is_correct)?.answer?.trim();
      return canonical || null;
    }

    const correct = q.answers?.find(a => a.is_correct);
    return correct?.answer ?? null;
  };

  const processQuestionResults = async () => {
    console.log(
      'processQuestionResults called, hasProcessedCurrentQuestionRef =',
      hasProcessedCurrentQuestionRef.current
    );
    // Don’t run twice for the same question
    if (hasProcessedCurrentQuestionRef.current) return;
    hasProcessedCurrentQuestionRef.current = true;

    // Stop timer on host
    setTimerActive(false);
    setTimeRemaining(0);

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || !wsRef.current) return;

    const allAnswers: CooperativeAnswer[] = [];
    const activeParticipants = allParticipants.filter(
      p => p.is_active && !p.is_spectator && !p.is_host
    );

    // Add submitted answers
    participantAnswers.forEach(answer => {
      allAnswers.push(answer);
    });

    // Add missing participants with no answer
    activeParticipants.forEach(participant => {
      if (!participantAnswers.has(participant.id)) {
        allAnswers.push({
          participant_id: participant.id,
          participant_name: participant.guest_name,
          answer_id: 'NO_ANSWER',
          is_correct: false,
          time_taken: (quiz?.settings?.timeLimit as number | undefined) ?? 30,
        });
      }
    });

    // Calculate correctness
    const correctedAnswers = allAnswers.map(answer => {
      if (answer.answer_id === 'NO_ANSWER') {
        return { ...answer, is_correct: false };
      }

      let isCorrect = false;
      if (currentQuestion.type === 'short_answer') {
        const canonicalCorrect =
          currentQuestion.correct_answer?.trim().toLowerCase() ||
          currentQuestion.answers
            ?.find(a => a.is_correct)
            ?.answer?.trim()
            .toLowerCase();
        const userAnswer = answer.answer_id.trim().toLowerCase();
        isCorrect = canonicalCorrect ? userAnswer === canonicalCorrect : false;
      } else {
        const selectedAnswerObj = currentQuestion.answers?.find(
          a => a.id === answer.answer_id
        );
        isCorrect = selectedAnswerObj?.is_correct || false;
      }

      return { ...answer, is_correct: isCorrect };
    });

    const ratings = calculateRatings(correctedAnswers);
    const correct_answer_text = computeCorrectAnswerText(currentQuestion);

    // Send results to all participants
    try {
      await api.sendQuestionResults(wsRef.current, roomId, {
        question_id: currentQuestion.id!,
        all_answers: correctedAnswers,
        ratings,
        correct_answer_text,
      });
    } catch (error) {
      console.error('Failed to send question results:', error);
    }
  };

  const calculateRatings = (
    answers: CooperativeAnswer[]
  ): ParticipantRating[] => {
    const ratings: ParticipantRating[] = [];

    answers.forEach(answer => {
      let ratingChange = 0;
      if (answer.answer_id === 'NO_ANSWER') {
        ratingChange = 0;
      } else if (answer.is_correct) {
        ratingChange = 10;
      } else {
        ratingChange = -5;
      }

      ratings.push({
        participant_id: answer.participant_id,
        participant_name: answer.participant_name,
        total_score:
          (participantRatings.get(answer.participant_id)?.total_score || 0) +
          ratingChange,
        rating_change: ratingChange,
      });
    });

    return ratings;
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      const timeLimit =
        (quiz.settings?.timeLimit as number | undefined) ??
        QUESTION_DEFAULT_TIME;

      // Locally on host
      initializeQuestion(nextIndex, timeLimit);

      // Broadcast to others via API helper
      if (isHost && wsRef.current) {
        api
          .sendNewQuestion(wsRef.current, roomId, {
            question_index: Number(nextIndex),
            time_limit: Number(timeLimit),
          })
          .catch(error => {
            console.error('Failed to send cooperative_new_question:', error);
          });
      }
    } else {
      // Quiz finished - check if in round context
      console.log('Quiz finished, roundContext:', roundContext);
      if (roundContext) {
        console.log('Navigating to quiz-round-player with state:', {
          quizRoundId: roundContext.quizRoundId,
          roundIndex: roundContext.roundIndex + 1,
          isHost: true,
          participants: allParticipants,
          roomId: roomId
        });
        // Navigate back to QuizRoundPlayer for next round
        navigate('/quiz-round-player', {
          state: {
            quizRoundId: roundContext.quizRoundId,
            roundIndex: roundContext.roundIndex + 1,
            isHost: true,
            participants: allParticipants,
            roomId: roomId
          }
        });

        // Notify guests to navigate to next round
        if (wsRef.current) {
          const message = {
            type: 'quiz_round_next',
            data: {
              quizRoundId: roundContext.quizRoundId,
              roundIndex: roundContext.roundIndex + 1,
            },
            timestamp: new Date().toISOString(),
          };
          console.log('Host broadcasting quiz_round_next message:', message);
          try {
            wsRef.current.send(JSON.stringify(message));
            console.log('quiz_round_next message sent successfully');
          } catch (e) {
            console.warn('Failed to broadcast next round navigation:', e);
          }
        }
      } else {
        console.log('No roundContext, calling finishQuiz');
        void finishQuiz();
      }
    }
  };

  const finishQuiz = async () => {
    if (!isHost) return;
    const finalResults = {
      participants: Array.from(participantRatings.values()).map(rating => ({
        participant_id: rating.participant_id,
        participant_name: rating.participant_name,
        total_score: rating.total_score,
        correct_answers:
          rating.total_score > 0 ? Math.floor(rating.total_score / 10) : 0,
        total_questions: questions.length,
      })),
    };

    if (wsRef.current) {
      try {
        await api.sendQuizEnd(wsRef.current, roomId, finalResults);
      } catch (error) {
        console.error('Failed to send quiz end:', error);
      }
    }
  };

  const handleBackToLobby = () => {
    navigate('/cooperate-setup', {
      state: {
        quiz,
        roomId,
        isJoining: !isHost,
      },
    });
  };

  const getCorrectAnswerText = (q: Question): string | null => {
    if (q.type === 'short_answer') {
      const canonical =
        q.correct_answer?.trim() ||
        q.answers?.find(a => a.is_correct)?.answer?.trim();
      return canonical || null;
    }

    // multiple choice
    const correct = q.answers?.find(a => a.is_correct);
    return correct?.answer ?? null;
  };

  const getUserAnswerText = (q: Question, a: CooperativeAnswer): string => {
    if (a.answer_id === 'NO_ANSWER') return '—';

    if (q.type === 'short_answer') {
      // In your current implementation, short-answer text is stored in answer_id
      return a.answer_id;
    }

    // multiple choice: answer_id is the ID of the chosen option
    const chosen = q.answers?.find(opt => opt.id === a.answer_id);
    return chosen?.answer ?? '(unknown option)';
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isShortAnswer = currentQuestion?.type === 'short_answer';

  const activeParticipants = allParticipants.filter(
    p => p.is_active && !p.is_spectator && !p.is_host
  );
  const answeredCount = activeParticipants.length - waitingForAnswers.size;
  const totalParticipants = activeParticipants.length;

  if (!currentQuestion) {
    return (
      <div className="cooperative-quiz-player">
        <div className="loading-state">
          <div className="loading-spinner">⟳</div>
          <p>Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (showResults) {
    const rankingRows = allParticipants
      .filter(p => p.is_active && !p.is_spectator && !p.is_host) // хоста/зрителей исключаем
      .map(p => {
        const r = participantRatings.get(p.id);
        return {
          participant_id: p.id,
          participant_name: p.guest_name || r?.participant_name || 'Player',
          total_score: r?.total_score ?? 0,
          guest_avatar: p.guest_avatar ?? null,
        };
      })
      .sort((a, b) => b.total_score - a.total_score);

    return (
      <div className="cooperative-quiz-player">
        <motion.div
          className="quiz-results"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h1>Quiz Complete!</h1>

          <div className="final-rankings">
            <h2>Final Rankings</h2>

            {rankingRows.map((row, index) => {
              const avatarUrl = row.guest_avatar ? row.guest_avatar : null;

              return (
                <div key={row.participant_id} className="ranking-item">
                  <span className="rank">#{index + 1}</span>

                  <div className="ranking-user">
                    {avatarUrl?.startsWith('http') ? (
                      <img className="ranking-avatar" src={avatarUrl} alt={row.participant_name} />
                    ) : (
                      <div className="ranking-avatar placeholder">
                        {avatarUrl}
                      </div>
                    )}

                    <span className="name">{row.participant_name}</span>
                  </div>

                  <span className="score">{row.total_score} pts</span>
                </div>
              );
            })}
          </div>

          <div className="button-group">
            {isHost && roundContext ? (
              <button className="next-btn" onClick={handleNextQuestion}>
                Next Round
              </button>
            ) : (
              <button className="back-btn" onClick={handleBackToLobby}>
                Back to Lobby
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (showQuestionResults && questionResults) {
    return (
      <div className="cooperative-quiz-player">
        <motion.div
          className="question-results"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2>Question {currentQuestionIndex + 1} Results</h2>

          {questionResults.correct_answer_text && (
            <div className="correct-answer-closeup">
              <div className="correct-answer-label">The Correct Answer</div>
              <div className="correct-answer-text">{questionResults.correct_answer_text}</div>
            </div>
          )}

          <div className="results-list">
            {questionResults.answers.map(a => {
              const participant = allParticipants.find(p => p.id === a.participant_id);

              const displayName = participant?.guest_name || a.participant_name;
              const avatarUrl = participant?.guest_avatar
                ? resolveMediaUrl(participant.guest_avatar)
                : null;

              const rating = questionResults.ratings.find(
                r => r.participant_id === a.participant_id
              );

              const isNoAnswer = a.answer_id === 'NO_ANSWER';
              const userAnswerText = getUserAnswerText(currentQuestion, a);
              const correctAnswerText =
                questionResults.correct_answer_text ?? computeCorrectAnswerText(currentQuestion);

              return (
                <div
                  key={a.participant_id}
                  className={`result-item ${
                    a.is_correct ? 'correct' : isNoAnswer ? 'no-answer' : 'incorrect'
                  }`}
                >
                  <div className="result-participant">
                    {avatarUrl?.startsWith('http') ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="ranking-avatar"
                      />
                    ) : (
                      <div className="ranking-avatar placeholder">
                        {avatarUrl}
                      </div>
                    )}

                    <div className="result-main">
                      <div className="result-name-row">
                        <div className="result-name-left">
                          <span className="participant-name">{displayName}</span>
                          {participant?.id === currentParticipantId && (
                            <span className="you-badge">You</span>
                          )}
                        </div>

                        {rating && (
                          <span className="rating-chip">
                            {(rating.rating_change > 0 ? '+' : '') + rating.rating_change} pts
                          </span>
                        )}
                      </div>

                      <div className="result-subline">
                        <span className="status-pill">
                          {isNoAnswer
                            ? 'No answer'
                            : a.is_correct
                            ? 'Correct'
                            : 'Incorrect'}
                        </span>

                        <div className="answer-lines">
                          <div className="answer-line">
                            <span className="answer-label">Answered:</span>
                            <span className="answer-value">{userAnswerText}</span>
                          </div>

                          {correctAnswerText && (
                            <div className="answer-line">
                              <span className="answer-label">Correct:</span>
                              <span className="answer-value correct-value">
                                {correctAnswerText}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isHost && (
            <button className="next-btn" onClick={handleNextQuestion}>
              {currentQuestionIndex < questions.length - 1
                ? 'Next Question'
                : roundContext
                ? 'Next Round'
                : 'Finish Quiz'}
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const hasSubmitted =
    !!currentParticipantId &&
    !!participantAnswers.get(currentParticipantId);

  return (
    <div className="cooperative-quiz-player">
      {/* Timer */}
      {timerActive && timeRemaining > 0 && (
        <div className="quiz-timer">
          <div
            className={`timer-display ${
              timeRemaining <= 10 ? 'timer-warning' : ''
            }`}
          >
            <span className="timer-icon">⏱️</span>
            <span className="timer-text">
              {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* Question */}
      <motion.div
        className="question-container"
        key={currentQuestionIndex}
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
      >
        <div className="question-content">
          <div className="question-text">{currentQuestion.question}</div>

          {(currentQuestion.image_url || currentQuestion.audio_url) && (
            <div className="question-media">
              {currentQuestion.image_url && (
                <img
                  src={resolveMediaUrl(currentQuestion.image_url)}
                  alt="Question"
                  className="question-image"
                />
              )}
              {currentQuestion.audio_url && (
                <audio
                  controls
                  src={resolveMediaUrl(currentQuestion.audio_url)}
                  className="question-audio"
                />
              )}
            </div>
          )}

          {isShortAnswer ? (
            <div className="short-answer-section">
              <input
                type="text"
                className="short-answer-input"
                value={selectedAnswer ?? ''}
                onChange={e => setSelectedAnswer(e.target.value)}
                placeholder="Type your answer here..."
                disabled={hasSubmitted}
              />
            </div>
          ) : (
            <div className="answers-grid">
              {currentQuestion.answers?.map(answer => (
                <button
                  key={answer.id}
                  className={`answer-option ${
                    selectedAnswer === answer.id ? 'selected' : ''
                  }`}
                  onClick={() => handleAnswerSelect(answer.id!)}
                  disabled={hasSubmitted}
                >
                  {answer.answer}
                </button>
              ))}
            </div>
          )}

          {!hasSubmitted && !isHost && (
            <button
              className="submit-btn"
              onClick={handleSubmitAnswer}
              disabled={
                !selectedAnswer ||
                (isShortAnswer &&
                  (selectedAnswer ?? '').trim() === '')
              }
            >
              Submit Answer
            </button>
          )}

          {/* Answer submitted confirmation (for current player) */}
          {currentParticipantId &&
            participantAnswers.get(currentParticipantId) && (
              <div className="answer-submitted">
                <span className="submitted-icon">✅</span>
                <span>Answer submitted! Waiting for others...</span>
              </div>
            )}

          {/* {isHost && (
            <p className="host-info">
              You are the host. Your answers are not collected; this screen is for broadcasting only.
            </p>
          )} */}
        </div>
      </motion.div>

      {/* Participant Status */}
      <div className="participant-status">
        <h3>Participants Status</h3>
        <div className="status-list">
          {activeParticipants.length === 0 ? (
            <p className="no-players">No active players yet.</p>
          ) : (
            activeParticipants.map(participant => {
              const hasAnswered = !waitingForAnswers.has(participant.id);
              return (
                <div
                  key={participant.id}
                  className={`status-item ${hasAnswered ? 'answered' : 'waiting'}`}
                >
                  <div className="participant-info">
                    <span className="participant-name">
                      {participant.guest_name}
                    </span>
                    {participant.id === currentParticipantId && (
                      <span className="you-badge">You</span>
                    )}
                  </div>
                  <div className="answer-status">
                    {hasAnswered ? (
                      <span className="status-icon">✅</span>
                    ) : (
                      <span className="status-icon">⏳</span>
                    )}
                    <span className="status-text">
                      {hasAnswered ? 'Answered' : 'Waiting'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};