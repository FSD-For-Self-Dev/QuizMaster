import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question, Answer } from './QuizEditor';
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
        type: 'jeopardy',
        category: categoryName,
        points,
        order_index: questions.length,
        answers: [{
          answer: '',
          is_correct: true,
          order_index: 0
        }]
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

  const handleSave = () => {
    if (editedQuestion.question.trim() && editedQuestion.answers?.[0]?.answer.trim()) {
      onSave(editedQuestion);
    }
  };

  return (
    <div className="question-modal-overlay">
      <motion.div
        className="question-modal"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
      >
        <div className="modal-header">
          <h3>${question.points} Question - {categoryName}</h3>
          <button onClick={onCancel} className="close-modal-btn">×</button>
        </div>

        <div className="modal-content">
          <div className="form-section">
            <label>Question (Clue)</label>
            <textarea
              value={editedQuestion.question}
              onChange={(e) => setEditedQuestion(prev => ({ ...prev, question: e.target.value }))}
              placeholder="Enter the clue that contestants will see..."
              className="question-textarea"
              rows={4}
            />
          </div>

          <div className="form-section">
            <label>Answer</label>
            <input
              type="text"
              value={editedQuestion.answers?.[0]?.answer || ''}
              onChange={(e) => setEditedQuestion(prev => ({
                ...prev,
                answers: [{
                  ...prev.answers![0],
                  answer: e.target.value
                }]
              }))}
              placeholder="What is... [answer]?"
              className="answer-input"
            />
          </div>

          <div className="jeopardy-tip">
            <strong>💡 Jeopardy Tip:</strong> Questions should be written as answers,
            and contestants must respond in the form of a question.
            For example: Question: "This planet is known as the Red Planet"
            Answer: "What is Mars?"
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onCancel} className="cancel-btn">Cancel</button>
          <button
            onClick={handleSave}
            className="save-btn"
            disabled={!editedQuestion.question.trim() || !editedQuestion.answers?.[0]?.answer.trim()}
          >
            Save Question
          </button>
        </div>
      </motion.div>
    </div>
  );
};
