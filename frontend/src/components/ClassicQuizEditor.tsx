import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Question, Answer } from './QuizEditor';
import { QuestionCard } from './QuestionCard';
import './ClassicQuizEditor.css';

interface ClassicQuizEditorProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
}

export const ClassicQuizEditor: React.FC<ClassicQuizEditorProps> = ({
  questions,
  onQuestionsChange
}) => {
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const addQuestion = () => {
    const newQuestion: Question = {
      question: '',
      type: 'multiple_choice',
      order_index: questions.length,
      answers: []
    };
    setEditingQuestion(newQuestion);
  };

  const saveQuestion = (question: Question) => {
    if (question.id) {
      // Update existing question
      onQuestionsChange(questions.map(q => q.id === question.id ? question : q));
    } else {
      // Add new question
      const newQuestion = { ...question, id: Date.now().toString() };
      onQuestionsChange([...questions, newQuestion]);
    }
    setEditingQuestion(null);
  };

  const deleteQuestion = (questionId: string) => {
    onQuestionsChange(questions.filter(q => q.id !== questionId));
  };

  const duplicateQuestion = (question: Question) => {
    const duplicated: Question = {
      ...question,
      id: undefined,
      question: `${question.question} (Copy)`,
      order_index: questions.length,
      answers: question.answers?.map(answer => ({ ...answer, id: undefined }))
    };
    onQuestionsChange([...questions, duplicated]);
  };

  return (
    <>
      <div className="classic-quiz-editor">
        <div className="editor-section-header">
          <h2>Questions ({questions.length})</h2>
          <button className="add-question-btn" onClick={addQuestion}>
            + Add Question
          </button>
        </div>

        <AnimatePresence mode="wait">
          {questions.length === 0 ? (
            <motion.div
              key="empty-state"
              className="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="empty-icon">📝</div>
              <h3>No questions yet</h3>
              <p>Start building your quiz by adding your first question!</p>
              <button className="cta-btn" onClick={addQuestion}>
                Create First Question
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="questions-list"
              className="questions-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AnimatePresence>
                {questions.map((question, index) => (
                  <SortableQuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    onEdit={() => setEditingQuestion(question)}
                    onDelete={() => deleteQuestion(question.id!)}
                    onDuplicate={() => duplicateQuestion(question)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {editingQuestion && (
        <QuestionEditorModal
          question={editingQuestion}
          onSave={saveQuestion}
          onCancel={() => setEditingQuestion(null)}
        />
      )}
    </>
  );
};

interface SortableQuestionCardProps {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const SortableQuestionCard: React.FC<SortableQuestionCardProps> = ({
  question,
  index,
  onEdit,
  onDelete,
  onDuplicate
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: question.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <QuestionCard
        question={question}
        index={index}
        dragHandleProps={listeners}
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
    </div>
  );
};

interface QuestionEditorModalProps {
  question: Question;
  onSave: (question: Question) => void;
  onCancel: () => void;
}

const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  question,
  onSave,
  onCancel
}) => {
  const [editedQuestion, setEditedQuestion] = useState<Question>(question);

  // Initialize media tab based on existing media
  const getInitialMediaTab = (question: Question): 'none' | 'image' | 'audio' | 'several' => {
    const hasImage = !!question.image_url;
    const hasAudio = !!question.audio_url;

    if (hasImage && hasAudio) return 'several';
    if (hasImage) return 'image';
    if (hasAudio) return 'audio';
    return 'none';
  };

  const [selectedMediaTab, setSelectedMediaTab] = useState<'none' | 'image' | 'audio' | 'several'>(getInitialMediaTab(question));

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
      answers: prev.answers?.map((a, i) => i === index ? answer : a)
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

  // Check if save button should be disabled
  const isSaveDisabled = () => {
    if (editedQuestion.type === 'multiple_choice') {
      const answers = editedQuestion.answers || [];
      const hasAnswers = answers.length > 0;
      const hasCorrectAnswer = answers.some(answer => answer.is_correct);
      return !hasAnswers || !hasCorrectAnswer;
    } else if (editedQuestion.type === 'short_answer') {
      // For short answer questions, require a correct answer
      return !editedQuestion.correct_answer || editedQuestion.correct_answer.trim() === '';
    }
    // For other question types, always allow saving
    return false;
  };

  return (
    <div className="modal-overlay">
      <motion.div
        className="question-editor-modal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className="modal-header">
          <h2>{question.id ? 'Edit Question' : 'Create Question'}</h2>
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

            {/* Media Type Tabs */}
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

            {/* Media Inputs */}
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
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              setEditedQuestion(prev => ({ ...prev, image_url: e.target?.result as string }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ display: 'none' }}
                        id="question-image-modal"
                      />
                      <label htmlFor="question-image-modal" className="media-upload-btn">
                        📷 Upload
                      </label>
                    </div>
                    {editedQuestion.image_url && (
                      <div className="media-preview">
                        <img src={editedQuestion.image_url} alt="Question" className="question-preview-image" />
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
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              setEditedQuestion(prev => ({ ...prev, audio_url: e.target?.result as string }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ display: 'none' }}
                        id="question-audio-modal"
                      />
                      <label htmlFor="question-audio-modal" className="media-upload-btn">
                        🎵 Upload
                      </label>
                    </div>
                    {editedQuestion.audio_url && (
                      <div className="media-preview">
                        <audio controls src={editedQuestion.audio_url} className="question-preview-audio" />
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
                <label htmlFor="correct-answer">Correct Answer</label>
                <input
                  id="correct-answer"
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
            name="correct-answer"
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
