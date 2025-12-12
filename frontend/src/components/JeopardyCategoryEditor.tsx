import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question, Answer } from './QuizEditor';
import { resolveMediaUrl } from '../api';
import './JeopardyCategoryEditor.css';

interface JeopardyCategoryEditorProps {
  categoryName: string;
  questions: Question[];
  onUpdate: (questions: Question[]) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const JeopardyCategoryEditor: React.FC<JeopardyCategoryEditorProps> = ({
  categoryName,
  questions,
  onUpdate,
  onRename,
  onDelete,
  onClose
}) => {
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(categoryName);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const pointValues = [100, 200, 300, 400, 500];

  const getQuestionByPoints = (points: number) => {
    return questions.find(q => q.points === points);
  };

  const saveName = () => {
    if (tempName.trim() && tempName !== categoryName) {
      onRename(tempName.trim());
    }
    setEditingName(false);
  };

  const addOrEditQuestion = (points: number) => {
    const existingQuestion = getQuestionByPoints(points);
    if (existingQuestion) {
      setEditingQuestion(existingQuestion);
    } else {
      const newQuestion: Question = {
        question: '',
        // Default to multiple choice; user can change type in modal
        type: 'multiple_choice',
        category: categoryName,
        points,
        order_index: questions.length,
        answers: []
      };
      setEditingQuestion(newQuestion);
    }
  };

  const saveQuestion = (question: Question) => {
    const existingIndex = questions.findIndex(q => q.points === question.points);
    let updatedQuestions;

    if (existingIndex >= 0) {
      // Update existing question
      updatedQuestions = [...questions];
      updatedQuestions[existingIndex] = { ...question, id: questions[existingIndex].id };
    } else {
      // Add new question
      const newQuestion = { ...question, id: Date.now().toString() };
      updatedQuestions = [...questions, newQuestion];
    }

    onUpdate(updatedQuestions);
    setEditingQuestion(null);
  };

  const deleteQuestion = (points: number) => {
    const updatedQuestions = questions.filter(q => q.points !== points);
    onUpdate(updatedQuestions);
  };

  return (
    <div className="category-editor-overlay">
      <motion.div
        className="category-editor-modal"
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <div className="editor-header">
          <div className="category-title-section">
            {editingName ? (
              <div className="name-editor">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveName()}
                  autoFocus
                  className="category-name-input"
                />
                <button onClick={saveName} className="save-name-btn">✓</button>
                <button onClick={() => setEditingName(false)} className="cancel-name-btn">×</button>
              </div>
            ) : (
              <h2 onClick={() => setEditingName(true)} className="category-title">
                {categoryName}
              </h2>
            )}
          </div>

          <div className="header-actions">
            <button onClick={onDelete} className="delete-category-btn">
              Delete Category
            </button>
            <button onClick={onClose} className="close-editor-btn">×</button>
          </div>
        </div>

        <div className="questions-grid">
          {pointValues.map((points) => {
            const question = getQuestionByPoints(points);

            return (
              <motion.div
                key={points}
                className={`question-slot ${question ? 'filled' : 'empty'}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addOrEditQuestion(points)}
              >
                <div className="slot-header">
                  <span className="points-value">${points}</span>
                  {question && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteQuestion(points);
                      }}
                      className="delete-question-btn"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="slot-content">
                  {question ? (
                    <div className="question-preview">
                      <div className="question-text">
                        {question.question || 'Click to edit question...'}
                      </div>
                      <div className="answer-preview">
                        Answer: {question.answers?.[0]?.answer || 'Not set'}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-slot">
                      <div className="empty-icon">+</div>
                      <div className="empty-text">Add Question</div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="editor-stats">
          <span>{questions.length}/5 questions completed</span>
        </div>
      </motion.div>

      <AnimatePresence>
        {editingQuestion && (
          <JeopardyQuestionModal
            key={editingQuestion.id}
            question={editingQuestion}
            categoryName={categoryName}
            onSave={saveQuestion}
            onCancel={() => setEditingQuestion(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

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
  const [editedQuestion, setEditedQuestion] = useState<Question>(question);

  // Initialize media tab based on existing media (same logic as Classic editor)
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
    const newAnswer: Answer = {
      answer: '',
      is_correct: false,
      order_index: editedQuestion.answers?.length || 0
    };
    setEditedQuestion(prev => ({
      ...prev,
      answers: [...(prev.answers || []), newAnswer]
    }));
  };

  const updateAnswer = (index: number, answer: Answer) => {
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

  // Same validation rules as Classic editor
  const isSaveDisabled = () => {
    if (editedQuestion.type === 'multiple_choice') {
      const answers = editedQuestion.answers || [];
      const hasAnswers = answers.length > 0;
      const hasCorrectAnswer = answers.some(answer => answer.is_correct);
      return !hasAnswers || !hasCorrectAnswer;
    } else if (editedQuestion.type === 'short_answer') {
      return !editedQuestion.correct_answer || editedQuestion.correct_answer.trim() === '';
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
                        id="jeopardy-question-image"
                      />
                      <label htmlFor="jeopardy-question-image" className="media-upload-btn">
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
                        id="jeopardy-question-audio"
                      />
                      <label htmlFor="jeopardy-question-audio" className="media-upload-btn">
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
                <label htmlFor="jeopardy-correct-answer">Correct Answer</label>
                <input
                  id="jeopardy-correct-answer"
                  type="text"
                  value={editedQuestion.correct_answer || ''}
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
  answer: Answer;
  index: number;
  questionType: Question['type'];
  onChange: (answer: Answer) => void;
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
            name="jeopardy-correct-answer"
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
