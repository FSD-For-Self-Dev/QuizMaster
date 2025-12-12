import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question } from './QuizEditor';
import { JeopardyCategoryEditor } from './JeopardyCategoryEditor';
import { resolveMediaUrl } from '../api';
import './JeopardyBoardEditor.css';

interface JeopardyBoardEditorProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
}

export const JeopardyBoardEditor: React.FC<JeopardyBoardEditorProps> = ({
  questions,
  onQuestionsChange
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Group questions by category
  const categories = React.useMemo(() => {
    const categoryMap = new Map<string, Question[]>();
    questions.forEach(question => {
      const category = question.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(question);
    });
    return categoryMap;
  }, [questions]);

  const addCategory = () => {
    const categoryName = prompt('Enter category name:');
    if (categoryName && !categories.has(categoryName)) {
      // Add a placeholder question to create the category
      const newQuestion: Question = {
        id: Date.now().toString(),
        question: '',
        type: 'jeopardy',
        category: categoryName,
        points: 100,
        order_index: questions.length,
        answers: [{
          answer: '',
          is_correct: true,
          order_index: 0
        }]
      };
      onQuestionsChange([...questions, newQuestion]);
    }
  };

  const updateCategoryName = (oldName: string, newName: string) => {
    if (oldName !== newName && !categories.has(newName)) {
      const updatedQuestions = questions.map(q =>
        q.category === oldName ? { ...q, category: newName } : q
      );
      onQuestionsChange(updatedQuestions);
    }
  };

  const deleteCategory = (categoryName: string) => {
    if (confirm(`Are you sure you want to delete the "${categoryName}" category and all its questions?`)) {
      onQuestionsChange(questions.filter(q => q.category !== categoryName));
    }
  };

  const updateQuestions = (categoryName: string, newQuestions: Question[]) => {
    const otherQuestions = questions.filter(q => q.category !== categoryName);
    onQuestionsChange([...otherQuestions, ...newQuestions]);
  };

  const saveQuestion = (question: Question) => {
    const existingIndex = questions.findIndex(q => q.id === question.id);
    let updatedQuestions;

    if (existingIndex >= 0) {
      // Update existing question
      updatedQuestions = [...questions];
      updatedQuestions[existingIndex] = question;
    } else {
      // Add new question
      const newQuestion = { ...question, id: Date.now().toString() };
      updatedQuestions = [...questions, newQuestion];
    }

    onQuestionsChange(updatedQuestions);
    setEditingQuestion(null);
  };

  const openQuestionEditor = (categoryName: string, points: number) => {
    const categoryQuestions = categories.get(categoryName) || [];
    const existingQuestion = categoryQuestions.find(q => q.points === points);
    
    if (existingQuestion) {
      setEditingQuestion(existingQuestion);
    } else {
      const newQuestion: Question = {
        question: '',
        type: 'multiple_choice',
        category: categoryName,
        points,
        order_index: questions.length,
        answers: []
      };
      setEditingQuestion(newQuestion);
    }
  };

  // Generate Jeopardy board layout (typically 6 categories × 5 questions)
  const renderBoard = () => {
    const categoryNames = Array.from(categories.keys());
    const pointValues = [100, 200, 300, 400, 500];

    return (
      <div className="jeopardy-board">
        <div className="board-categories">
          {categoryNames.slice(0, 6).map((categoryName, index) => (
            <motion.div
              key={categoryName}
              className="board-category"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedCategory(categoryName)}
            >
              <div className="category-title">{categoryName}</div>
            </motion.div>
          ))}
          {categoryNames.length < 6 && (
            <motion.div
              className="board-category add-category"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              onClick={addCategory}
            >
              <div className="add-category-icon">+</div>
              <div className="add-category-text">Add Category</div>
            </motion.div>
          )}
        </div>

        <div className="board-questions">
          {pointValues.map((points, rowIndex) => (
            <div key={points} className="board-row">
              {categoryNames.slice(0, 6).map((categoryName, colIndex) => {
                const categoryQuestions = categories.get(categoryName) || [];
                const question = categoryQuestions.find(q => q.points === points);

                return (
                  <motion.div
                    key={`${categoryName}-${points}`}
                    className={`board-cell ${question ? 'filled' : 'empty'}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (rowIndex + colIndex) * 0.05 }}
                    onClick={() => openQuestionEditor(categoryName, points)}
                  >
                    {question ? (
                      <div className="cell-content">
                        <span className="points-value">${points}</span>
                      </div>
                    ) : (
                      <div className="cell-content empty">
                        <span className="empty-indicator">Empty</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="jeopardy-board-editor">
      <div className="editor-section-header">
        <h2>Jeopardy Board</h2>
        <div className="board-stats">
          <span>{categories.size} Categories</span>
          <span>{questions.length} Questions</span>
        </div>
      </div>

      {renderBoard()}

      <AnimatePresence>
        {selectedCategory && (
          <JeopardyCategoryEditor
            key={selectedCategory}
            categoryName={selectedCategory}
            questions={categories.get(selectedCategory) || []}
            onUpdate={(newQuestions) => updateQuestions(selectedCategory, newQuestions)}
            onRename={(newName) => updateCategoryName(selectedCategory, newName)}
            onDelete={() => deleteCategory(selectedCategory)}
            onClose={() => setSelectedCategory(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingQuestion && (
          <JeopardyQuestionModal
            key={editingQuestion.id}
            question={editingQuestion}
            categoryName={editingQuestion.category || 'Unknown'}
            onSave={saveQuestion}
            onCancel={() => setEditingQuestion(null)}
          />
        )}
      </AnimatePresence>

      <div className="board-instructions">
        <h3>How to Build Your Jeopardy Board:</h3>
        <ol>
          <li>Click "Add Category" to create up to 6 categories</li>
          <li>Click on any category title to edit the entire category</li>
          <li>Click on any question cell to edit that specific question directly</li>
          <li>Each category should have 5 questions with increasing point values (100, 200, 300, 400, 500)</li>
          <li>Questions should be written as answers, with the question being the clue</li>
        </ol>
      </div>
    </div>
  );
};

// Question Editor Modal Component (copied and adapted from JeopardyCategoryEditor)
interface JeopardyQuestionModalProps {
  question: Question;
  categoryName: string;
  onSave: (question: Question) => void;
  onCancel: () => void;
}

const JeopardyQuestionModal: React.FC<JeopardyQuestionModalProps> = ({
  question,
  categoryName,
  onSave,
  onCancel
}) => {
  console.log('???x2', question)
  const [editedQuestion, setEditedQuestion] = useState<Question>(question);

  const getInitialMediaTab = (question: Question): 'none' | 'image' | 'audio' | 'several' => {
    const hasImage = !!question.image_url;
    const hasAudio = !!question.audio_url;

    if (hasImage && hasAudio) return 'several';
    if (hasImage) return 'image';
    if (hasAudio) return 'audio';
    return 'none';
  };

  const [selectedMediaTab, setSelectedMediaTab] = useState<'none' | 'image' | 'audio' | 'several'>(
    getInitialMediaTab(question)
  );

  const handleTypeChange = (type: Question['type']) => {
    setEditedQuestion(prev => ({ ...prev, type }));
  };

  const addAnswer = () => {
    const newAnswer = {
      answer: '',
      is_correct: false,
      order_index: editedQuestion.answers?.length || 0
    };
    setEditedQuestion(prev => ({
      ...prev,
      answers: [...(prev.answers || []), newAnswer]
    }));
  };

  const updateAnswer = (index: number, answer: any) => {
    setEditedQuestion(prev => ({
      ...prev,
      answers: prev.answers?.map((a, i) => (i === index ? answer : a))
    }));
  };

  const deleteAnswer = (index: number) => {
    setEditedQuestion(prev => ({
      ...prev,
      answers: prev.answers?.filter((_, i) => i !== index)
    }));
  };

  const handleSave = () => {
    onSave(editedQuestion);
  };

  const updateQuestion = (updates: Partial<Question>) => {
    setEditedQuestion(prev => ({
      ...prev,
      ...updates
    }));
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);

    updateQuestion({
      audio: file,
      audio_url: objectUrl,
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);

    updateQuestion({
      image: file,
      image_url: objectUrl,
    });
  };

  const isSaveDisabled = () => {
    if (editedQuestion.type === 'multiple_choice') {
      const answers = editedQuestion.answers || [];
      const hasAnswers = answers.length > 0;
      const hasCorrectAnswer = answers.some(answer => answer.is_correct);
      return !hasAnswers || !hasCorrectAnswer;
    } else if (editedQuestion.type === 'short_answer') {
      return (!editedQuestion.correct_answer || editedQuestion.correct_answer.trim() === '') && !editedQuestion.answers?.at(0)?.answer;
    }
    return false;
  };

  return (
    <div className="question-modal-overlay">
      <motion.div
        className="question-editor-modal"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
      >
        <div className="modal-header">
          <h2>{question.id ? 'Edit Question' : 'Create Question'} - {categoryName}</h2>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="modal-content">
          <div className="form-group">
            <label>Question Type</label>
            <div className="type-selector">
              {(['multiple_choice', 'short_answer'] as const).map(type => (
                <button
                  key={type}
                  className={`type-btn ${editedQuestion.type === type ? 'active' : ''}`}
                  onClick={() => handleTypeChange(type)}
                >
                  {type.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Question</label>
            <textarea
              value={editedQuestion.question}
              onChange={(e) => setEditedQuestion(prev => ({ ...prev, question: e.target.value }))}
              placeholder="Enter your question..."
              className="question-textarea"
              rows={3}
            />
          </div>

          {/* Question Media Section */}
          <div className="form-group">
            <label>Question Media (Optional)</label>

            <div className="media-tabs">
              {[
                { id: 'none', label: 'None', icon: '🚫' },
                { id: 'image', label: 'Image', icon: '📷' },
                { id: 'audio', label: 'Audio', icon: '🎵' },
                { id: 'several', label: 'Several', icon: '📎' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`media-tab ${selectedMediaTab === tab.id ? 'active' : ''}`}
                  onClick={() => setSelectedMediaTab(tab.id as any)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {selectedMediaTab !== 'none' && (
              <div className="media-inputs-section">
                {(selectedMediaTab === 'image' || selectedMediaTab === 'several') && (
                  <div className="media-input-group">
                    <label className="media-label">Image</label>
                    <div className="media-controls">
                      <input
                        type="url"
                        placeholder="Enter image URL..."
                        className="media-url-input"
                        onChange={(e) => setEditedQuestion(prev => ({ ...prev, image_url: e.target.value }))}
                        value={editedQuestion.image_url?.startsWith('data:') ? '' : (editedQuestion.image_url || '')}
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e)}
                        style={{ display: 'none' }}
                        id="board-editor-question-image"
                      />
                      <label htmlFor="board-editor-question-image" className="media-upload-btn">
                        📷 Upload
                      </label>
                    </div>
                    {editedQuestion.image_url && (
                      <div className="media-preview">
                        <img src={resolveMediaUrl(editedQuestion.image_url)} alt="Question" className="question-preview-image" />
                        <button
                          type="button"
                          className="media-delete-btn"
                          onClick={() => setEditedQuestion(prev => ({ ...prev, image_url: undefined }))}
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(selectedMediaTab === 'audio' || selectedMediaTab === 'several') && (
                  <div className="media-input-group">
                    <label className="media-label">Audio</label>
                    <div className="media-controls">
                      <input
                        type="url"
                        placeholder="Enter audio URL..."
                        className="media-url-input"
                        onChange={(e) => setEditedQuestion(prev => ({ ...prev, audio_url: e.target.value }))}
                        value={editedQuestion.audio_url?.startsWith('data:') ? '' : (editedQuestion.audio_url || '')}
                      />
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => handleAudioChange(e)}
                        style={{ display: 'none' }}
                        id="board-editor-question-audio"
                      />
                      <label htmlFor="board-editor-question-audio" className="media-upload-btn">
                        🎵 Upload
                      </label>
                    </div>
                    {editedQuestion.audio_url && (
                      <div className="media-preview">
                        <audio controls src={resolveMediaUrl(editedQuestion.audio_url)} className="question-preview-audio" />
                        <button
                          type="button"
                          className="media-delete-btn"
                          onClick={() => setEditedQuestion(prev => ({ ...prev, audio_url: undefined }))}
                          title="Remove audio"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {editedQuestion.type === 'multiple_choice' && (
            <div className="answers-section">
              <div className="answers-header">
                <h3>Answer Options</h3>
                <button className="add-answer-btn" onClick={addAnswer}>
                  + Add Answer
                </button>
              </div>

              <div className="answers-list">
                {editedQuestion.answers?.map((answer, index) => (
                  <AnswerEditor
                    key={index}
                    answer={answer}
                    index={index}
                    questionType={editedQuestion.type}
                    onChange={(updatedAnswer) => updateAnswer(index, updatedAnswer)}
                    onDelete={() => deleteAnswer(index)}
                  />
                ))}
              </div>
            </div>
          )}

          {editedQuestion.type === 'short_answer' && (
            <div className="correct-answer-section">
              <div className="form-group">
                <label htmlFor="board-editor-correct-answer">Correct Answer</label>
                <input
                  id="board-editor-correct-answer"
                  type="text"
                  value={editedQuestion.correct_answer || editedQuestion.answers?.at(0)?.answer}
                  onChange={(e) => setEditedQuestion(prev => ({ ...prev, correct_answer: e.target.value }))}
                  placeholder="Enter the correct answer..."
                  className="correct-answer-input"
                />
              </div>
            </div>
          )}

          <div className="points-section">
            <label>Points</label>
            <input
              type="number"
              value={editedQuestion.points || 10}
              onChange={(e) => setEditedQuestion(prev => ({ ...prev, points: parseInt(e.target.value) }))}
              className="points-input"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="save-btn" onClick={handleSave} disabled={isSaveDisabled()}>
            Save Question
          </button>
        </div>
      </motion.div>
    </div>
  );
};

interface AnswerEditorProps {
  answer: any;
  index: number;
  questionType: Question['type'];
  onChange: (answer: any) => void;
  onDelete: () => void;
}

const AnswerEditor: React.FC<AnswerEditorProps> = ({
  answer,
  index,
  questionType,
  onChange,
  onDelete
}) => {
  return (
    <div className="answer-editor">
      {questionType === 'multiple_choice' && (
        <>
          <input
            type="radio"
            name="board-editor-correct-answer"
            checked={answer.is_correct}
            onChange={(e) => onChange({ ...answer, is_correct: e.target.checked })}
            className="correct-radio"
          />
          <input
            type="text"
            value={answer.answer}
            onChange={(e) => onChange({ ...answer, answer: e.target.value })}
            placeholder={`Answer option ${index + 1}`}
            className="answer-input"
          />
        </>
      )}
      <button className="delete-answer-btn" onClick={onDelete}>×</button>
    </div>
  );
};
