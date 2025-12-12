import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import './GuestUserSetup.css';

interface GuestUser {
  id: string;
  username: string;
  avatar?: string;
  isHost: boolean;
  joinedAt: Date;
}

export const GuestUserSetup: React.FC = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🎯');
  const [customAvatar, setCustomAvatar] = useState<File | null>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default avatar options
  const defaultAvatars = [
    '🎯', '🚀', '⭐', '💎', '🔥', '🌟', '💫', '🎪',
    '🐯', '🦁', '🐸', '🦄', '🐙', '🐧', '🐨', '🦕',
    '🍕', '🍔', '🍓', '🍇', '🍪', '🍰', '🍩', '🍭',
    '⚽', '🏀', '🎮', '🎸', '🎭', '🎨', '🎪', '🎯'
  ];

  useEffect(() => {
    // Validate room ID
    if (!roomId) {
      setError('Invalid room link');
      return;
    }

    // Check if room exists (in a real app, this would be an API call)
    // For now, we'll assume all room IDs are valid
  }, [roomId]);

  const handleAvatarSelect = (avatar: string) => {
    setSelectedAvatar(avatar);
    setCustomAvatar(null);
    setCustomAvatarPreview('');
  };

  const handleCustomAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Image must be smaller than 2MB');
        return;
      }

      setCustomAvatar(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setCustomAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      // Clear emoji selection
      setSelectedAvatar('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }

    if (username.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (username.trim().length > 20) {
      setError('Name must be less than 20 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // In a real implementation, you would:
      // 1. Upload custom avatar if provided
      // 2. Create guest user in the backend
      // 3. Join the room
      // 4. Get room data
      
      // For now, we'll simulate the process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create guest user object
      const guestUser: GuestUser = {
        id: `guest-${Date.now()}`,
        username: username.trim(),
        avatar: customAvatar ? customAvatarPreview : selectedAvatar,
        isHost: false,
        joinedAt: new Date()
      };

      // Navigate to the guest lobby with user data
      navigate(`/lobby/${roomId}`, { 
        state: { 
          quiz: null, // Will be loaded from room
          mode: 'cooperate',
          roomId,
          guestUser,
          isJoining: true
        }
      });

    } catch (error) {
      console.error('Failed to join quiz:', error);
      setError('Failed to join quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  if (error && !loading) {
    return (
      <div className="guest-setup">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>{error}</h3>
          <button className="back-btn" onClick={handleBackToHome}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="guest-setup">
      <motion.div
        className="guest-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <motion.div
          className="setup-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="setup-title">🎮 Join Quiz</h1>
          <p className="setup-subtitle">
            Enter your name and choose an avatar to join the quiz
          </p>
          <div className="room-info">
            <span className="room-id">Room: {roomId}</span>
          </div>
        </motion.div>

        {/* Setup Form */}
        <motion.form
          className="setup-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {/* Username Input */}
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              👤 Your Name
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              className="form-input"
              maxLength={20}
              required
            />
            <div className="input-hint">
              {username.length}/20 characters
            </div>
          </div>

          {/* Avatar Selection */}
          <div className="form-group">
            <label className="form-label">
              🖼️ Choose Avatar
            </label>
            
            {/* Custom Avatar Upload */}
            <div className="avatar-upload">
              <label htmlFor="custom-avatar" className="upload-btn">
                📸 Upload Custom Avatar
              </label>
              <input
                id="custom-avatar"
                type="file"
                accept="image/*"
                onChange={handleCustomAvatarChange}
                className="upload-input"
              />
              {customAvatarPreview && (
                <div className="avatar-preview">
                  <img src={customAvatarPreview} alt="Custom Avatar" />
                  <button
                    type="button"
                    className="remove-avatar-btn"
                    onClick={() => {
                      setCustomAvatar(null);
                      setCustomAvatarPreview('');
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Default Avatars */}
            <div className="default-avatars">
              <p className="avatars-label">Or choose from these:</p>
              <div className="avatars-grid">
                {defaultAvatars.map((avatar, index) => (
                  <motion.button
                    key={index}
                    type="button"
                    className={`avatar-option ${selectedAvatar === avatar ? 'selected' : ''}`}
                    onClick={() => handleAvatarSelect(avatar)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                  >
                    {avatar}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="form-actions">
            <button
              type="button"
              className="back-btn secondary"
              onClick={handleBackToHome}
              disabled={loading}
            >
              ← Back to Home
            </button>
            
            <button
              type="submit"
              className="join-btn"
              disabled={loading || !username.trim()}
            >
              {loading ? (
                <>
                  <div className="loading-spinner">⟳</div>
                  Joining...
                </>
              ) : (
                '🚀 Join Quiz'
              )}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </div>
  );
};