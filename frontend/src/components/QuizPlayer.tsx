import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, Quiz, Question, Answer } from '../api';
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
  const [selectedAnswers, setSelectedAnswers] = useState<{ [questionId: string]: string }>({});
  const [gameAnswers, setGameAnswers] = useState<GameAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);

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
    const currentQuestion = questions[currentQuestionIndex];
    const selectedAnswer = currentQuestion.answers?.find(a => a.id === answerId);
    const timeTaken = Date.now() - questionStartTime;

    if (selectedAnswer) {
      setSelectedAnswers(prev => ({
        ...prev,
        [currentQuestion.id!]: answerId
      }));

      setGameAnswers(prev => [...prev, {
        question_id: currentQuestion.id!,
        answer_id: answerId,
        is_correct: selectedAnswer.is_correct,
        time_taken: timeTaken
      }]);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setQuestionStartTime(Date.now());
    } else {
      finishQuiz();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setQuestionStartTime(Date.now());
    }
  };

  const finishQuiz = async () => {
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

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setGameAnswers([]);
    setShowResults(false);
    setStartTime(Date.now());
    setQuestionStartTime(Date.now());
  };

  const handleBackToDashboard = () => {
    navigate('/');
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
    const score = calculateScore();
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
              <div className="score-circle">
                <span className="score-number">{score}</span>
                <span className="score-percent">%</span>
              </div>
            </div>
          </div>

          <div className="results-stats">
            <div className="stat">
              <span className="stat-label">Questions</span>
              <span className="stat-value">{questions.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Correct</span>
              <span className="stat-value">{gameAnswers.filter(a => a.is_correct).length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Time</span>
              <span className="stat-value">{Math.floor(totalTime / 60)}:{(totalTime % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>

          <div className="question-review">
            <h3>Question Review</h3>
            {questions.map((question, index) => {
              const userAnswer = gameAnswers.find(a => a.question_id === question.id);
              const correctAnswer = question.answers?.find(a => a.is_correct);
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
                    {!isCorrect && correctAnswer && (
                      <span className="correct-answer">
                        Correct: {correctAnswer.answer}
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

  const currentQuestion = questions[currentQuestionIndex];
  const selectedAnswerId = selectedAnswers[currentQuestion.id!];

  return (
    <div className="quiz-player">
      {/* Progress Bar */}
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
          <div className="question-content">
            <div className="question-text">
              {currentQuestion.question}
            </div>

            <div className="answers-grid">
              {currentQuestion.answers?.map((answer) => (
                <motion.button
                  key={answer.id}
                  className={`answer-option ${selectedAnswerId === answer.id ? 'selected' : ''}`}
                  onClick={() => handleAnswerSelect(answer.id!)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={!!selectedAnswerId}
                >
                  <span className="answer-text">{answer.answer}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="question-navigation">
            <button
              className="nav-btn previous-btn"
              onClick={handlePreviousQuestion}
              disabled={currentQuestionIndex === 0}
            >
              ← Previous
            </button>

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

            <button
              className="nav-btn next-btn"
              onClick={handleNextQuestion}
              disabled={!selectedAnswerId}
            >
              {currentQuestionIndex === questions.length - 1 ? 'Finish Quiz' : 'Next →'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
