import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, QuizRound, QuizRoundItem, Quiz, RoomParticipant } from '../api';
import './QuizRoundPlayer.css';

type RatingRow = {
  participant_id: string;
  participant_name: string;
  total_score: number;
  rating_change?: number;
};

type LocationState = {
  roomId?: string;

  quizRound?: QuizRound;
  quizRoundId?: string;

  // who am I (optional but useful)
  isHost?: boolean;
  currentParticipantId?: string | null;
  participants?: RoomParticipant[];

  // round progress
  roundIndex?: number;

  // returned after a quiz ends
  finalRatings?: RatingRow[];
};

export const QuizRoundPlayer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (location.state as LocationState | null) ?? null;

  console.log('QuizRoundPlayer location.state =', location.state);

  const roomId = nav?.roomId ?? null;

  const quizRoundId = useMemo(() => {
    return nav?.quizRound?.id || nav?.quizRoundId || null;
  }, [nav?.quizRound?.id, nav?.quizRoundId]);

  const isHost = !!nav?.isHost;
  const currentParticipantId = nav?.currentParticipantId ?? null;
  const participants = nav?.participants ?? [];

  const [quizRound, setQuizRound] = useState<QuizRound | null>(nav?.quizRound ?? null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roundIndex, setRoundIndex] = useState<number>(nav?.roundIndex ?? 0);
  const [finalRatings, setFinalRatings] = useState<RatingRow[] | null>(nav?.finalRatings ?? null);

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  const items: QuizRoundItem[] = useMemo(() => {
    const list = quizRound?.round_items ?? [];
    return list.slice().sort((a, b) => a.order_index - b.order_index);
  }, [quizRound]);

  console.log('ITEMS:', items)

  const currentItem = items[roundIndex] ?? null;
  const isLast = items.length > 0 ? roundIndex >= items.length - 1 : true;

  console.log('Round debug:', {
    isHost,
    quizRoundId,
    hasQuizRound: !!quizRound,
    roundIndex,
    itemsLen: items.length,
    currentItem,
    finalRatings,
    quizRoundObj: quizRound,
  });

  // Guard: need roomId to coordinate multiplayer
  useEffect(() => {
    if (!roomId) {
      navigate('/', { replace: true });
    }
  }, [roomId, navigate]);

  // Load round details (including round_items) if missing
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!quizRoundId) return;

      // Only skip fetching if we already have items
      const hasItems = Array.isArray((quizRound as any)?.round_items) && (quizRound as any).round_items.length > 0;
      if (hasItems) return;

      try {
        setLoadingRound(true);
        setError(null);

        const fetched = await api.getQuizRound(quizRoundId);
        if (!cancelled) setQuizRound(fetched);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError(e?.message || 'Failed to load quiz round');
      } finally {
        if (!cancelled) setLoadingRound(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [quizRoundId, quizRound]);

  // Keep state in sync when we return back from a cooperative player
  useEffect(() => {
    // location.key changes on navigation even to same path
    setFinalRatings(nav?.finalRatings ?? null);
    if (typeof nav?.roundIndex === 'number') {
      setRoundIndex(nav.roundIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // WS: listen for host-driven navigation (start/next/results)
  useEffect(() => {
    mountedRef.current = true;
    if (!roomId) return;

    const ws = api.connectToRoomWebSocket(roomId);
    wsRef.current = ws;

    const onMessage = (evt: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        const msg = JSON.parse(evt.data);
        const { type, data } = msg || {};

        // Host may broadcast these so guests follow
        if (type === 'quiz_round_intro') {
          const nextIndex = Number(data?.round_index ?? 0);
          if (Number.isFinite(nextIndex)) {
            setFinalRatings(null);
            setRoundIndex(nextIndex);
          }
        }

        if (type === 'quiz_round_results') {
          const finals = (data?.final_ratings ?? null) as RatingRow[] | null;
          if (Array.isArray(finals)) setFinalRatings(finals);
        }

        // You already use these types in your lobby/players:
        if (type === 'cooperative_quiz_start') {
          const quiz_id = data?.quiz_id as string | undefined;
          if (quiz_id) {
            // If guests are on this screen, they should follow into the quiz
            void startQuizById(quiz_id, 'classic', /*broadcast*/ false);
          }
        }

        if (type === 'cooperative_jeopardy_start') {
          const quiz_id = data?.quiz_id as string | undefined;
          if (quiz_id) {
            void startQuizById(quiz_id, 'jeopardy', /*broadcast*/ false);
          }
        }
      } catch {
        // ignore
      }
    };

    try {
      ws.addEventListener('message', onMessage);

    } catch (e) {
      console.warn('WS connection failed (round can still work host-only):', e);
      wsRef.current = null;
    }

    return () => {
      mountedRef.current = false;
      ws.removeEventListener('message', onMessage);
      wsRef.current = null;
      // IMPORTANT: don't disconnect here if other screens still need the same socket
      // api.disconnectFromRoomWebSocket(roomId);
    };

    // return () => {
    //   mountedRef.current = false;
    //   if (roomId) api.disconnectFromRoomWebSocket(roomId);
    //   wsRef.current = null;
    // };
  }, [roomId]);

  const startQuizById = async (quizId: string, quizType: string, broadcast: boolean) => {
    const type = (quizType === 'jeopardy' ? 'jeopardy' : 'classic') as Quiz['type'];
    const route = type === 'jeopardy' ? '/cooperative-jeopardy' : '/cooperative-quiz';

    if (broadcast && wsRef.current) {
      const wsType = type === 'jeopardy' ? 'cooperative_jeopardy_start' : 'cooperative_quiz_start';
      try {
        wsRef.current.send(
          JSON.stringify({
            type: wsType,
            data: { room_id: roomId, quiz_id: quizId },
            timestamp: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn('Failed to broadcast quiz start:', e);
      }
    }

    // Minimal Quiz object; your cooperative players can fetch questions themselves if needed
    const quiz: Quiz = {
      id: quizId,
      title: currentItem?.quiz_title ?? '',
      description: currentItem?.quiz_description ?? '',
      type,
      questions_count: 0,
      settings: {},
      questions: [],
    };

    navigate(route, {
      state: {
        quiz,
        roomId,
        isHost,
        currentParticipantId,
        participants,

        // IMPORTANT: allow cooperative players to return here when finished
        roundContext: {
          quizRoundId,
          roundIndex,
          returnTo: '/quiz-round-player',
        },
      },
    });
  };

  const handleStart = async () => {
    if (!isHost) return;
    if (!currentItem) return;
    if (!roomId) return;

    await startQuizById(currentItem.quiz_id, currentItem.quiz_type, /*broadcast*/ true);
  };

  const handleNext = () => {
    if (!isHost) return;

    if (isLast) {
      // Final ranking screen not implemented here yet.
      // For now you can route to a "final ranking" page when you add it.
      navigate('/', { replace: true });
      return;
    }

    const nextIndex = roundIndex + 1;
    setFinalRatings(null);
    setRoundIndex(nextIndex);

    // Tell guests to also show next intro
    if (wsRef.current) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'quiz_round_intro',
            data: { round_index: nextIndex },
            timestamp: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn('Failed to broadcast next intro:', e);
      }
    }
  };

  const backToDashboard = () => navigate('/', { replace: true });

  if (loadingRound) {
    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h2>Loading quiz round…</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h2>Could not open round</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
        <button type="button" onClick={backToDashboard}>
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!quizRoundId || !quizRound) {
    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h2>Round not found</h2>
        <button type="button" onClick={backToDashboard}>
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h1>{quizRound.title}</h1>
        {quizRound.description && <p>{quizRound.description}</p>}
        <p>No round items found.</p>
        <button type="button" onClick={backToDashboard}>
          Back to dashboard
        </button>
      </div>
    );
  }

  // Results screen
  if (finalRatings) {
    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h1>Rating</h1>

        <div style={{ marginTop: 8 }}>
          <strong>Round:</strong> {quizRound.title}
        </div>

        <div style={{ marginTop: 8 }}>
          <strong>Quiz:</strong> {currentItem.quiz_title} ({currentItem.quiz_type})
        </div>

        <div style={{ marginTop: 16 }}>
          <ol>
            <ol className="qrpList">
              {finalRatings
                .slice()
                .sort((a, b) => b.total_score - a.total_score)
                .map((r) => (
                  <li className="qrpListItem" key={r.participant_id}>
                    <span>{r.participant_name}</span>
                    <span className="qrpScore">{r.total_score}</span>
                  </li>
                ))}
            </ol>
          </ol>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {isHost ? (
            <button type="button" onClick={handleNext}>
              {isLast ? 'Final rating' : 'Next round'}
            </button>
          ) : (
            <div>Waiting for host…</div>
          )}

          <button type="button" onClick={backToDashboard}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  // Intro screen
  return (
    <div className="qrpPage">
      <div className="qrpCard">
        <div className="qrpHeader">
          <div className="qrpTitleBlock">
            <h1 className="qrpTitle">{quizRound.title}</h1>
            {quizRound.description && <p className="qrpSub">{quizRound.description}</p>}
          </div>

          <div className="qrpBadgeRow">
            <span className="qrpBadge">
              <span className="qrpBadgeStrong">Step</span> {roundIndex + 1} / {items.length}
            </span>
            <span className="qrpBadge">
              <span className="qrpBadgeStrong">Type</span> {currentItem.quiz_type}
            </span>
          </div>
        </div>

        <div className="qrpDivider" />

        <div>
          <div className="qrpSectionTitle">Up next</div>

          <div className="qrpMetaGrid">
            <div className="qrpMetaCard">
              <div className="qrpMetaLabel">Quiz</div>
              <p className="qrpMetaValue">{currentItem.quiz_title}</p>
            </div>

            <div className="qrpMetaCard">
              <div className="qrpMetaLabel">Description</div>
              <p className="qrpMetaValue qrpMuted">
                {currentItem.quiz_description ? currentItem.quiz_description : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="qrpActions">
          {isHost ? (
            <button className="qrpButton qrpButtonPrimary" type="button" onClick={handleStart}>
              Start round
            </button>
          ) : (
            <div className="qrpMuted">Waiting for host to start…</div>
          )}

          <button className="qrpButton" type="button" onClick={backToDashboard}>
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};