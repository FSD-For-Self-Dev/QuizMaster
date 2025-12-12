import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { api, Quiz } from '../api';
import { Header } from './Header';
import './Dashboard.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [recentQuizzes, setRecentQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecentQuizzes = async () => {
      try {
        setLoading(true);
        setError(null);
        const quizzes = await api.getQuizzes();
        setRecentQuizzes(quizzes);
      } catch (err) {
        console.error('Failed to fetch quizzes:', err);
        setError('Failed to load recent quizzes');
      } finally {
        setLoading(false);
      }
    };

    fetchRecentQuizzes();
  }, []);

  const handleCreateQuiz = (type: 'classic' | 'jeopardy') => {
    // For now, navigate to editor with type selection
    // Later we can pass the type as a query parameter or state
    navigate('/editor');
  };

  const handleEditQuiz = (quiz: Quiz) => {
    // Navigate to editor with the existing quiz data
    navigate('/editor', { state: { quiz } });
  };

  const handlePlayQuiz = (quiz: Quiz) => {
    // Navigate to quiz player with the quiz data
    navigate('/play', { state: { quiz } });
  };

  const handleDeleteQuiz = async (quiz: Quiz) => {
    if (window.confirm(`Are you sure you want to delete "${quiz.title}"? This action cannot be undone.`)) {
      try {
        console.log('Deleting quiz:', quiz.id, quiz.title);
        await api.deleteQuiz(quiz.id!);
        console.log('Quiz deleted successfully');
        setRecentQuizzes(prev => prev.filter(q => q.id !== quiz.id));
        setOpenMenuId(null); // Close menu after deletion
      } catch (error) {
        console.error('Failed to delete quiz:', error);
        console.error('Quiz data:', quiz);

        alert(`Backend not available`);
      }
    }
  };

  const toggleMenu = (quizId: string) => {
    setOpenMenuId(openMenuId === quizId ? null : quizId);
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };

    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

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
      </motion.main>
    </div>
  );
};
