import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { Quiz, RoomWithParticipants, api, type RoomParticipant } from '../api';
import './CooperateSetup.css';

// Room state interface
interface RoomState {
  id: string;
  room: RoomWithParticipants | null;
  loading: boolean;
  error: string | null;
  wsConnection: WebSocket | null;
  currentParticipantId: string | null;
}

interface CooperateLocationState {
  isJoining?: boolean;
  roomId?: string; // room_code
  quiz?: Quiz;
  guestUser?: {
    username: string;
    avatar?: string;
  };
}

export const CooperateSetup: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state || {}) as CooperateLocationState;

  // Stable values derived from navigation state
  const isJoining = !!navState.isJoining;
  const guestUser = navState.guestUser;
  const guestUsername = guestUser?.username ?? null;
  const guestAvatar = guestUser?.avatar ?? null;
  const locationRoomCode = navState.roomId ?? null;
  const initialQuiz = (navState.quiz || null) as Quiz | null;

  const [roomState, setRoomState] = useState<RoomState>({
    id: '',
    room: null,
    loading: false,
    error: null,
    wsConnection: null,
    currentParticipantId: null,
  });

  const roomStateRef = useRef<RoomState>({
    id: '',
    room: null,
    loading: false,
    error: null,
    wsConnection: null,
    currentParticipantId: null,
  });

  // UI-only room code (room_code, not DB id)
  const [roomCode, setRoomCode] = useState<string>(
    () => locationRoomCode || generateRoomId()
  );
  const [pin, setPin] = useState<string>(() =>
    locationRoomCode ? generatePIN() : ''
  );
  const [shareLink, setShareLink] = useState<string>(() =>
    locationRoomCode ? `${window.location.origin}/join/${locationRoomCode}` : ''
  );
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const quiz = initialQuiz; // for rendering / navigation

  // Refs
  const wsConnectionRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const initializedRef = useRef<boolean>(false);
  const roomIdRef = useRef<string | null>(null); // backend room.id

  // Track mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Ensure WS cleanup on unmount
      if (roomIdRef.current) {
        api.disconnectFromRoomWebSocket(roomIdRef.current);
      }
      wsConnectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // Generate QR when shareLink changes
  useEffect(() => {
    if (!shareLink) return;
    generateQRCode(shareLink);
  }, [shareLink]);

  // Main initialization effect: create or join room + connect WebSocket
  useEffect(() => {
    console.log('CooperateSetup init effect', {
      isJoining,
      guestUser,
      locationRoomCode,
      quizId: quiz?.id,
      initialized: initializedRef.current,
    });

    if (initializedRef.current) {
      console.log('Initialization already done for this mount, skipping');
      return;
    }
    initializedRef.current = true;

    let cancelled = false;

    const initializeRoom = async () => {
      console.log('Starting room initialization...', {
        isJoining,
        guestUser,
        quiz,
        locationRoomCode,
      });

      try {
        setRoomState(prev => ({ ...prev, loading: true, error: null }));

        // --- Guest joining existing room ---
        if (isJoining && guestUser) {
          console.log('Guest user joining room...');
          const targetRoomCode = locationRoomCode || roomCode;
          console.log('Target room code:', targetRoomCode);

          // 1) Get room by room_code (includes participants)
          const roomData = await api.getRoomByCode(targetRoomCode);
          if (cancelled || !isMountedRef.current) return;

          console.log('Room data by code:', roomData);

          // 2) Join via HTTP
          console.log('Joining room via API...');
          const participant = await api.joinRoom({
            room_id: roomData.id,
            guest_name: guestUser.username,
            guest_avatar: guestUser.avatar,
            is_host: false,
          });
          if (cancelled || !isMountedRef.current) return;

          console.log('Successfully joined room:', participant);

          // 3) Connect WebSocket for real-time updates
          console.log('Setting up WebSocket connection for guest...');
          const ws = api.connectToRoomWebSocket(roomData.id);
          wsConnectionRef.current = ws;
          roomIdRef.current = roomData.id;

          setupWebSocketListeners(ws, roomData.id, guestUser);

          // 4) Optimistically update state, ensuring we include this participant
          if (cancelled || !isMountedRef.current) return;

          setRoomState(prev => {
            const baseRoom = prev.room ?? roomData;
            const existing = baseRoom.participants ?? [];
            const already = existing.some(p => p.id === participant.id);

            return {
              id: baseRoom.id,
              room: {
                ...baseRoom,
                participants: already ? existing : [...existing, participant],
              },
              loading: false,
              error: null,
              wsConnection: ws,
              currentParticipantId: participant.id,
            };
          });

          setRoomCode(roomData.room_code);
          setPin(roomData.pin_code);
          setShareLink(`${window.location.origin}/join/${roomData.room_code}`);

          return;
        }

        // --- Host creating a new room ---
        if (!isJoining && quiz) {
          console.log('Host creating new room for quiz:', quiz.id);

          // 1) Create room
          const roomData = await api.createRoom({
            quiz_id: quiz.id!,
            max_players: 50,
          });
          if (cancelled || !isMountedRef.current) return;
          console.log('Room created:', roomData);

          // 2) Update display code, pin, share link
          setRoomCode(roomData.room_code);
          setPin(roomData.pin_code);
          setShareLink(`${window.location.origin}/join/${roomData.room_code}`);

          // 3) Connect WebSocket (do NOT block the UI on this)
          console.log('Setting up WebSocket for host...');
          let ws: WebSocket | null = null;
          try {
            ws = api.connectToRoomWebSocket(roomData.id);
            wsConnectionRef.current = ws;
            roomIdRef.current = roomData.id;
            setupWebSocketListeners(ws, roomData.id, null);
          } catch (error) {
            console.warn('WebSocket connection failed, continuing without it:', error);
          }

          // 4) Immediately show a stub room; WS "room_state" will refine it later
          if (cancelled || !isMountedRef.current) return;

          const stubRoom: RoomWithParticipants = {
            ...roomData,
            quiz_title: quiz.title,
            quiz_description: quiz.description,
            quiz_type: quiz.type,
            quiz_questions_count: quiz.questions_count || 0,
            participants: [], // host participant will appear after first "room_state"
          };

          setRoomState({
            id: roomData.id,
            room: stubRoom,
            loading: false,    // IMPORTANT: stop the spinner here
            error: null,
            wsConnection: ws,
            currentParticipantId: null,
          });

          return;
        }

        // --- Guest opening join page without quiz, needs room by code ---
        if (isJoining && !guestUser) {
          console.log('Guest accessing room directly (no guestUser in state).');

          const targetRoomCode = locationRoomCode || roomCode;
          console.log('Trying to get room by code:', targetRoomCode);

          try {
            const roomData = await api.getRoomByCode(targetRoomCode);
            if (cancelled || !isMountedRef.current) return;

            console.log('Direct access room data:', roomData);

            // Connect WebSocket (read-only guest, not yet joined via API)
            try {
              const ws = api.connectToRoomWebSocket(roomData.id);
              wsConnectionRef.current = ws;
              roomIdRef.current = roomData.id;
              setupWebSocketListeners(ws, roomData.id, null);

              if (cancelled || !isMountedRef.current) return;

              setRoomState({
                id: roomData.id,
                room: roomData,
                loading: false,
                error: null,
                wsConnection: ws,
                currentParticipantId: null,
              });
            } catch (error) {
              console.warn('WebSocket connection failed, continuing without it:', error);
              if (!cancelled && isMountedRef.current) {
                setRoomState({
                  id: roomData.id,
                  room: roomData,
                  loading: false,
                  error: null,
                  wsConnection: null,
                  currentParticipantId: null,
                });
              }
            }
          } catch (error) {
            console.error('Failed to get room for direct access:', error);
            if (!cancelled && isMountedRef.current) {
              setRoomState({
                id: targetRoomCode,
                room: null,
                loading: false,
                error: 'Room not found',
                wsConnection: null,
                currentParticipantId: null,
              });
            }
          }

          return;
        }

        // --- Invalid state: navigate away ---
        console.log('Invalid navigation state, redirecting to home');
        if (!cancelled && isMountedRef.current) {
          navigate('/');
        }
      } catch (error) {
        console.error('Failed to initialize room:', error);
        if (!cancelled && isMountedRef.current) {
          setRoomState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load room',
          }));
        }
      }
    };

    void initializeRoom();

    return () => {
      cancelled = true;
    };
  },
  [
    isJoining,
    guestUsername,
    quiz?.id,
    navigate,
    locationRoomCode,
  ]);

  const setupWebSocketListeners = (
    wsConnection: WebSocket,
    roomId: string,
    guest: { username: string; avatar?: string } | null
  ) => {
    console.log('Setting up WebSocket listeners for room:', roomId);

    wsConnection.onopen = () => {
      console.log(
        `✅ Connected to room WebSocket. Guest user: ${guest?.username ?? 'HOST / unknown'}`
      );
      // NOTE: All joining/leaving is via REST.
      // We do NOT send any custom "participant_joined" through WebSocket.
    };

    wsConnection.onmessage = (event) => {
      if (!isMountedRef.current) return;

      console.log('📨 WebSocket message received:', event.data);
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message, guest);
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error);
      }
    };

    wsConnection.onclose = (event) => {
      console.log('🔌 Disconnected from room WebSocket:', event.code, event.reason);
      if (isMountedRef.current) {
        setRoomState(prev => ({
          ...prev,
          wsConnection: null,
        }));
      }
    };

    wsConnection.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  };

  const handleWebSocketMessage = (
    message: any,
    guest: { username: string; avatar?: string } | null
  ) => {
    if (!isMountedRef.current) return;

    const { type, data } = message;

    switch (type) {
      case 'room_state': {
        setRoomState(prev => {
          const updated: RoomState = {
            ...prev,
            room: data,
            loading: false,      // ← make sure we stop showing "Loading lobby..."
            error: null,         // ← clear any previous error
          };

          if (guest && data.participants) {
            const current = data.participants.find(
              (p: RoomParticipant) =>
                p.guest_name === guest.username && p.is_active
            );
            if (current) {
              updated.currentParticipantId = current.id;
            }
          }

          return updated;
        });
        break;
      }

      case 'participant_joined': {
        const joined: RoomParticipant = data.participant;
        setRoomState(prev => {
          if (!prev.room) return prev;

          const existing = prev.room.participants || [];
          const already = existing.some(p => p.id === joined.id);
          const newList = already ? existing : [...existing, joined];

          const isThisGuest = guest && joined.guest_name === guest.username;

          return {
            ...prev,
            room: {
              ...prev.room,
              participants: newList,
            },
            currentParticipantId: isThisGuest ? joined.id : prev.currentParticipantId,
          };
        });
        break;
      }

      case 'participant_left': {
        const leftId: string = data.participant_id;
        setRoomState(prev => {
          if (!prev.room) return prev;
          const filtered = prev.room.participants.filter(p => p.id !== leftId);

          const clearedCurrent =
            prev.currentParticipantId === leftId ? null : prev.currentParticipantId;

          return {
            ...prev,
            room: {
              ...prev.room,
              participants: filtered,
            },
            currentParticipantId: clearedCurrent,
          };
        });
        break;
      }

      case 'room_status_changed': {
        setRoomState(prev => {
          if (!prev.room) return prev;
          return {
            ...prev,
            room: {
              ...prev.room,
              status: data.status,
            },
          };
        });
        break;
      }

      case 'user_connected':
      case 'user_disconnected': {
        console.log(`Room status: ${type}`, data);
        break;
      }

      case 'join_acknowledged':
      case 'leave_acknowledged': {
        console.log(`${type}:`, data.message);
        break;
      }

      case 'pong': {
        console.log('pong', data);
        break;
      }

      case 'cooperative_quiz_start':
      case 'cooperative_new_question': {
        // Treat both as "start cooperative quiz"
        console.log('Cooperative quiz starting, navigating to CooperativeQuizPlayer');

        // Guests auto-navigate; host already navigates on button click
        if (isJoining) {
          // Always read from the ref (latest state), not the closed-over roomState
          const current = roomStateRef.current;

          const effectiveRoomId =
            current.id ||           // from latest room state
            navState.roomId ||      // from navigation
            data?.room_id ||        // from WS payload
            null;

          if (!effectiveRoomId) {
            console.error('Cannot navigate to CooperativeQuizPlayer: no roomId');
            return;
          }

          const participants = current.room?.participants || [];

          const effectiveQuiz = quiz || {
            id: data?.quiz_id,
            title: current.room?.quiz_title ?? '',
            description: current.room?.quiz_description ?? '',
            type: (current.room?.quiz_type as Quiz['type']) || 'classic',
            questions_count: current.room?.quiz_questions_count ?? 0,
            settings: {},
            questions: [],
          };

          const effectiveParticipantId = current.currentParticipantId ?? null;

          console.log('Navigating with:', {
            effectiveRoomId,
            effectiveParticipantId,
            participantsCount: participants.length,
          });

          navigate('/cooperative-quiz', {
            state: {
              quiz: effectiveQuiz,
              roomId: effectiveRoomId,
              isHost: false,
              currentParticipantId: effectiveParticipantId,
              participants,
            },
          });
        }
        break;
      }

      default:
        console.log('Unhandled WebSocket message type:', type, data);
    }
  };

  const generateQRCode = async (text: string) => {
    try {
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        text
      )}&margin=10`;
      console.log('Generating QR code with URL:', qrApiUrl);

      const forceUpdateUrl = `${qrApiUrl}&t=${Date.now()}`;
      setQrCodeUrl(forceUpdateUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleCopyPIN = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy PIN:', error);
    }
  };

  // Updated start quiz handler
  const handleStartQuiz = () => {
    if (!roomState.room || roomState.room.status !== 'waiting') return;

    // Find host participant id (host can also play)
    const hostParticipant = roomState.room.participants.find(p => p.is_host);

    // 1) Broadcast start over WebSocket so guests can navigate too
    if (roomState.wsConnection) {
      const payload = {
        type: 'cooperative_quiz_start',
        data: {
          room_id: roomState.id,
          quiz_id: roomState.room.quiz_id,
        },
      };

      try {
        roomState.wsConnection.send(JSON.stringify(payload));
      } catch (e) {
        console.error('Failed to send cooperative_quiz_start:', e);
      }
    }

    // 2) Host navigates to quiz
    navigate('/cooperative-quiz', {
      state: {
        quiz: {
          id: roomState.room.quiz_id,
          title: roomState.room.quiz_title || '',
          description: roomState.room.quiz_description || '',
          type: (roomState.room.quiz_type as Quiz['type']) || 'classic',
          questions_count: roomState.room.quiz_questions_count || 0,
          settings: {},
          questions: [],
        },
        roomId: roomState.id,
        isHost: true,
        currentParticipantId: hostParticipant?.id ?? null,
        participants: roomState.room.participants,
      },
    });
  };

  const handleBackToModeSelection = () => {
    navigate('/play', { state: { quiz } });
  };

  const handleBackToDashboard = () => {
    if (roomIdRef.current) {
      api.disconnectFromRoomWebSocket(roomIdRef.current);
    }
    navigate('/');
  };

  const handleLeaveLobby = () => {
    if (
      isJoining &&
      guestUser &&
      roomState.room &&
      roomState.currentParticipantId
    ) {
      api.leaveRoom(roomState.currentParticipantId).catch(console.error);
    }

    if (roomIdRef.current) {
      api.disconnectFromRoomWebSocket(roomIdRef.current);
    }

    navigate('/');
  };

  const handleRemoveHost = () => {
    if (!roomState.room) return;

    const hostParticipant = roomState.room.participants.find(p => p.is_host);
    if (hostParticipant) {
      api
        .updateRoomParticipant(hostParticipant.id, {
          is_host: true,
          is_spectator: true,
        })
        .catch(console.error);

      setRoomState(prev => ({
        ...prev,
        room: {
          ...prev.room!,
          participants: prev.room!.participants.map(p =>
            p.is_host ? { ...p, is_spectator: true } : p
          ),
        },
      }));
    }
  };

  // Loading / error / not found states
  if (roomState.loading && !roomState.room) {
    return (
      <div className="cooperate-setup">
        <div className="loading-state">
          <div className="loading-spinner">⟳</div>
          <p>Loading lobby...</p>
        </div>
      </div>
    );
  }

  if (roomState.error) {
    return (
      <div className="cooperate-setup">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Error</h3>
          <p>{roomState.error}</p>
          <button className="back-btn" onClick={handleBackToDashboard}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!roomState.room) {
    return (
      <div className="cooperate-setup">
        <div className="error-state">
          <div className="error-icon">🔍</div>
          <h3>Lobby not found</h3>
          <p>This quiz lobby doesn't exist or has been closed.</p>
          <button className="back-btn" onClick={handleBackToDashboard}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Determine if current user is the host (creator) or a joining guest
  const isHostView = !isJoining;

  return (
    <div className="cooperate-setup">
      <motion.div
        className="cooperate-container"
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
          <h1 className="setup-title">
            {isJoining ? '🎮 Joined Quiz Lobby!' : '🎉 Quiz Lobby Created!'}
          </h1>
          <p className="setup-subtitle">
            {isJoining
              ? 'Welcome to the quiz! You can see other players here.'
              : 'Share the QR code or link below so others can join your quiz'}
          </p>
        </motion.div>

        {/* Quiz Info */}
        <motion.div
          className="quiz-info"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="quiz-title">{roomState.room.quiz_title || 'Quiz'}</h2>
          <div className="quiz-meta">
            <span className="quiz-type">
              {roomState.room.quiz_type === 'classic' ? 'Classic Quiz' : 'Jeopardy'}
            </span>
            <span className="quiz-questions">
              {roomState.room.quiz_questions_count || 0} questions
            </span>
            <span className="room-info">
              Room: {roomState.room.room_code}
            </span>
          </div>
          {roomState.room.quiz_description && (
            <p className="quiz-description">{roomState.room.quiz_description}</p>
          )}
        </motion.div>

        <div className="setup-content">
          {/* QR Code and Sharing */}
          <motion.div
            className="sharing-section"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <h3 className="section-title">📱 Join via QR Code</h3>
            <div className="qr-section">
              <div className="qr-code-container">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" className="qr-code" />
                ) : (
                  <div className="qr-placeholder">
                    <div className="qr-spinner">⟳</div>
                  </div>
                )}
              </div>
              <p className="qr-instructions">
                Scan this QR code with your phone's camera to join the quiz
              </p>
            </div>

            <div className="sharing-links">
              <div className="link-section">
                <label className="link-label">🔗 Share Link</label>
                <div className="link-input-group">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="link-input"
                  />
                  <button
                    className={`copy-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopyLink}
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              <div className="pin-section">
                <label className="pin-label">🔢 PIN Code</label>
                <div className="pin-input-group">
                  <input
                    type="text"
                    value={pin}
                    readOnly
                    className="pin-input"
                  />
                  <button
                    className={`copy-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopyPIN}
                  >
                    {copied ? '✓' : '📋'}
                  </button>
                </div>
                <p className="pin-instructions">
                  Players can enter this PIN manually if needed
                </p>
              </div>
            </div>
          </motion.div>

          {/* User List */}
          <motion.div
            className="users-section"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <h3 className="section-title">
              👥 Players ({roomState.room.participants.length}/{roomState.room.max_players})
            </h3>
            <div className="users-list">
              {roomState.room.participants.map((participant, index) => (
                <motion.div
                  key={participant.id}
                  className="user-item"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.9 + index * 0.1 }}
                >
                  <div className="user-avatar">
                    {participant.guest_avatar ? (
                      participant.guest_avatar.startsWith('http') ? (
                        <img
                          src={participant.guest_avatar}
                          alt={participant.guest_name}
                        />
                      ) : (
                        <div className="avatar-placeholder">
                          {participant.guest_avatar}
                        </div>
                      )
                    ) : (
                      <div className="avatar-placeholder">
                        {participant.guest_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="user-info">
                    <span className="username">{participant.guest_name}</span>
                    {participant.is_host && !participant.is_spectator && (
                      <span className="host-badge">👑 Host</span>
                    )}
                    {participant.is_host && participant.is_spectator && (
                      <span className="spectator-badge">👁️ Spectator</span>
                    )}
                  </div>
                  <div className="join-time">
                    {new Date(participant.joined_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </motion.div>
              ))}

              {/* Empty slots */}
              {Array.from({
                length:
                  roomState.room.max_players - roomState.room.participants.length,
              }).map((_, index) => (
                <div key={`empty-${index}`} className="user-item empty">
                  <div className="user-avatar">
                    <div className="avatar-placeholder empty">?</div>
                  </div>
                  <div className="user-info">
                    <span className="username empty">Waiting for player...</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Action Buttons */}
        <motion.div
          className="setup-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.2 }}
        >
          {isHostView  ? (
            <>
              <button
                className="back-btn secondary"
                onClick={handleBackToModeSelection}
              >
                ← Change Mode
              </button>
              <button
                className="start-quiz-btn"
                onClick={handleStartQuiz}
                disabled={
                  roomState.room.participants.length < 1 ||
                  roomState.room.status !== 'waiting'
                }
              >
                🚀 Start Quiz
              </button>
              <button
                className="remove-host-btn"
                onClick={handleRemoveHost}
              >
                👁️ Become Spectator
              </button>
            </>
          ) : (
            <>
              <button
                className="leave-lobby-btn"
                onClick={handleLeaveLobby}
              >
                ← Leave Lobby
              </button>
              <div className="waiting-message">
                Waiting for host to start the quiz...
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

// Helper functions
function generateRoomId(): string {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function generatePIN(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}