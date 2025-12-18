import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, Quiz, QuizRound, QuizRoundItem } from '../api';
import './QuizRoundEditor.css';

interface QuizRoundEditorProps {}

export const QuizRoundEditor: React.FC<QuizRoundEditorProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const existingRound = location.state?.quizRound as QuizRound | undefined;

  const [title, setTitle] = useState(existingRound?.title || '');
  const [description, setDescription] = useState(existingRound?.description || '');
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizzes, setSelectedQuizzes] = useState<Array<{quiz: Quiz, order_index: number}>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(existingRound?.title ?? '');
    setDescription(existingRound?.description ?? '');
  }, [existingRound?.id]);

  useEffect(() => {
    const fetchAvailableQuizzes = async () => {
      try {
        setLoading(true);
        const quizzes = await api.getAvailableQuizzesForRound();
        setAvailableQuizzes(quizzes);
        
        // If editing existing round, populate selected quizzes
        if (existingRound && existingRound.round_items) {
          const items = existingRound.round_items.map(item => {
            const quiz = quizzes.find(q => q.id === item.quiz_id);
            return quiz ? { quiz, order_index: item.order_index } : null;
          }).filter(Boolean) as Array<{quiz: Quiz, order_index: number}>;
          setSelectedQuizzes(items);
        }
      } catch (err) {
        console.error('Failed to fetch available quizzes:', err);
        setError('Failed to load available quizzes');
      } finally {
        setLoading(false);
      }
    };

    fetchAvailableQuizzes();
  }, [existingRound]);

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    if (error) setError(null);
  };

  const onDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    if (error) setError(null);
  };

  const handleAddQuiz = (quiz: Quiz) => {
    if (selectedQuizzes.find(item => item.quiz.id === quiz.id)) {
      return; // Quiz already added
    }
    
    const newOrderIndex = selectedQuizzes.length;
    setSelectedQuizzes([...selectedQuizzes, { quiz, order_index: newOrderIndex }]);
  };

  const handleRemoveQuiz = (quizId: string) => {
    setSelectedQuizzes(selectedQuizzes.filter(item => item.quiz.id !== quizId));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    
    const newSelectedQuizzes = [...selectedQuizzes];
    const temp = newSelectedQuizzes[index];
    newSelectedQuizzes[index] = newSelectedQuizzes[index - 1];
    newSelectedQuizzes[index - 1] = temp;
    
    // Update order indices
    newSelectedQuizzes.forEach((item, i) => {
      item.order_index = i;
    });
    
    setSelectedQuizzes(newSelectedQuizzes);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedQuizzes.length - 1) return;
    
    const newSelectedQuizzes = [...selectedQuizzes];
    const temp = newSelectedQuizzes[index];
    newSelectedQuizzes[index] = newSelectedQuizzes[index + 1];
    newSelectedQuizzes[index + 1] = temp;
    
    // Update order indices
    newSelectedQuizzes.forEach((item, i) => {
      item.order_index = i;
    });
    
    setSelectedQuizzes(newSelectedQuizzes);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title for the quiz round');
      return;
    }

    if (selectedQuizzes.length === 0) {
      setError('Please add at least one quiz to the round');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const roundData = {
        title: title.trim(),
        description: description.trim() || undefined,
        round_items: selectedQuizzes.map(item => ({
          quiz_id: item.quiz.id!,
          order_index: item.order_index
        }))
      };

      if (existingRound) {
        // For editing, we would need an update method
        // For now, let's just navigate back
        console.log('Update functionality not implemented yet');
        navigate('/');
      } else {
        await api.createQuizRound(roundData);
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to save quiz round:', err);
      setError('Failed to save quiz round. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="quiz-round-editor">
        <div className="loading-state">
          <div className="loading-spinner">⟳</div>
          <p>Loading available quizzes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-round-editor">
      <motion.div
        className="editor-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <button className="back-btn" onClick={handleCancel}>
          ← Back to Dashboard
        </button>
        <h1>{existingRound ? 'Edit Quiz Round' : 'Create Quiz Round'}</h1>
      </motion.div>

      <div className="editor-content">
        <motion.div
          className="basic-info-section"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2>Basic Information</h2>
          
          <div className="form-group_grey">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              value={title}
              disabled={saving}
              onChange={onTitleChange}
              placeholder="Enter quiz round title"
              maxLength={100}
            />
          </div>

          <div className="form-group_grey">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              disabled={saving}
              onChange={onDescriptionChange}
              placeholder="Enter a description for this quiz round"
              rows={3}
              maxLength={500}
            />
          </div>
        </motion.div>

        <motion.div
          className="quizzes-selection-section"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h2>Select Quizzes for Round ({selectedQuizzes.length})</h2>
          
          <div className="quizzes-container">
            <div className="available-quizzes">
              <h3>Available Quizzes</h3>
              <div className="quizzes-list">
                {availableQuizzes.map(quiz => (
                  <div key={quiz.id} className="quiz-item">
                    <div className="quiz-info">
                      <h4>{quiz.title}</h4>
                      <p className="quiz-type">{quiz.type === 'classic' ? 'Classic Quiz' : 'Jeopardy Board'}</p>
                      <p className="quiz-questions">Questions: {quiz.questions_count}</p>
                      {quiz.description && <p className="quiz-description">{quiz.description}</p>}
                    </div>
                    <button
                      className="add-quiz-btn"
                      onClick={() => handleAddQuiz(quiz)}
                      disabled={selectedQuizzes.find(item => item.quiz.id === quiz.id) !== undefined}
                    >
                      Add to Round
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="selected-quizzes">
              <h3>Selected Quizzes (in order)</h3>
              {selectedQuizzes.length === 0 ? (
                <div className="empty-state">
                  <p>No quizzes selected yet. Add quizzes from the left to create your round.</p>
                </div>
              ) : (
                <div className="selected-quizzes-list">
                  {selectedQuizzes.map((item, index) => (
                    <motion.div
                      key={item.quiz.id}
                      className="selected-quiz-item"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                    >
                      <div className="quiz-order">{index + 1}</div>
                      <div className="quiz-info">
                        <h4>{item.quiz.title}</h4>
                        <p className="quiz-type">{item.quiz.type === 'classic' ? 'Classic Quiz' : 'Jeopardy Board'}</p>
                        <p className="quiz-questions">Questions: {item.quiz.questions_count}</p>
                      </div>
                      <div className="quiz-actions">
                        <button
                          className="move-up-btn"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="move-down-btn"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === selectedQuizzes.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          className="remove-quiz-btn"
                          onClick={() => handleRemoveQuiz(item.quiz.id!)}
                        >
                          ✕
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {error && (
          <motion.div
            className="error-message"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        )}

        <motion.div
          className="editor-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving || !title.trim() || selectedQuizzes.length === 0}
          >
            {saving ? 'Saving...' : (existingRound ? 'Update Round' : 'Create Round')}
          </button>
        </motion.div>
      </div>
    </div>
  );
};