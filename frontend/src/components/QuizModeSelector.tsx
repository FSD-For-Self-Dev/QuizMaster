import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Quiz } from '../api';
import './QuizModeSelector.css';

export const QuizModeSelector: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedMode, setSelectedMode] = useState<'single' | 'cooperate' | null>(null);

  const quiz = location.state?.quiz as Quiz;

  if (!quiz) {
    return (
      <div className="mode-selector">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>No quiz data found</h3>
          <button className="back-btn" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleModeSelect = (mode: 'single' | 'cooperate') => {
    setSelectedMode(mode);
    
    if (mode === 'single') {
      // Navigate to quiz player for single player mode
      navigate('/quiz', { 
        state: { 
          quiz,
          mode: 'single'
        }
      });
    } else {
      // For cooperate mode, we'll implement QR code generation and room creation
      // This will be the next step in the implementation
      navigate('/cooperate-setup', { 
        state: { 
          quiz,
          mode: 'cooperate'
        }
      });
    }
  };

  const handleBackToDashboard = () => {
    navigate('/');
  };

  return (
    <div className="mode-selector">
      <motion.div
        className="mode-selector-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Quiz Info Header */}
        <motion.div
          className="quiz-info-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="quiz-title">{quiz.title}</h1>
          <div className="quiz-meta">
            <span className="quiz-type-label">
              {quiz.type === 'classic' ? 'Classic Quiz' : 'Jeopardy Board'}
            </span>
            <span className="quiz-questions-count">
              {quiz.questions_count || 0} questions
            </span>
          </div>
          {quiz.description && (
            <p className="quiz-description">{quiz.description}</p>
          )}
        </motion.div>

        {/* Mode Selection */}
        <motion.div
          className="mode-selection"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="selection-title">Choose Game Mode</h2>
          <p className="selection-subtitle">
            How would you like to play this quiz?
          </p>

          <div className="mode-options">
            {/* Single Player Mode */}
            <motion.div
              className={`mode-option ${selectedMode === 'single' ? 'selected' : ''}`}
              onClick={() => handleModeSelect('single')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <div className="mode-icon">🎯</div>
              <div className="mode-content">
                <h3 className="mode-title">Single Player</h3>
                <p className="mode-description">
                  Play the quiz by yourself and see your score and points earned.
                </p>
                <ul className="mode-features">
                  <li>• Complete the quiz at your own pace</li>
                  <li>• See detailed results and review</li>
                  <li>• Track your progress and improvement</li>
                </ul>
              </div>
              <div className="mode-arrow">→</div>
            </motion.div>

            {/* Cooperate Mode */}
            <motion.div
              className={`mode-option cooperate ${selectedMode === 'cooperate' ? 'selected' : ''}`}
              onClick={() => handleModeSelect('cooperate')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <div className="mode-icon">🤝</div>
              <div className="mode-content">
                <h3 className="mode-title">Cooperate</h3>
                <p className="mode-description">
                  Invite friends to join via QR code and complete the quiz together.
                </p>
                <ul className="mode-features">
                  <li>• Share QR code for easy joining</li>
                  <li>• See real-time progress of all players</li>
                  <li>• Compare results and final ratings</li>
                </ul>
                <div className="mode-badge">Coming Soon</div>
              </div>
              <div className="mode-arrow">→</div>
            </motion.div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          className="mode-selector-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          <button 
            className="back-btn secondary"
            onClick={handleBackToDashboard}
          >
            ← Back to Dashboard
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};