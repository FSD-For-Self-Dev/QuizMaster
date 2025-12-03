import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './QuizTypeSelector.css';

interface QuizTypeSelectorProps {
  onSelect: (type: 'classic' | 'jeopardy', title: string, description: string) => void;
  onCancel: () => void;
}

export const QuizTypeSelector: React.FC<QuizTypeSelectorProps> = ({ onSelect, onCancel }) => {
  const [selectedType, setSelectedType] = useState<'classic' | 'jeopardy'>('classic');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSelect(selectedType, title.trim(), description.trim());
    }
  };

  return (
    <div className="quiz-type-selector">
      <motion.div
        className="selector-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="selector-header">
          <h1>Create New Quiz</h1>
          <p>Choose your quiz type and add basic information</p>
        </div>

        <form onSubmit={handleSubmit} className="quiz-creation-form">
          {/* Quiz Type Selection */}
          <div className="form-group">
            <label>Quiz Type</label>
            <div className="type-selection">
              <label className={`type-option ${selectedType === 'classic' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  value="classic"
                  checked={selectedType === 'classic'}
                  onChange={(e) => setSelectedType(e.target.value as 'classic')}
                />
                <div className="type-content">
                  <span className="type-icon">📝</span>
                  <div className="type-info">
                    <h3>Classic Quiz</h3>
                    <p>Multiple choice, true/false, and short answer questions</p>
                  </div>
                </div>
              </label>

              <label className={`type-option ${selectedType === 'jeopardy' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  value="jeopardy"
                  checked={selectedType === 'jeopardy'}
                  onChange={(e) => setSelectedType(e.target.value as 'jeopardy')}
                />
                <div className="type-content">
                  <span className="type-icon">🎯</span>
                  <div className="type-info">
                    <h3>Jeopardy Board</h3>
                    <p>Category-based questions with point values</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Quiz Name */}
          <div className="form-group">
            <label htmlFor="quiz-title">Quiz Name *</label>
            <input
              id="quiz-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter quiz name..."
              required
              className="form-input"
            />
          </div>

          {/* Quiz Description */}
          <div className="form-group">
            <label htmlFor="quiz-description">Description</label>
            <textarea
              id="quiz-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter quiz description (optional)..."
              rows={3}
              className="form-textarea"
            />
          </div>

          {/* Action Buttons */}
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="create-btn" disabled={!title.trim()}>
              Start Building
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
