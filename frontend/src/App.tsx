import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { PublicHeader } from './components/PublicHeader';
import { Dashboard } from './components/Dashboard';
import { QuizEditor } from './components/QuizEditor';
import { QuizPlayer } from './components/QuizPlayer';
import { QuizRoundEditor } from './components/QuizRoundEditor';
import { QuizRoundPlayer } from './components/QuizRoundPlayer';
import { QuizModeSelector } from './components/QuizModeSelector';
import { CooperateSetup } from './components/CooperateSetup';
import { CooperativeQuizPlayer } from './components/CooperativeQuizPlayer';
import { CooperativeJeopardyPlayer } from './components/CooperativeJeopardyPlayer';
import { GuestUserSetup } from './components/GuestUserSetup';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { api, Quiz } from './api';
import './App.css';

// Component that includes header for authenticated pages
const AppWithHeader: React.FC = () => {
  const quizContext = React.useContext(QuizContext);
  const { user, logout } = useAuth();
  const location = useLocation();

  const quizFromState = (location.state as any)?.quiz as Quiz | undefined;

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
        <Route
          path="/editor"
          element={
            <QuizEditor
              quiz={quizFromState}
              onSave={handleSaveQuiz}
              onCancel={handleCancelQuiz}
              isSaving={isSaving}
            />
          }
        />
        <Route path="/quiz-round-editor" element={<QuizRoundEditor />} />
        {/* <Route path="/quiz-round-player" element={<QuizRoundPlayer />} /> */}
        <Route path="/play" element={<QuizModeSelector />} />
        <Route path="/quiz" element={<QuizPlayer />} />
        <Route path="/cooperate-setup" element={<CooperateSetup />} />
        {/* <Route path="/cooperative-quiz" element={<CooperativeQuizPlayer />} /> */}
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

// Wrapper for public routes with simplified header
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  );
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

      // If this is an edit of an existing quiz, remove the old one first
      if (quiz.id) {
        try {
          await api.deleteQuiz(quiz.id);
        } catch (e) {
          console.warn('Failed to delete old quiz before re-creating, continuing anyway:', e);
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
        type: 'error',
        text: `Backend not available`
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
              <Route path="/login" element={
                <PublicRoute>
                  <LoginRoute />
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              } />
              <Route path="/join/:roomId" element={
                <PublicRoute>
                  <GuestUserSetup />
                </PublicRoute>
              } />
              <Route path="/lobby/:roomId" element={
                <PublicRoute>
                  <CooperateSetup />
                </PublicRoute>
              } />
              <Route path="/cooperative-quiz" element={
                <PublicRoute>
                  <CooperativeQuizPlayer />
                </PublicRoute>
              } />
              <Route path="/cooperative-jeopardy" element={
                <PublicRoute>
                  <CooperativeJeopardyPlayer />
                </PublicRoute>
              } />
              <Route
                path="/quiz-round-player"
                element={
                  <PublicRoute>
                    <QuizRoundPlayer />
                  </PublicRoute>
                }
              />

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
