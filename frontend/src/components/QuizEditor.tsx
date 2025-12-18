import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { QuizTypeSelector } from './QuizTypeSelector';
import { ClassicQuizEditor } from './ClassicQuizEditor';
import { JeopardyBoardEditor } from './JeopardyBoardEditor';
import { api } from '../api';
import './QuizEditor.css';

export interface Quiz {
  id?: string;
  title: string;
  description: string;
  type: 'classic' | 'jeopardy';
  settings: QuizSettings;
  questions: Question[];
  created_at?: string;
  updated_at?: string;
  questions_count: number;
}

export interface QuizSettings {
  timeLimit?: number;
  randomizeQuestions?: boolean;
  showCorrectAnswers?: boolean;
  theme?: string;
}

export interface Question {
  id?: string;
  quiz_id?: string;
  category?: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'jeopardy' | 'image_based' | 'audio_based' | 'picture_choice';
  points?: number;
  order_index: number;
  answers?: Answer[];
  image?: File | Blob | null;
  image_url?: string;
  audio?: File | Blob | null;
  audio_url?: string;
  correct_answer?: string;
}

export interface Answer {
  id?: string;
  question_id?: string;
  answer: string;
  is_correct: boolean;
  order_index: number;
  image_url?: string;
}

interface QuizEditorProps {
  quiz?: Quiz;
  onSave: (quiz: Quiz) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const QuizEditor: React.FC<QuizEditorProps> = ({ quiz, onSave, onCancel }) => {
  const [currentQuiz, setCurrentQuiz] = useState<Quiz>(quiz || {
    title: '',
    description: '',
    type: 'classic',
    settings: {
      timeLimit: 30,
      randomizeQuestions: false,
      showCorrectAnswers: true,
      theme: 'default'
    },
    questions: [],
    questions_count: 0,
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [showTypeSelector, setShowTypeSelector] = useState(!quiz);
  const [loading, setLoading] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(currentQuiz.title);
  const [editDescription, setEditDescription] = useState(currentQuiz.description || '');

  // Load questions for existing quiz
  useEffect(() => {
    if (quiz && quiz.id) {
      const loadQuizData = async () => {
        try {
          setLoading(true);
          const quizQuestions = await api.getQuestionsByQuiz(quiz.id!);

          // Load answers for each question
          const questionsWithAnswers = await Promise.all(
            quizQuestions.map(async (question) => {
              try {
                const answers = await api.getAnswersByQuestion(question.id!);
                console.log('???', question, answers)
                return { ...question, answers };
              } catch (error) {
                console.warn(`Failed to load answers for question ${question.id}:`, error);
                return { ...question, answers: [] };
              }
            })
          );

          setQuestions(questionsWithAnswers);
        } catch (error) {
          console.error('Failed to load quiz data:', error);
        } finally {
          setLoading(false);
        }
      };

      loadQuizData();
    }
  }, [quiz]);

  useEffect(() => {
    return () => {
      questions.forEach((q) => {
        if (q.audio_url?.startsWith("blob:")) {
          URL.revokeObjectURL(q.audio_url);
        }
      });
    };
  }, [questions]);

  // Keep local edit fields in sync with current quiz meta
  useEffect(() => {
    setEditTitle(currentQuiz.title);
    setEditDescription(currentQuiz.description || '');
  }, [currentQuiz.title, currentQuiz.description]);

  const handleQuizTypeSelect = (type: 'classic' | 'jeopardy', title: string, description: string) => {
    setCurrentQuiz(prev => ({
      ...prev,
      type,
      title,
      description
    }));
    setShowTypeSelector(false);
  };

  const uploadAudio = async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBlob);

    const { url } = await api.uploadAudio(formData);
    return url;
  };

  const uploadImage = async (file: File | Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const { url } = await api.uploadImage(formData);
    return url;
  };

  const [isSaving, setIsSaving] = useState(false);

  const [_, setUploadStatus] = useState<string | null>(null);

  const handleMetaSave = () => {
    setCurrentQuiz(prev => ({
      ...prev,
      title: editTitle.trim() || prev.title,
      description: editDescription,
    }));
    setIsEditingMeta(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validate quiz data before saving
      if (!currentQuiz.title?.trim()) {
        alert('Please provide a title for the quiz');
        return;
      };

      // Validate questions
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        const hasText = !!question.question?.trim();
        const hasMedia =
          !!question.image_url ||
          !!question.audio_url ||
          !!question.image ||
          !!question.audio;

        // Require either text or some media (image/audio)
        if (!hasText && !hasMedia) {
          alert(`Question ${i + 1} must have text or an image/audio attachment`);
          return;
        }

        // Validate based on question type
        if (question.type === 'multiple_choice') {
          if (!question.answers || question.answers.length === 0) {
            alert(`Question ${i + 1} (Multiple Choice) needs at least one answer option`);
            return;
          }
          if (!question.answers.some(answer => answer.is_correct)) {
            alert(`Question ${i + 1} (Multiple Choice) needs at least one correct answer`);
            return;
          }
        }
      };

      setUploadStatus("Uploading media...");

      // Upload all media and collect updated questions
      const uploadedQuestions = await Promise.all(
        questions.map(async (question) => {
          let updatedQuestion = { ...question };

          // Upload audio if it's a File or Blob
          if (question.audio && (question.audio instanceof File || question.audio instanceof Blob)) {
            try {
              const mediaUrl = await uploadAudio(question.audio);
              updatedQuestion.audio_url = mediaUrl;
              updatedQuestion.audio = undefined; // Remove local file
            } catch (err) {
              throw new Error(`Failed to upload audio for question: ${question.question || 'Unknown'}`);
            }
          }

          // Upload image if it's a File or Blob
          if (question.image && (question.image instanceof File || question.image instanceof Blob)) {
            try {
              const mediaUrl = await uploadImage(question.image);
              updatedQuestion.image_url = mediaUrl;
              updatedQuestion.image = undefined; // Remove local file
            } catch (err) {
              throw new Error(`Failed to upload image for question: ${question.question || 'Unknown'}`);
            }
          }

          return updatedQuestion;
        })
      );

      setUploadStatus("Saving quiz...");

      // Save the quiz with uploaded media URLs
      const quizToSave: Quiz = {
        ...currentQuiz,
        questions: uploadedQuestions,
      };

      console.log('Saving quiz:', quizToSave);
      onSave(quizToSave);

    } catch (err: any) {
      console.error("Save failed:", err);
      alert("Save failed: " + err.message);

    } finally {
      setIsSaving(false);
      setUploadStatus(null); // Reset
    };
  };

