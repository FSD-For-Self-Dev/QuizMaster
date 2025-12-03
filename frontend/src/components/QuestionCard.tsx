import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import './QuestionCard.css';

interface QuestionCardProps {
  question: {
    id?: string;
    question: string;
    type: string;
    points?: number;
    answers?: Array<{
      answer: string;
      is_correct: boolean;
    }>;
    image_url?: string;
    audio_url?: string;
    correct_answer?: string;
  };
  index: number;
  dragHandleProps?: any;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  dragHandleProps,
  onEdit,
  onDelete,
  onDuplicate
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleAudioToggle = () => {
    if (currentAudioRef.current && !currentAudioRef.current.paused) {
      // Audio is playing, so pause/stop it
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
      setIsPlaying(false);
    } else {
      // Audio is not playing, so start playing
      const audio = new Audio(question.audio_url);
      currentAudioRef.current = audio;

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        currentAudioRef.current = null;
      });

      audio.addEventListener('pause', () => {
        setIsPlaying(false);
      });

      audio.play();
      setIsPlaying(true);
    }
  };
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'multiple_choice':
        return '📝';
      case 'true_false':
        return '✓✗';
      case 'short_answer':
        return '✍️';
      case 'jeopardy':
        return '🎯';
      default:
        return '❓';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice':
        return 'Multiple Choice';
      case 'true_false':
        return 'True/False';
      case 'short_answer':
        return 'Short Answer';
      case 'jeopardy':
        return 'Jeopardy';
      default:
        return 'Unknown';
    }
  };

  const getCorrectAnswersCount = () => {
    if (!question.answers) return 0;
    return question.answers.filter(answer => answer.is_correct).length;
  };

  return (
    <motion.div
      className="question-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      layout
    >
      <div className="card-header">
        <div className="question-type">
          <span className="type-label">{getTypeLabel(question.type)}</span>
        </div>

        <div className="card-actions">
          <button
            className="action-btn edit-btn"
            onClick={onEdit}
            title="Edit question"
          >
            ✏️
          </button>
          <button
            className="action-btn duplicate-btn"
            onClick={onDuplicate}
            title="Duplicate question"
          >
            📋
          </button>
          <button
            className="action-btn delete-btn"
            onClick={onDelete}
            title="Delete question"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="card-content">
        <div className="question-text">
          {question.question || 'No question text...'}
        </div>

        {/* Media Display */}
        {(question.image_url || question.audio_url) && (
          <div className="question-media">
            {question.image_url && (
              <div className="media-item">
                <img src={question.image_url} alt="Question media" className="question-image" />
              </div>
            )}
            {question.audio_url && (
              <div className="media-item">
                <div
                  className={`question-audio-thumbnail ${isPlaying ? 'playing' : ''}`}
                  onClick={handleAudioToggle}
                  title={isPlaying ? "Click to stop audio" : "Click to play audio"}
                >
                  <span className="audio-icon">🎵</span>
                  <div className="play-overlay">
                    <span className="play-icon">{isPlaying ? '⏸️' : '▶️'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="question-meta">
          <div className="meta-item">
            <span className="meta-label">Points:</span>
            <span className="meta-value">{question.points || 10}</span>
          </div>

          {question.answers && question.answers.length > 0 && (
            <div className="meta-item">
              <span className="meta-label">Answers:</span>
              <span className="meta-value">
                {question.answers.length} total, {getCorrectAnswersCount()} correct
              </span>
            </div>
          )}

          {question.type === 'jeopardy' && (
            <div className="meta-item">
              <span className="jeopardy-badge">JEOPARDY</span>
            </div>
          )}
        </div>
      </div>

      {dragHandleProps && (
        <div
          className="drag-handle"
          {...dragHandleProps}
          title="Drag to reorder"
        >
          ⋮⋮
        </div>
      )}
    </motion.div>
  );
};
