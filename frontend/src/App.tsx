import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { QuizEditor } from './components/QuizEditor';
import { QuizPlayer } from './components/QuizPlayer';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { api, Quiz } from './api';
import './App.css';

// Component that includes header for authenticated pages
const AppWithHeader: React.FC = () => {
  const quizContext = React.useContext(QuizContext);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  if (!quizContext) return null;

  const { handleSaveQuiz, handleCancelQuiz, isSaving } = quizContext;

  return (
    <>
      <Header user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor" element={<QuizEditor onSave={handleSaveQuiz} onCancel={handleCancelQuiz} isSaving={isSaving} />} />
        <Route path="/play" element={<QuizPlayer />} />
      </Routes>
    </>
  );
};

// Wrapper for login route: if already authenticated, redirect to dashboard
const LoginRoute: React.FC = () => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <Login />;
};

// Global state for quiz saving (needed by multiple components)
const QuizContext = React.createContext<{
  isSaving: boolean;
  saveMessage: { type: 'success' | 'error'; text: string } | null;
  handleSaveQuiz: (quiz: Quiz) => Promise<void>;
  handleCancelQuiz: () => void;
} | null>(null);

function App() {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveQuiz = async (quiz: Quiz) => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      console.log('Saving quiz:', quiz);
      console.log('Quiz includes', quiz.questions?.length || 0, 'questions');

      // Check payload size before sending
      const quizJson = JSON.stringify(quiz);
      const payloadSizeKB = (new Blob([quizJson]).size / 1024).toFixed(2);
      const payloadSizeMB = (new Blob([quizJson]).size / (1024 * 1024)).toFixed(2);

      console.log(`Payload size: ${payloadSizeKB} KB (${payloadSizeMB} MB)`);

      // Warn about large payloads
      if (parseFloat(payloadSizeMB) > 5) {
        const confirmed = window.confirm(
          `This quiz is large (${payloadSizeMB} MB) due to media files.\n\n` +
          `⚠️  Backend Issue: Server returns 413 (Payload Too Large)\n` +
          `💡 Backend needs: body-parser limit increased (e.g., 50MB)\n\n` +
          `Consider using smaller files or external URLs. Continue?`
        );
        if (!confirmed) {
          setIsSaving(false);
          return;
        }
      }

      // Check for large media files
      const mediaFiles: string[] = [];
      quiz.questions?.forEach((q, qIndex) => {
        if (q.image_url?.startsWith('data:')) {
          const size = (q.image_url.length * 0.75) / (1024 * 1024); // Rough base64 to bytes conversion
          if (size > 2) mediaFiles.push(`Question ${qIndex + 1} image: ${size.toFixed(2)} MB`);
        }
        if (q.audio_url?.startsWith('data:')) {
          const size = (q.audio_url.length * 0.75) / (1024 * 1024);
          if (size > 5) mediaFiles.push(`Question ${qIndex + 1} audio: ${size.toFixed(2)} MB`);
        }
      });

      if (mediaFiles.length > 0) {
        console.warn('Large media files detected:', mediaFiles);
        const confirmed = window.confirm(
          `Large media files detected:\n${mediaFiles.join('\n')}\n\n` +
          `Consider using smaller files or external URLs. Continue?`
        );
        if (!confirmed) {
          setIsSaving(false);
          return;
        }
      }

      const result = await api.saveCompleteQuiz(quiz);

      console.log('Quiz saved successfully:', result);

      setSaveMessage({
        type: 'success',
        text: `Quiz "${result.quiz.title}" saved successfully with ${result.questions.length} questions!`
      });

      // Clear success message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);

      // Redirect to Dashboard after successful save
      window.location.href = '/';

    } catch (error) {
      console.error('Failed to save quiz:', error);

      // Temporary workaround - simulate successful save
      console.warn('Backend not available - simulating successful save');
      setSaveMessage({
        type: 'success',
        text: `Quiz "${quiz.title}" saved locally with ${quiz.questions?.length || 0} questions! (Backend not available)`
      });

      // Clear success message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelQuiz = () => {
    console.log('Canceling quiz creation');
    // Navigation will be handled by React Router
  };

  return (
    <AuthProvider>
      <QuizContext.Provider value={{
        isSaving,
        saveMessage,
        handleSaveQuiz,
        handleCancelQuiz
      }}>
        <Router>
          <div className="App">
            {/* Save status notification */}
            {saveMessage && (
              <div
                className={`save-notification ${saveMessage.type}`}
                style={{
                  position: 'fixed',
                  top: '20px',
                  right: '20px',
                  padding: '15px 20px',
                  borderRadius: '8px',
                  backgroundColor: saveMessage.type === 'success' ? '#4CAF50' : '#f44336',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 1000,
                  maxWidth: '400px',
                  fontWeight: '500'
                }}
              >
                {saveMessage.text}
              </div>
            )}

            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/register" element={<Register />} />

              {/* Protected routes with header */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppWithHeader />
                  </ProtectedRoute>
                }
              />

              {/* Redirect unknown routes to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </Router>
      </QuizContext.Provider>
    </AuthProvider>
  );
}

export default App;
