import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { api, Quiz, QuizRound } from '../api';
import { Header } from './Header';
import './Dashboard.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [recentQuizzes, setRecentQuizzes] = useState<Quiz[]>([]);
  const [quizRounds, setQuizRounds] = useState<QuizRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openRoundMenuId, setOpenRoundMenuId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [quizzes, rounds] = await Promise.all([
          api.getQuizzes(),
          api.getQuizRounds()
        ]);
        setRecentQuizzes(quizzes);
        setQuizRounds(rounds);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCreateQuiz = (type: 'classic' | 'jeopardy') => {
    navigate('/editor');
  };

  const handleCreateQuizRound = () => {
    navigate('/quiz-round-editor');
  };

  const handleEditQuiz = (quiz: Quiz) => {
    navigate('/editor', { state: { quiz } });
  };

  const handleEditQuizRound = (quizRound: QuizRound) => {
    navigate('/quiz-round-editor', { state: { quizRound } });
  };

  const handlePlayQuiz = (quiz: Quiz) => {
    navigate('/play', { state: { quiz } });
  };

  const handlePlayQuizRound = async (round: QuizRound) => {
    console.log('PLAY ROUND click', round.id);

    // 1) create room for round
    const created = await api.createRoomForQuizRound(round.id as string, 50);

    // 2) go to existing lobby UI
    navigate('/cooperate-setup', {
      state: {
        isJoining: false,
        backendRoomId: created.id,   // backend rooms.id
        quizRound: {
          id: round.id,
          title: round.title,
          description: round.description,
        },
      },
    });
  };

  const handleDeleteQuiz = async (quiz: Quiz) => {
    if (window.confirm(`Are you sure you want to delete "${quiz.title}"? This action cannot be undone.`)) {
      try {
        console.log('Deleting quiz:', quiz.id, quiz.title);
        await api.deleteQuiz(quiz.id!);
        console.log('Quiz deleted successfully');
        setRecentQuizzes(prev => prev.filter(q => q.id !== quiz.id));
        setOpenMenuId(null);
      } catch (error) {
        console.error('Failed to delete quiz:', error);
        console.error('Quiz data:', quiz);
        alert(`Backend not available`);
      }
    }
  };

  const handleDeleteQuizRound = async (quizRound: QuizRound) => {
    if (window.confirm(`Are you sure you want to delete "${quizRound.title}"? This action cannot be undone.`)) {
      try {
        console.log('Deleting quiz round:', quizRound.id, quizRound.title);
        await api.deleteQuizRound(quizRound.id!);
        console.log('Quiz round deleted successfully');
        setQuizRounds(prev => prev.filter(r => r.id !== quizRound.id));
        setOpenRoundMenuId(null);
      } catch (error) {
        console.error('Failed to delete quiz round:', error);
        console.error('Quiz round data:', quizRound);
        alert(`Backend not available`);
      }
    }
  };

  const toggleMenu = (quizId: string) => {
    setOpenMenuId(openMenuId === quizId ? null : quizId);
  };

  const toggleRoundMenu = (roundId: string) => {
    setOpenRoundMenuId(openRoundMenuId === roundId ? null : roundId);
  };

  React.useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
      setOpenRoundMenuId(null);
    };

    if (openMenuId || openRoundMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId, openRoundMenuId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <Header user={user} onLogout={handleLogout} />

      <motion.main
        className="dashboard-main"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <div className="dashboard-section">
          <div className="quizzes-header">
            <div className="header-content">
              <h2 className="section-title">My quizzes</h2>
              <p className="section-caption">Manage and host your game shows.</p>
            </div>
            <motion.button
              className="create-new-quiz-btn"
              onClick={() => handleCreateQuiz('classic')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <span className="plus-icon">+</span>
              Create new Quiz
            </motion.button>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner">⟳</div>
              <p>Loading quizzes...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <h3>Failed to load quizzes</h3>
              <p>{error}</p>
            </div>
          ) : (
            <motion.div
              className="quizzes-grid"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1 }}
            >
              {recentQuizzes.map((quiz, index) => (
                <motion.div
                  key={quiz.id}
                  className="quiz-card"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePlayQuiz(quiz)}
                >
                  <div className="quiz-card-header">
                    <div className="quiz-type-label">
                      {quiz.type === 'classic' ? 'Classic Quiz' : 'Jeopardy Board'}
                    </div>
                    <div className="quiz-meta">
                      <span className="quiz-date">
                        {new Date(quiz.updated_at as string).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="quiz-card-content">
                    <div className="title-row">
                      <h3 className="quiz-card-title">{quiz.title}</h3>
                      <div className="menu-container">
                        <button className="menu-btn" onClick={(e) => { e.stopPropagation(); toggleMenu(quiz.id!); }}>
                          ⋮
                        </button>
                        {openMenuId === quiz.id && (
                          <div className="dropdown-menu">
                            <button className="dropdown-item delete-item" onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(quiz); }}>
                              🗑️ Delete Quiz
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="quiz-description">
                      {quiz.description || 'No description'}
                    </p>
                    <div className="quiz-stats">
                      <span className="quiz-questions">
                        Questions: {quiz.questions_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="quiz-card-actions">
                    <button className="play-btn" onClick={(e) => { e.stopPropagation(); handlePlayQuiz(quiz); }}>Play Quiz</button>
                    <button className="edit-btn" onClick={(e) => { e.stopPropagation(); handleEditQuiz(quiz); }}>Edit Quiz</button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Quiz Rounds Section */}
        <div className="dashboard-section">
          <div className="quizzes-header">
            <div className="header-content">
              <h2 className="section-title">My quiz rounds</h2>
              <p className="section-caption">Create multi-round quiz experiences.</p>
            </div>
            <motion.button
              className="create-new-quiz-btn quiz-round-btn"
              onClick={handleCreateQuizRound}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <span className="plus-icon">+</span>
              Create new Quiz Round
            </motion.button>
          </div>

          {quizRounds.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎯</div>
              <h3>No quiz rounds yet</h3>
              <p>Create your first quiz round to combine multiple quizzes into one exciting experience!</p>
              <button className="create-first-btn" onClick={handleCreateQuizRound}>
                Create Quiz Round
              </button>
            </div>
          ) : (
            <motion.div
              className="quizzes-grid"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1 }}
            >
              {quizRounds.map((quizRound, index) => (
                <motion.div
                  key={quizRound.id}
                  className="quiz-card quiz-round-card"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePlayQuizRound(quizRound)}
                >
                  <div className="quiz-card-header">
                    <div className="quiz-type-label quiz-round-label">
                      Quiz Round • {quizRound.round_items.length} round{quizRound.round_items.length !== 1 ? 's' : ''}
                    </div>
                    <div className="quiz-meta">
                      <span className="quiz-date">
                        {new Date(quizRound.updated_at as string).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="quiz-card-content">
                    <div className="title-row">
                      <h3 className="quiz-card-title">{quizRound.title}</h3>
                      <div className="menu-container">
                        <button className="menu-btn" onClick={(e) => { e.stopPropagation(); toggleRoundMenu(quizRound.id!); }}>
                          ⋮
                        </button>
                        {openRoundMenuId === quizRound.id && (
                          <div className="dropdown-menu">
                            <button className="dropdown-item delete-item" onClick={(e) => { e.stopPropagation(); handleDeleteQuizRound(quizRound); }}>
                              🗑️ Delete Quiz Round
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="quiz-description">
                      {quizRound.description || 'No description'}
                    </p>
                    <div className="quiz-stats">
                      <span className="quiz-questions">
                        Rounds: {quizRound.round_items.length}
                      </span>
                      <span className="quiz-rounds-list">
                        {quizRound.round_items.slice(0, 3).map(item => item.quiz_title).join(', ')}
                        {quizRound.round_items.length > 3 && ` +${quizRound.round_items.length - 3} more`}
                      </span>
                    </div>
                  </div>
                  <div className="quiz-card-actions">
                    <button
                      type="button"
                      className="play-btn"
                      onClick={(e) => { e.stopPropagation(); handlePlayQuizRound(quizRound); }}
                    >
                      Play Round
                    </button>
                    <button className="edit-btn" onClick={(e) => { e.stopPropagation(); handleEditQuizRound(quizRound); }}>Edit Round</button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.main>
    </div>
  );
};