  const handleQuestionReorder = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);

        const newItems = [...items];
        const [removed] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, removed);

        // Update order_index
        return newItems.map((item, index) => ({
          ...item,
          order_index: index
        }));
      });
    }
  };

  if (showTypeSelector) {
    return <QuizTypeSelector onSelect={handleQuizTypeSelect} onCancel={onCancel} />;
  };

  return (
    <div className="quiz-editor">
      <motion.div
        className="editor-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="header-content">
          <div className="quiz-info">
            <h1 className="quiz-title-display">{currentQuiz.title || 'Untitled Quiz'}</h1>
            {currentQuiz.description && (
              <p className="quiz-description-display">{currentQuiz.description}</p>
            )}
            <div className="quiz-type-badge">
              {currentQuiz.type === 'classic' ? '📝 Classic Quiz' : '🎯 Jeopardy Board'}
            </div>
          </div>
          <div className="header-actions">
              {quiz && quiz.id && (
                <button
                  className="edit-meta-btn"
                  type="button"
                  onClick={() => setIsEditingMeta(true)}
                  disabled={isSaving}
                >
                  Edit title & description
                </button>
              )}
            <button className="cancel-btn" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Quiz'}
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="editor-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >

        {isEditingMeta && (
          <div className="quiz-meta-editor">
            <div className="form-group">
              <label htmlFor="quiz-title-edit">Quiz Title</label>
              <input
                id="quiz-title-edit"
                className="glass-input"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter quiz title..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="quiz-description-edit">Description</label>
              <textarea
                id="quiz-description-edit"
                className="glass-textarea"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter quiz description..."
                rows={3}
              />
            </div>
            <div className="quiz-meta-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setIsEditingMeta(false);
                  setEditTitle(currentQuiz.title);
                  setEditDescription(currentQuiz.description || '');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={handleMetaSave}
                disabled={!editTitle.trim()}
              >
                Save details
              </button>
            </div>
          </div>
        )}

        <div className="settings-section">
          <h3>Quiz Settings</h3>
          <div className="settings-grid">
            <div className="form-group">
              <label htmlFor="timeLimit">Time Limit (seconds)</label>
              <input
                id="timeLimit"
                type="number"
                value={currentQuiz.settings.timeLimit}
                onChange={(e) => setCurrentQuiz(prev => ({
                  ...prev,
                  settings: { ...prev.settings, timeLimit: parseInt(e.target.value) }
                }))}
                className="glass-input"
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={currentQuiz.settings.randomizeQuestions || false}
                  onChange={(e) => setCurrentQuiz(prev => ({
                    ...prev,
                    settings: { ...prev.settings, randomizeQuestions: e.target.checked }
                  }))}
                />
                Randomize Questions
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={currentQuiz.settings.showCorrectAnswers || false}
                  onChange={(e) => setCurrentQuiz(prev => ({
                    ...prev,
                    settings: { ...prev.settings, showCorrectAnswers: e.target.checked }
                  }))}
                />
                Show Correct Answers
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner">⟳</div>
            <p>Loading quiz data...</p>
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleQuestionReorder}
          >
            <SortableContext items={questions.map(q => q.id || '')} strategy={verticalListSortingStrategy}>
              {currentQuiz.type === 'classic' ? (
                <ClassicQuizEditor
                  questions={questions}
                  onQuestionsChange={setQuestions}
                />
              ) : (
                <JeopardyBoardEditor
                  questions={questions}
                  onQuestionsChange={setQuestions}
                />
              )}
            </SortableContext>
          </DndContext>
        )}
      </motion.div>
    </div>
  );
};
