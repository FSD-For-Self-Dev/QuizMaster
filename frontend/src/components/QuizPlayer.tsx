import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, Quiz, Question, resolveMediaUrl } from '../api';
import './QuizPlayer.css';

interface GameAnswer {
  question_id: string;
  answer_id: string;
  is_correct: boolean;
  time_taken?: number;
}

export const QuizPlayer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // For multiple choice: stores selected answer ID.
  // For short answer: stores the user's free-text answer.
  const [selectedAnswers, setSelectedAnswers] = useState<{ [questionId: string]: string }>({});
  const [gameAnswers, setGameAnswers] = useState<GameAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  // For Jeopardy mode: track revealed cells and current selected cell
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const [selectedCell, setSelectedCell] = useState<{ category: string; points: number } | null>(null);
  const [showAnswerVerdict, setShowAnswerVerdict] = useState(false);
  const [currentAnswerVerdict, setCurrentAnswerVerdict] = useState<{ isCorrect: boolean; correctAnswer?: string } | null>(null);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(false);

  // Jeopardy scoring state
  const [jeopardyScore, setJeopardyScore] = useState<number>(0);

  // Classic mode verdict state
  const [showClassicVerdict, setShowClassicVerdict] = useState<boolean>(false);
  const [classicVerdict, setClassicVerdict] = useState<{ isCorrect: boolean; correctAnswer?: string; points?: number } | null>(null);

  // Initialize timer for current question
  const initializeTimer = () => {
    const timeLimit = quiz?.settings?.timeLimit;
    if (timeLimit && timeLimit > 0) {
      setTimeRemaining(timeLimit);
      setTimerActive(true);
    } else {
      setTimeRemaining(0);
      setTimerActive(false);
    }
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Time's up! Auto-submit answer
            setTimerActive(false);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [timerActive, timeRemaining]);

  

  // Reset timer when question changes
  useEffect(() => {
    if (questions.length > 0) {
      initializeTimer();
    }
  }, [currentQuestionIndex, selectedCell, questions.length]);

  // Get quiz data from navigation state
  useEffect(() => {
    const quizData = location.state?.quiz as Quiz;
    if (quizData) {
      loadQuizData(quizData);
    } else {
      navigate('/');
    }
  }, [location.state, navigate]);

  const loadQuizData = async (quizData: Quiz) => {
    try {
      setLoading(true);
      setQuiz(quizData);

      // If quiz has questions embedded, use them, otherwise fetch from API
      if (quizData.questions && quizData.questions.length > 0) {
        setQuestions(quizData.questions);
      } else if (quizData.id) {
        const quizQuestions = await api.getQuestionsByQuiz(quizData.id);
        const questionsWithAnswers = await Promise.all(
          quizQuestions.map(async (question) => {
            const answers = await api.getAnswersByQuestion(question.id!);
            return { ...question, answers };
          })
        );
        setQuestions(questionsWithAnswers);
      }

      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
    } catch (error) {
      console.error('Failed to load quiz data:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answerId: string) => {
    console.log('handleAnswerSelect called with:', answerId);
    
    // Use the same logic as in the main render for determining current question
    const currentQuestion = selectedCell 
      ? getQuestionByCategoryAndPoints(selectedCell.category, selectedCell.points) || questions[currentQuestionIndex]
      : questions[currentQuestionIndex];
      
    console.log('Current question in handleAnswerSelect:', currentQuestion);
    console.log('Current question index:', currentQuestionIndex);
    console.log('Selected cell:', selectedCell);
    console.log('Questions array length:', questions.length);
    console.log('Question answers:', currentQuestion?.answers);
    
    const selectedAnswer = currentQuestion?.answers?.find(a => a.id === answerId);
    console.log('Selected answer found:', selectedAnswer);

    if (selectedAnswer && currentQuestion) {
      console.log('Setting selected answer for question:', currentQuestion.id);
      setSelectedAnswers(prev => {
        const newState = {
          ...prev,
          [currentQuestion.id!]: answerId
        };
        console.log('New selectedAnswers state:', newState);
        return newState;
      });

      // For Classic quiz, answers are recorded only when confirmed
      // For Jeopardy, answers are recorded only when confirmed
    } else {
      console.log('No selected answer found or no current question, exiting');
    }
  };

  const handleJeopardyAnswerConfirm = () => {
    console.log('handleJeopardyAnswerConfirm called');
    const currentQuestion = questions[currentQuestionIndex];
    const selectedAnswerId = selectedAnswers[currentQuestion.id!];

    console.log('Current question:', currentQuestion);
    console.log('Selected answer ID:', selectedAnswerId);
    console.log('Question type:', currentQuestion.type);
    console.log('Has answered current:', hasAnsweredCurrent);

    // Check if answer is provided
    if (!selectedAnswerId || (currentQuestion.type === 'short_answer' && selectedAnswerId.trim() === '')) {
      console.log('No answer provided, returning');
      return;
    }

    // Stop timer when answer is confirmed
    setTimerActive(false);
    setTimeRemaining(0);
    
    const timeTaken = Date.now() - questionStartTime;
    let isCorrect = false;
    let correctAnswer = '';

    if (currentQuestion.type === 'short_answer') {
      const canonicalCorrect = 
        currentQuestion.correct_answer ||
        currentQuestion.answers?.find(a => a.is_correct)?.answer;
      
      correctAnswer = canonicalCorrect || '';
      isCorrect = selectedAnswerId.trim().toLowerCase() === canonicalCorrect?.trim().toLowerCase();
      
      // Record short answer
      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: selectedAnswerId,
        is_correct: isCorrect,
        time_taken: timeTaken
      }]);
    } else {
      const selectedAnswer = currentQuestion.answers?.find(a => a.id === selectedAnswerId);
      const correctAnswerObj = currentQuestion.answers?.find(a => a.is_correct);
      
      isCorrect = selectedAnswer?.is_correct || false;
      correctAnswer = correctAnswerObj?.answer || '';
      
      // Record multiple choice answer
      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: selectedAnswerId,
        is_correct: isCorrect,
        time_taken: timeTaken
      }]);
    }

    // Update Jeopardy score
    if (quiz?.type === 'jeopardy' && selectedCell) {
      setJeopardyScore(prevScore => {
        if (isCorrect) {
          return prevScore + selectedCell.points;
        } else {
          return prevScore; // No change for incorrect answer (or could be prevScore - selectedCell.points for penalty)
        }
      });
    }

    // Set verdict for display
    setCurrentAnswerVerdict({ isCorrect, correctAnswer });
    setShowAnswerVerdict(true);

    // Mark cell as revealed
    if (selectedCell) {
      const cellId = `${selectedCell.category}-${selectedCell.points}`;
      setRevealedCells(prev => {
        const newSet = new Set(prev);
        newSet.add(cellId);
        return newSet;
      });
    }
  };

  const handleNextQuestion = () => {
    const currentQuestion = questions[currentQuestionIndex];

    // For short answer questions, record the answer when moving forward
    if (currentQuestion.type === 'short_answer') {
      const existing = gameAnswers.find(a => a.question_id === currentQuestion.id);
      const userText = selectedAnswers[currentQuestion.id!];

      if (!existing && userText) {
        const timeTaken = Date.now() - questionStartTime;

        // Determine correctness if we have a canonical correct answer
        const canonicalCorrect =
          currentQuestion.correct_answer ||
          currentQuestion.answers?.find(a => a.is_correct)?.answer;

        let isCorrect = false;
        if (canonicalCorrect) {
          isCorrect =
            userText.trim().toLowerCase() === canonicalCorrect.trim().toLowerCase();
        }

        setGameAnswers(prev => [
          ...prev,
          {
            question_id: currentQuestion.id!,
            // Store the user's free-text answer in answer_id field for now
            answer_id: userText,
            is_correct: isCorrect,
            time_taken: timeTaken,
          },
        ]);
      }
    }

    // Reset timer for next question
    setTimerActive(false);
    setTimeRemaining(0);

    // Reset Classic mode verdict state
    setShowClassicVerdict(false);
    setClassicVerdict(null);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setQuestionStartTime(Date.now());
    } else {
      finishQuiz();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      // Reset timer for previous question
      setTimerActive(false);
      setTimeRemaining(0);
      
      // Reset Classic mode verdict state
      setShowClassicVerdict(false);
      setClassicVerdict(null);
      
      setCurrentQuestionIndex(prev => prev - 1);
      setQuestionStartTime(Date.now());
    }
  };

  const finishQuiz = async () => {
    // Reset timer
    setTimerActive(false);
    setTimeRemaining(0);
    
    try {
      if (quiz?.id) {
        await api.createGameSession({
          quiz_id: quiz.id,
          player_name: 'Anonymous Player', // Could be made configurable
          score: calculateScore(),
          answers: gameAnswers
        });
      }
      setShowResults(true);
    } catch (error) {
      console.error('Failed to save game session:', error);
      setShowResults(true); // Show results anyway
    }
  };

  const calculateScore = () => {
    const correctAnswers = gameAnswers.filter(answer => answer.is_correct).length;
    return Math.round((correctAnswers / questions.length) * 100);
  };

  const calculateTotalPoints = () => {
    return gameAnswers.reduce((total, answer) => {
      if (answer.is_correct) {
        const question = questions.find(q => q.id === answer.question_id);
        return total + (question?.points || 10); // Default to 10 points if not specified
      }
      return total;
    }, 0);
  };

  const calculateMaxPossiblePoints = () => {
    return questions.reduce((total, question) => {
      return total + (question.points || 10); // Default to 10 points if not specified
    }, 0);
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setGameAnswers([]);
    setShowResults(false);
    setRevealedCells(new Set());
    setSelectedCell(null);
    setShowAnswerVerdict(false);
    setCurrentAnswerVerdict(null);
    setShowClassicVerdict(false);
    setClassicVerdict(null);
    setJeopardyScore(0);
    setTimerActive(false);
    setTimeRemaining(0);
    setStartTime(Date.now());
    setQuestionStartTime(Date.now());
  };

  const handleContinueToBoard = () => {
    setShowAnswerVerdict(false);
    setCurrentAnswerVerdict(null);
    setSelectedCell(null);
    setTimerActive(false);
    setTimeRemaining(0);
    setQuestionStartTime(Date.now());
  };

  const handleBackToDashboard = () => {
    navigate('/');
  };

  // Group questions by category for Jeopardy board
  const getCategories = () => {
    const categories = new Map<string, Question[]>();
    questions.forEach(q => {
      const category = q.category || 'Uncategorized';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(q);
    });
    return categories;
  };

  const getQuestionByCategoryAndPoints = (category: string, points: number) => {
    console.log('getQuestionByCategoryAndPoints called with:', { category, points });
    console.log('Available questions:', questions.map(q => ({
      id: q.id,
      category: q.category,
      points: q.points,
      hasAnswers: !!q.answers
    })));
    
    const found = questions.find(q => 
      (q.category || 'Uncategorized') === category && 
      q.points === points
    );
    
    console.log('Question found:', found);
    return found;
  };

  const handleCellClick = (category: string, points: number) => {
    // Only allow selection if the cell hasn't been revealed yet
    const cellId = `${category}-${points}`;
    if (!revealedCells.has(cellId)) {
      // Reset timer before selecting new cell
      setTimerActive(false);
      setTimeRemaining(0);
      
      setSelectedCell({ category, points });
      setQuestionStartTime(Date.now());
    }
  };

  // Classic mode answer confirmation
  const handleClassicAnswerConfirm = () => {
    console.log('Classic answer confirmation...');
    
    const currentQuestion = questions[currentQuestionIndex];
    const selectedAnswerId = selectedAnswers[currentQuestion.id!];

    if (!selectedAnswerId || (currentQuestion.type === 'short_answer' && selectedAnswerId.trim() === '')) {
      console.log('No answer provided for classic mode');
      return;
    }

    // Stop timer when answer is confirmed
    setTimerActive(false);
    setTimeRemaining(0);

    const timeTaken = Date.now() - questionStartTime;
    let isCorrect = false;
    let correctAnswer = '';
    let points = currentQuestion.points || 10;

    if (currentQuestion.type === 'short_answer') {
      const canonicalCorrect = 
        currentQuestion.correct_answer ||
        currentQuestion.answers?.find(a => a.is_correct)?.answer;
      
      correctAnswer = canonicalCorrect || '';
      isCorrect = selectedAnswerId.trim().toLowerCase() === canonicalCorrect?.trim().toLowerCase();
      
      // Record short answer
      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: selectedAnswerId,
        is_correct: isCorrect,
        time_taken: timeTaken
      }]);
    } else {
      const selectedAnswer = currentQuestion.answers?.find(a => a.id === selectedAnswerId);
      const correctAnswerObj = currentQuestion.answers?.find(a => a.is_correct);
      
      isCorrect = selectedAnswer?.is_correct || false;
      correctAnswer = correctAnswerObj?.answer || '';
      
      // Record multiple choice answer
      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: selectedAnswerId,
        is_correct: isCorrect,
        time_taken: timeTaken
      }]);
    }

    // Show verdict
    setClassicVerdict({ isCorrect, correctAnswer, points: isCorrect ? points : 0 });
    setShowClassicVerdict(true);
  };

  // Auto-submit function when time runs out
  const handleAutoSubmit = () => {
    console.log('Time\'s up! Auto-submitting answer...');
    
    // Stop timer immediately when auto-submitting
    setTimerActive(false);
    setTimeRemaining(0);
    
    // Safety check - make sure we have questions
    if (!questions || questions.length === 0) {
      console.log('No questions available for auto-submit');
      return;
    }

    // Get current question to check if it's answered
    const currentQuestion = selectedCell 
      ? getQuestionByCategoryAndPoints(selectedCell.category, selectedCell.points) || questions[currentQuestionIndex]
      : questions[currentQuestionIndex];
    
    if (!currentQuestion) {
      console.log('No current question found for auto-submit');
      return;
    }
    
    const selectedAnswerId = selectedAnswers[currentQuestion.id!];
    const isShortAnswer = currentQuestion.type === 'short_answer';
    const hasAnsweredCurrent = isShortAnswer 
      ? !!(selectedAnswerId && selectedAnswerId.trim() !== '')
      : !!selectedAnswerId;

    // If question is answered, proceed normally
    if (hasAnsweredCurrent) {
      if (quiz?.type === 'jeopardy' && selectedCell) {
        // For Jeopardy mode
        handleJeopardyAnswerConfirm();
      } else {
        // For Classic mode
        handleNextQuestion();
      }
    } else {
      // Question not answered - count as incorrect
      console.log('Question not answered, counting as incorrect...');
      
      const timeTaken = Date.now() - questionStartTime;
      
      // Record incorrect answer (no answer provided)
      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: 'NO_ANSWER', // Special marker for no answer
        is_correct: false,
        time_taken: timeTaken
      }]);
      
      // Update Jeopardy score (no points for incorrect/no answer)
      if (quiz?.type === 'jeopardy' && selectedCell) {
        setJeopardyScore(prevScore => prevScore); // No change for incorrect answer
      }

      // Mark cell as revealed for Jeopardy
      if (selectedCell) {
        const cellId = `${selectedCell.category}-${selectedCell.points}`;
        setRevealedCells(prev => {
          const newSet = new Set(prev);
          newSet.add(cellId);
          return newSet;
        });
      }
      
      // Show verdict for Jeopardy or move to next question for Classic
      if (quiz?.type === 'jeopardy' && selectedCell) {
        setCurrentAnswerVerdict({ 
          isCorrect: false, 
          correctAnswer: currentQuestion.correct_answer || 
            currentQuestion.answers?.find(a => a.is_correct)?.answer || 
            'No correct answer provided'
        });
        setShowAnswerVerdict(true);
      } else {
        // For Classic mode, move to next question
        handleNextQuestion();
      }
    }
  };

  if (loading) {
    return (
      <div className="quiz-player">
        <div className="loading-state">
          <div className="loading-spinner">⟳</div>
          <p>Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!quiz || !questions.length) {
    return (
      <div className="quiz-player">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Quiz not found</h3>
          <button className="back-btn" onClick={handleBackToDashboard}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (showResults) {
    const percentageScore = calculateScore();
    const totalPoints = calculateTotalPoints();
    const maxPoints = calculateMaxPossiblePoints();
    const totalTime = Math.round((Date.now() - startTime) / 1000);

    return (
      <div className="quiz-player">
        <motion.div
          className="results-screen"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="results-header">
            <h1>Quiz Complete!</h1>
            <div className="score-display">
              {quiz?.type === 'jeopardy' ? (
                <div className="jeopardy-final-score">
                  <div className="jeopardy-score-circle">
                    <span className="jeopardy-score-number">${jeopardyScore}</span>
                    <span className="jeopardy-score-label">Total Score</span>
                  </div>
                </div>
              ) : (
                <div className="classic-final-score">
                  <div className="score-circle">
                    <span className="score-number">{percentageScore}</span>
                    <span className="score-percent">%</span>
                  </div>
                  <div className="points-circle">
                    <span className="points-number">{totalPoints}</span>
                    <span className="points-label">/{maxPoints} pts</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="results-stats">
            {quiz?.type === 'jeopardy' ? (
              <>
                <div className="stat">
                  <span className="stat-label">Questions Answered</span>
                  <span className="stat-value">{gameAnswers.length}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Correct</span>
                  <span className="stat-value">{gameAnswers.filter(a => a.is_correct).length}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total Points</span>
                  <span className="stat-value">${jeopardyScore}</span>
                </div>
              </>
            ) : (
              <>
                <div className="stat">
                  <span className="stat-label">Questions</span>
                  <span className="stat-value">{questions.length}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Correct</span>
                  <span className="stat-value">{gameAnswers.filter(a => a.is_correct).length}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Total Points</span>
                  <span className="stat-value">{totalPoints}/{maxPoints}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Time</span>
                  <span className="stat-value">{Math.floor(totalTime / 60)}:{(totalTime % 60).toString().padStart(2, '0')}</span>
                </div>
              </>
            )}
          </div>

          <div className="question-review">
            <h3>Question Review</h3>
            {questions.map((question, index) => {
              const userAnswer = gameAnswers.find(a => a.question_id === question.id);
              const correctAnswer = question.answers?.find(a => a.is_correct);
              const correctAnswerText = correctAnswer?.answer || question.correct_answer;
              const isCorrect = userAnswer?.is_correct;

              return (
                <div key={question.id} className={`review-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                  <div className="review-question">
                    <span className="question-number">{index + 1}.</span>
                    <span>{question.question}</span>
                  </div>
                  <div className="review-answer">
                    <span className="answer-status">
                      {isCorrect ? '✅ Correct' : '❌ Incorrect'}
                    </span>
                    {!isCorrect && correctAnswerText && (
                      <span className="correct-answer">
                        Correct: {correctAnswerText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="results-actions">
            <button className="restart-btn" onClick={handleRestartQuiz}>Take Quiz Again</button>
            <button className="dashboard-btn" onClick={handleBackToDashboard}>Back to Dashboard</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Show answer verdict for Jeopardy mode
  if (quiz.type === 'jeopardy' && showAnswerVerdict && currentAnswerVerdict) {
    return (
      <div className="quiz-player">
        <motion.div
          className="answer-verdict-screen"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="verdict-header">
            <div className={`verdict-icon ${currentAnswerVerdict.isCorrect ? 'correct' : 'incorrect'}`}>
              {currentAnswerVerdict.isCorrect ? '✅' : '❌'}
            </div>
            <h2 className={`verdict-title ${currentAnswerVerdict.isCorrect ? 'correct' : 'incorrect'}`}>
              {currentAnswerVerdict.isCorrect ? 'Correct!' : 'Incorrect'}
            </h2>
          </div>

          {!currentAnswerVerdict.isCorrect && currentAnswerVerdict.correctAnswer && (
            <div className="correct-answer-display">
              <p className="correct-answer-label">Correct answer:</p>
              <p className="correct-answer-text">{currentAnswerVerdict.correctAnswer}</p>
            </div>
          )}

          <div className="verdict-actions">
            <button className="continue-btn" onClick={handleContinueToBoard}>
              Continue to Board
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // For Jeopardy mode, show the board instead of standard question flow
  if (quiz.type === 'jeopardy' && !selectedCell) {
    const categories = getCategories();
    const categoryNames = Array.from(categories.keys());
    const pointValues = [100, 200, 300, 400, 500];

    return (
      <div className="quiz-player">
        <div className="quiz-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((Array.from(revealedCells).length) / (categoryNames.length * pointValues.length)) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {Array.from(revealedCells).length} of {categoryNames.length * pointValues.length} questions answered
          </div>
        </div>

        <motion.div
          className="quiz-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="quiz-title">{quiz.title}</h1>
          <div className="quiz-meta">
            <span className="quiz-type">Jeopardy</span>
            <span className="jeopardy-score">Score: ${jeopardyScore}</span>
          </div>
        </motion.div>

        <div className="jeopardy-board">
          <div className="board-categories">
            {categoryNames.map((categoryName, index) => (
              <motion.div
                key={categoryName}
                className="board-category"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="category-title">{categoryName}</div>
              </motion.div>
            ))}
          </div>

          <div className="board-questions">
            {pointValues.map((points, rowIndex) => (
              <div key={points} className="board-row">
                {categoryNames.map((categoryName, colIndex) => {
                  const cellId = `${categoryName}-${points}`;
                  const isRevealed = revealedCells.has(cellId);
                  const question = getQuestionByCategoryAndPoints(categoryName, points);

                  return (
                    <motion.div
                      key={`cell-${cellId}`}
                      className={`board-cell ${isRevealed ? 'revealed' : 'unrevealed'}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: (rowIndex + colIndex) * 0.05 }}
                      onClick={() => !isRevealed && question && handleCellClick(categoryName, points)}
                    >
                      {!isRevealed ? (
                        <div className="cell-content">
                          <span className="points-value">${points}</span>
                        </div>
                      ) : (
                        <div className="cell-content">
                          <span className="answered-check">✓</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="hint-text">
          Click on a cell to select a question
        </div>
      </div>
    );
  }

  // Get current question based on selected cell in Jeopardy mode, otherwise use currentQuestionIndex
  console.log('selectedCell:', selectedCell);
  console.log('questions array sample:', questions.slice(0, 3).map(q => ({
    id: q.id,
    category: q.category,
    points: q.points,
    hasAnswers: !!q.answers,
    answersCount: q.answers?.length
  })));
  
  const currentQuestion = selectedCell 
    ? getQuestionByCategoryAndPoints(selectedCell.category, selectedCell.points) || questions[currentQuestionIndex]
    : questions[currentQuestionIndex];
    
  // Sync currentQuestionIndex for better state management
  if (selectedCell && currentQuestion) {
    const indexInQuestions = questions.indexOf(currentQuestion);
    if (indexInQuestions !== -1 && indexInQuestions !== currentQuestionIndex) {
      console.log('Syncing currentQuestionIndex from', currentQuestionIndex, 'to', indexInQuestions);
      setCurrentQuestionIndex(indexInQuestions);
    }
  }
  
  console.log('Current question debug:', {
    currentQuestionIndex,
    selectedCell,
    questionExists: !!currentQuestion,
    questionId: currentQuestion?.id,
    questionType: currentQuestion?.type,
    hasAnswers: !!currentQuestion?.answers,
    indexOf: questions.indexOf(currentQuestion),
  }, currentQuestion);
  
  const rawImageUrl = (currentQuestion as any).image_url as string | undefined;
  const rawAudioUrl = (currentQuestion as any).audio_url as string | undefined;
  const imageUrl = resolveMediaUrl(rawImageUrl);
  const audioUrl = resolveMediaUrl(rawAudioUrl);
  const hasImage = !!imageUrl;
  const hasAudio = !!audioUrl;
  const selectedAnswerId = selectedAnswers[currentQuestion.id!];
  const isShortAnswer = currentQuestion.type === 'short_answer';
  
  // More robust logic for checking if question is answered
  const hasAnsweredCurrent = isShortAnswer 
    ? !!(selectedAnswerId && selectedAnswerId.trim() !== '')  // For short answer, must have text
    : !!selectedAnswerId;  // For multiple choice, must have selected an answer

  // Debug logging for state changes
  console.log('=== RENDER DEBUG ===');
  console.log('selectedAnswers:', selectedAnswers);
  console.log('currentQuestion.id:', currentQuestion.id, currentQuestionIndex);
  console.log('selectedAnswerId for current question:', selectedAnswers[currentQuestion.id!]);
  console.log('isShortAnswer:', isShortAnswer);
  console.log('hasAnsweredCurrent:', hasAnsweredCurrent);
  console.log('Button should be disabled:', !hasAnsweredCurrent);
  console.log('===================');

  return (
    <div className="quiz-player">
      {/* Progress Bar - Hidden for Jeopardy when cell is selected */}
      {!(quiz.type === 'jeopardy' && selectedCell) && (
        <div className="quiz-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
        </div>
      )}

      {/* Timer Display */}
      {timerActive && timeRemaining > 0 && (
        <div className="quiz-timer">
          <div className={`timer-display ${timeRemaining <= 10 ? 'timer-warning' : ''}`}>
            <span className="timer-icon">⏱️</span>
            <span className="timer-text">
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* Quiz Header */}
      <motion.div
        className="quiz-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="quiz-title">{quiz.title}</h1>
        <div className="quiz-meta">
          <span className="quiz-type">{quiz.type === 'classic' ? 'Classic Quiz' : 'Jeopardy'}</span>
        </div>
      </motion.div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIndex}
          className="question-container"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <div className={`question-content ${hasAnsweredCurrent ? 'answered' : ''}`}>
            {currentQuestion.question && (
              <div className="question-text">
                {currentQuestion.question}
              </div>
            )}

            {(hasImage || hasAudio) && (
              <div className="question-media">
                {hasImage && imageUrl && (
                  <div className="media-item">
                    <img
                      src={imageUrl}
                      alt="Question"
                      className="question-image"
                    />
                  </div>
                )}
                {hasAudio && audioUrl && (
                  <div className="media-item">
                    <audio
                      controls
                      src={audioUrl}
                      className="question-audio"
                    />
                  </div>
                )}
              </div>
            )}

            {isShortAnswer ? (
              <div className="short-answer-section">
                <label htmlFor="short-answer-input" className="short-answer-label">
                  Your answer
                </label>
                <input
                  id="short-answer-input"
                  type="text"
                  className="short-answer-input"
                  value={selectedAnswerId || ''}
                  onChange={(e) =>
                    setSelectedAnswers(prev => ({
                      ...prev,
                      [currentQuestion.id!]: e.target.value,
                    }))
                  }
                  placeholder="Type your answer here..."
                />
              </div>
            ) : (
              <div className="answers-grid">
                {currentQuestion.answers?.map((answer) => (
                  <motion.button
                    key={answer.id}
                    className={`answer-option ${selectedAnswerId === answer.id ? 'selected' : ''}`}
                    onClick={() => handleAnswerSelect(answer.id!)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="answer-text">{answer.answer}</span>
                  </motion.button>
                ))}
                {selectedAnswerId && (
                  <div className="answer-confirmation-hint">
                    <p>✓ Answer selected! Click "Confirm Answer" to submit.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="question-navigation">
            {quiz.type === 'jeopardy' && selectedCell ? (
              // Jeopardy navigation - only confirmation button
              <div className="jeopardy-navigation">
                <div className="jeopardy-cell-info">
                  <span>{selectedCell.category} - ${selectedCell.points}</span>
                  <span className="jeopardy-score-info">Current Score: ${jeopardyScore}</span>
                </div>
                <button
                  className="nav-btn confirm-btn"
                  onClick={() => {
                    console.log('Confirm button clicked! hasAnsweredCurrent:', hasAnsweredCurrent);
                    handleJeopardyAnswerConfirm();
                  }}
                  disabled={!hasAnsweredCurrent}
                >
                  Confirm Answer
                </button>
              </div>
            ) : (
              // Classic quiz navigation - with confirmation flow
              <>
                <div className="classic-navigation">
                  <div className="question-indicators">
                    {questions.map((_, index) => (
                      <div
                        key={index}
                        className={`question-indicator ${
                          index === currentQuestionIndex ? 'active' :
                          selectedAnswers[questions[index].id!] ? 'answered' : 'unanswered'
                        }`}
                        onClick={() => setCurrentQuestionIndex(index)}
                      />
                    ))}
                  </div>
                  
                  {showClassicVerdict && classicVerdict ? (
                    // Show verdict and next button
                    <div className="classic-verdict-display">
                      <div className={`verdict-result ${classicVerdict.isCorrect ? 'correct' : 'incorrect'}`}>
                        <span className="verdict-icon">
                          {classicVerdict.isCorrect ? '✅' : '❌'}
                        </span>
                        <span className="verdict-text">
                          {classicVerdict.isCorrect ? `Correct! +${classicVerdict.points} points` : 'Incorrect'}
                        </span>
                        {classicVerdict.correctAnswer && !classicVerdict.isCorrect && (
                          <span className="correct-answer-text">
                            Correct answer: {classicVerdict.correctAnswer}
                          </span>
                        )}
                      </div>
                      <button
                        className="nav-btn next-btn"
                        onClick={handleNextQuestion}
                      >
                        {currentQuestionIndex === questions.length - 1 ? 'Finish Quiz' : 'Next →'}
                      </button>
                    </div>
                  ) : (
                    // Show confirm button
                    <button
                      className="nav-btn confirm-btn"
                      onClick={handleClassicAnswerConfirm}
                      disabled={!hasAnsweredCurrent}
                    >
                      Confirm Answer
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
