import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, QuizRound, QuizRoundItem, Quiz, RoomParticipant } from '../api';
import './QuizRoundPlayer.css';

type RatingRow = {
  participant_id: string;
  participant_name: string;
  total_score: number;
  rating_change?: number;
  // Extended for total ratings - separate Jeopardy and Classic scoring
  jeopardy_dollars?: number;
  classic_points?: number;
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
  // Accumulate ratings across completed quizzes in this round (by participant)
  const [accumulated, setAccumulated] = useState<Record<string, { name: string; jeopardy_dollars: number; classic_points: number }>>({});

  // Persist/restore accumulated totals so they survive navigation between screens
  useEffect(() => {
    if (!quizRoundId) return;
    try {
      const raw = localStorage.getItem(`qr_accum_${quizRoundId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { name: string; jeopardy_dollars: number; classic_points: number }>;
        if (parsed && typeof parsed === 'object') {
          setAccumulated(prev => ({ ...parsed, ...prev }));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizRoundId]);

  useEffect(() => {
    if (!quizRoundId) return;
    try {
      localStorage.setItem(`qr_accum_${quizRoundId}` , JSON.stringify(accumulated));
    } catch {}
  }, [quizRoundId, accumulated]);

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  const items: QuizRoundItem[] = useMemo(() => {
    const list = quizRound?.round_items ?? [];
    return list.slice().sort((a, b) => a.order_index - b.order_index);
  }, [quizRound]);

  console.log('ITEMS:', items)

  const currentItem = items[roundIndex] ?? null;
  const isLast = items.length === 0 ? true : (items.length > 0 ? roundIndex >= items.length - 1 : true);

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
    // Merge any ratings passed via navigation into the accumulator
    if (Array.isArray(nav?.finalRatings) && nav!.finalRatings!.length > 0) {
      setAccumulated((prev) => {
        const next = { ...prev };
        for (const r of nav!.finalRatings!) {
          const pid = r.participant_id;
          const name = r.participant_name;
          const jd = r.jeopardy_dollars ?? 0;
          const cp = r.classic_points ?? 0;
          const cur = next[pid] ?? { name, jeopardy_dollars: 0, classic_points: 0 };
          next[pid] = {
            name: cur.name || name,
            jeopardy_dollars: cur.jeopardy_dollars + jd,
            classic_points: cur.classic_points + cp,
          };
        }
        return next;
      });
    }
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
          if (Array.isArray(finals)) {
            setFinalRatings(finals);
            // Also merge into accumulator
            setAccumulated((prev) => {
              const next = { ...prev };
              for (const r of finals) {
                const pid = r.participant_id;
                const name = r.participant_name;
                const jd = r.jeopardy_dollars ?? 0;
                const cp = r.classic_points ?? 0;
                const cur = next[pid] ?? { name, jeopardy_dollars: 0, classic_points: 0 };
                next[pid] = {
                  name: cur.name || name,
                  jeopardy_dollars: cur.jeopardy_dollars + jd,
                  classic_points: cur.classic_points + cp,
                };
              }
              return next;
            });
          }
        }

        // Accept end-of-quiz results from cooperative classic and jeopardy players and accumulate
        if (type === 'cooperative_quiz_end') {
          const parts = (data?.participants ?? []) as Array<{ participant_id: string; participant_name: string; total_score: number }>;
          if (Array.isArray(parts) && parts.length > 0) {
            setAccumulated((prev) => {
              const next = { ...prev };
              for (const p of parts) {
                const cur = next[p.participant_id] ?? { name: p.participant_name, jeopardy_dollars: 0, classic_points: 0 };
                next[p.participant_id] = {
                  name: cur.name || p.participant_name,
                  jeopardy_dollars: cur.jeopardy_dollars,
                  classic_points: cur.classic_points + (p.total_score || 0),
                };
              }
              return next;
            });
          }
        }

        if (type === 'cooperative_jeopardy_quiz_end') {
          // Some senders emit final_ratings, others may send participants. Support both.
          const finals = (data?.final_ratings ?? null) as Array<{ participant_id: string; participant_name: string; total_score: number }> | null;
          if (Array.isArray(finals) && finals.length > 0) {
            setAccumulated((prev) => {
              const next = { ...prev };
              for (const r of finals) {
                const cur = next[r.participant_id] ?? { name: r.participant_name, jeopardy_dollars: 0, classic_points: 0 };
                next[r.participant_id] = {
                  name: cur.name || r.participant_name,
                  jeopardy_dollars: cur.jeopardy_dollars + (r.total_score || 0),
                  classic_points: cur.classic_points,
                };
              }
              return next;
            });
          } else {
            const parts = (data?.participants ?? []) as Array<{ participant_id: string; participant_name: string; total_score: number }>;
            if (Array.isArray(parts) && parts.length > 0) {
              setAccumulated((prev) => {
                const next = { ...prev };
                for (const p of parts) {
                  const cur = next[p.participant_id] ?? { name: p.participant_name, jeopardy_dollars: 0, classic_points: 0 };
                  next[p.participant_id] = {
                    name: cur.name || p.participant_name,
                    jeopardy_dollars: cur.jeopardy_dollars + (p.total_score || 0),
                    classic_points: cur.classic_points,
                  };
                }
                return next;
              });
            }
          }
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

  // Show total ratings strictly after the last item has been completed
  const shouldShowTotalRatings = items.length > 0 && roundIndex >= items.length;
  console.log('=== TOTAL RATINGS DEBUG ===');
  console.log('shouldShowTotalRatings:', shouldShowTotalRatings);
  console.log('items.length:', items.length);
  console.log('roundIndex:', roundIndex);
  console.log('roundIndex >= items.length:', roundIndex >= items.length);
  console.log('================================');

  if (shouldShowTotalRatings) {
    console.log('SHOWING TOTAL RATINGS NOW!!!');
    // Prefer accumulated multi-quiz totals; otherwise fall back to any provided finalRatings; otherwise derive empty rows
    const totalRatingsData: RatingRow[] = Object.keys(accumulated).length > 0
      ? Object.entries(accumulated).map(([pid, v]) => ({
          participant_id: pid,
          participant_name: v.name,
          total_score: (v.jeopardy_dollars || 0) + (v.classic_points || 0),
          jeopardy_dollars: v.jeopardy_dollars || 0,
          classic_points: v.classic_points || 0,
        }))
      : ((finalRatings && finalRatings.length > 0)
          ? finalRatings
          : (participants && participants.length > 0
            ? participants
                .filter(p => !p.is_host && !p.is_spectator)
                .map(p => ({
                  participant_id: p.id,
                  participant_name: p.guest_name || 'Unknown',
                  total_score: 0,
                  rating_change: 0,
                  jeopardy_dollars: 0,
                  classic_points: 0,
                }))
            : []));

    const sortedRatings = totalRatingsData.slice().sort((a, b) => {
      const jdA = a.jeopardy_dollars ?? 0;
      const jdB = b.jeopardy_dollars ?? 0;
      if (jdB !== jdA) return jdB - jdA;
      const cpA = a.classic_points ?? 0;
      const cpB = b.classic_points ?? 0;
      return cpB - cpA;
    });

    return (
      <div style={{ minHeight: '100vh', padding: 24 }}>
        <h1>Total Ratings</h1>

        <div style={{ marginTop: 8 }}>
          <strong>Quiz Round:</strong> {quizRound.title}
        </div>

        <div style={{ marginTop: 16 }}>
          <p>All rounds completed! Here are the total ratings:</p>

          <div style={{ marginTop: 20 }}>
            <h3>Final Rankings</h3>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {sortedRatings.map((r, index) => (
                <li key={r.participant_id} style={{
                  margin: '10px 0',
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: index === 0 ? '#fff8e1' : index === 1 ? '#f4f6f8' : index === 2 ? '#fff3e0' : '#ffffff',
                  border: index < 3 ? '2px solid #ffb300' : '1px solid #e5e7eb',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{r.participant_name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                          ${r.jeopardy_dollars ?? 0}
                        </div>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>
                          +{r.classic_points ?? 0} pts
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.8em', color: '#666' }}>
                    Rank #{index + 1}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="button" onClick={backToDashboard}>
            Back to dashboard
          </button>
        </div>
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