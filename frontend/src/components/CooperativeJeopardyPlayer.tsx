import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  api,
  type Quiz,
  type Question,
  type RoomParticipant,
  resolveMediaUrl,
} from '../api';
import './CooperativeJeopardyPlayer.css';

type LocationState = {
  roomId: string;
  quiz: Quiz;
  isHost: boolean;
  currentParticipantId: string | null;
  participants: RoomParticipant[];
};

type JeopardyChooser = {
  chooser_id: string;
  chooser_name: string;
  is_initial: boolean;
};

type RatingRow = {
  participant_id: string;
  participant_name: string;
  total_score: number;
  rating_change: number;
};

type AnswerRecord = {
  participant_id: string;
  participant_name: string;
  participant_avatar?: string | null; // NEW: avatar in results rows
  question_id: string;
  answer_id: string; // MC: answer option id; short_answer: typed text; or "NO_ANSWER"
  is_correct: boolean;
  time_taken: number; // ms
};

type ResultsPayload = {
  question_id: string;
  all_answers: AnswerRecord[];
  ratings: RatingRow[];
};

type FinalPayload = {
  final_ratings: RatingRow[];
};

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function groupQuestionsByCategory(questions: Question[]): Map<string, Question[]> {
  const map = new Map<string, Question[]>();
  for (const q of questions) {
    const cat = (((q as any).category as string) || 'Uncategorized') as string;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(q);
  }
  return map;
}

function getActivePlayersExcludingHost(participants: RoomParticipant[]): RoomParticipant[] {
  return (participants || []).filter(p => p.is_active && !p.is_spectator && !p.is_host);
}

function getQuestionByCategoryAndPoints(
  questions: Question[],
  category: string,
  points: number
): Question | undefined {
  return questions.find(
    q =>
      (((q as any).category as string) || 'Uncategorized') === category &&
      Number((q as any).points) === points
  );
}

function getCanonicalShortAnswerText(question: any): string | null {
  const fromField = (question?.correct_answer as string | undefined)?.trim();
  if (fromField) return fromField;

  const fromAnswers = (question?.answers || []).find((a: any) => a.is_correct)?.answer?.trim();
  return fromAnswers || null;
}

function isQuestionCorrect(question: any, answerIdOrText: string): boolean {
  if (!question) return false;
  if (!answerIdOrText || answerIdOrText === 'NO_ANSWER') return false;

  if (question.type === 'short_answer') {
    const canonical = getCanonicalShortAnswerText(question)?.trim().toLowerCase();
    const user = String(answerIdOrText).trim().toLowerCase();
    return canonical ? user === canonical : false;
  }

  const answers = question.answers || [];
  const found = answers.find((a: any) => a.id === answerIdOrText);
  return !!found?.is_correct;
}

function findAnswerText(question: any, answerIdOrText: string): string {
  if (!answerIdOrText) return '';
  if (answerIdOrText === 'NO_ANSWER') return '—';

  if (question?.type === 'short_answer') return String(answerIdOrText);

  const a = (question?.answers || []).find((x: any) => x.id === answerIdOrText);
  return a?.answer ?? '(unknown option)';
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPlayableCellIds(questions: Question[]): Set<string> {
  const s = new Set<string>();
  for (const q of questions) {
    const cat = String((q as any).category || 'Uncategorized');
    const pts = Number((q as any).points ?? 0);
    if (!cat || !pts) continue;
    s.add(`${cat}::${pts}`);
  }
  return s;
}

function countIntersection(a: Set<string>, b: Set<string>): number {
  let c = 0;
  a.forEach(x => {
    if (b.has(x)) c++;
  });
  return c;
}

function getParticipantAvatar(
  participants: RoomParticipant[],
  rec: { participant_id: string; participant_avatar?: string | null }
): string | null {
  if (rec.participant_avatar) return rec.participant_avatar;
  const p = participants.find(x => x.id === rec.participant_id);
  return ((p as any)?.guest_avatar as string | undefined) ?? null;
}

export const CooperativeJeopardyPlayer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const nav = useMemo(() => {
    const s = (location.state || {}) as Partial<LocationState>;
    return {
      roomId: s.roomId ?? null,
      quiz: (s.quiz ?? null) as Quiz | null,
      isHost: !!s.isHost,
      currentParticipantId: s.currentParticipantId ?? null,
      participants: s.participants ?? [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quiz = nav.quiz;

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);

  // Participants
  const [participants, setParticipants] = useState<RoomParticipant[]>(nav.participants);
  const participantsRef = useRef<RoomParticipant[]>(nav.participants);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(
    nav.currentParticipantId
  );

  const [hostParticipantId, setHostParticipantId] = useState<string | null>(null);
  useEffect(() => {
    const hostP = participants.find(p => p.is_host);
    setHostParticipantId(hostP?.id ?? null);
  }, [participants]);

  const activePlayers = useMemo(() => getActivePlayersExcludingHost(participants), [participants]);

  // Load questions
  const [loadingQuiz, setLoadingQuiz] = useState<boolean>(false);
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>(
    () => (((quiz as any)?.questions ?? []) as Question[])
  );

  useEffect(() => {
    const run = async () => {
      if (!quiz?.id) return;

      const embedded = ((quiz as any).questions ?? []) as any[];
      if (Array.isArray(embedded) && embedded.length > 0) {
        setLoadedQuestions(embedded);
        return;
      }

      try {
        setLoadingQuiz(true);
        const qs = await api.getQuestionsByQuiz(quiz.id);

        const withAnswers = await Promise.all(
          qs.map(async (q: any) => {
            const answers = await api.getAnswersByQuestion(q.id!);
            return { ...q, answers };
          })
        );

        setLoadedQuestions(withAnswers);
      } catch (e) {
        console.error('Failed to load quiz questions:', e);
        setLoadedQuestions([]);
      } finally {
        setLoadingQuiz(false);
      }
    };

    void run();
  }, [quiz?.id]);

  const questions: Question[] = useMemo(() => loadedQuestions, [loadedQuestions]);

  // Board
  const categoriesMap = useMemo(() => groupQuestionsByCategory(questions), [questions]);
  const categoryNames = useMemo(() => Array.from(categoriesMap.keys()), [categoriesMap]);
  const pointValues = useMemo(() => [100, 200, 300, 400, 500], []);
  const gridCols = `repeat(${Math.max(categoryNames.length, 1)}, minmax(140px, 1fr))`;
  const makeCellId = (category: string, points: number) => `${category}::${points}`;

  // Stages
  const [stage, setStage] = useState<'BOARD' | 'QUESTION' | 'RESULTS' | 'FINAL'>('BOARD');

  // Chooser
  const [chooser, setChooser] = useState<JeopardyChooser | null>(null);

  // Revealed cells
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const lastPickedCellRef = useRef<{ category: string; points: number } | null>(null);
  const [hasFirstQuestionStarted, setHasFirstQuestionStarted] = useState<boolean>(false);

  // Current question
  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const isShortAnswer = currentQuestion?.type === 'short_answer';

  // Answer inputs
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [shortAnswerDraft, setShortAnswerDraft] = useState<string>('');
  const [mySubmitted, setMySubmitted] = useState(false);

  // Timer
  const [timeLimitSec, setTimeLimitSec] = useState<number>(20);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [questionOpen, setQuestionOpen] = useState(false);
  const questionStartMsRef = useRef<number>(0);

  // Per-question answers
  const [participantAnswers, setParticipantAnswers] = useState<
    Map<string, { answer_id: string; time_taken: number }>
  >(new Map());
  const participantAnswersRef = useRef(participantAnswers);

  useEffect(() => {
    participantAnswersRef.current = participantAnswers;
  }, [participantAnswers]);

  // Results + final
  const [lastResults, setLastResults] = useState<ResultsPayload | null>(null);
  const [finalRatings, setFinalRatings] = useState<RatingRow[] | null>(null);

  // Totals
  const totalsRef = useRef<Map<string, number>>(new Map());
  const [scoreboard, setScoreboard] = useState<RatingRow[]>([]);

  // Playable cells (only cells that actually have a question)
  const playableCellIds = useMemo(() => buildPlayableCellIds(questions), [questions]);
  const playableCellIdsRef = useRef(playableCellIds);
  useEffect(() => {
    playableCellIdsRef.current = playableCellIds;
  }, [playableCellIds]);

  const playableTotal = playableCellIds.size;
  const playableDone = useMemo(
    () => countIntersection(revealedCells, playableCellIds),
    [revealedCells, playableCellIds]
  );

  // Participants status (Classic-like)
  const activeParticipants = useMemo(() => activePlayers, [activePlayers]);

  const waitingForAnswers = useMemo(() => {
    const waiting = new Set<string>();
    for (const p of activeParticipants) {
      if (!participantAnswers.has(p.id)) waiting.add(p.id);
    }
    return waiting;
  }, [activeParticipants, participantAnswers]);

  const answeredCount = useMemo(
    () => activeParticipants.length - waitingForAnswers.size,
    [activeParticipants, waitingForAnswers]
  );
  const totalParticipants = useMemo(() => activeParticipants.length, [activeParticipants]);

  const iAmChooser = useMemo(() => {
    if (!chooser) return false;
    if (nav.isHost) return !!hostParticipantId && chooser.chooser_id === hostParticipantId;
    return !!currentParticipantId && chooser.chooser_id === currentParticipantId;
  }, [chooser, nav.isHost, hostParticipantId, currentParticipantId]);

  const canPickCell = useMemo(() => {
    if (stage !== 'BOARD') return false;
    if (questionOpen) return false;

    // first question: host picks (only once)
    if (!chooser) return nav.isHost && !hasFirstQuestionStarted;

    // after chooser assigned: chooser picks
    return iAmChooser;
  }, [stage, questionOpen, chooser, nav.isHost, iAmChooser, hasFirstQuestionStarted]);

  const computeFinalRatings = useCallback((): RatingRow[] => {
    const active = getActivePlayersExcludingHost(participantsRef.current);
    return active
      .map(p => ({
        participant_id: p.id,
        participant_name: p.guest_name,
        total_score: totalsRef.current.get(p.id) ?? 0,
        rating_change: 0,
      }))
      .sort((a, b) => b.total_score - a.total_score);
  }, []);

  // Timer ticking
  useEffect(() => {
    if (!questionOpen) return;

    setTimeLeftSec(timeLimitSec);
    const interval = window.setInterval(() => setTimeLeftSec(prev => prev - 1), 1000);
    return () => window.clearInterval(interval);
  }, [questionOpen, timeLimitSec]);

  // Host: finalize -> results (accept snapshot to avoid last-answer race)
  const hostFinalizeToResults = useCallback(
    async (answersSnapshot?: Map<string, { answer_id: string; time_taken: number }>) => {
      if (!nav.isHost || !wsRef.current || !nav.roomId || !currentQuestion?.id) return;

      const active = getActivePlayersExcludingHost(participantsRef.current);
      const answersMap = answersSnapshot ?? participantAnswersRef.current;

      const all_answers: AnswerRecord[] = active.map(p => {
        const existing = answersMap.get(p.id);
        const answer_id = existing?.answer_id ?? 'NO_ANSWER';
        const time_taken = existing?.time_taken ?? 0;

        return {
          participant_id: p.id,
          participant_name: p.guest_name,
          participant_avatar: (p as any).guest_avatar ?? null,
          question_id: currentQuestion.id!,
          answer_id,
          is_correct: isQuestionCorrect(currentQuestion, answer_id),
          time_taken,
        };
      });

      const pts = Number((currentQuestion as any).points ?? 0);

      const nextTotals = new Map(totalsRef.current);
      const ratings: RatingRow[] = active.map(p => {
        const a = all_answers.find(x => x.participant_id === p.id)!;
        const change = a.answer_id === 'NO_ANSWER' ? 0 : a.is_correct ? +pts : -pts;
        const newTotal = (nextTotals.get(p.id) ?? 0) + change;
        nextTotals.set(p.id, newTotal);

        return {
          participant_id: p.id,
          participant_name: p.guest_name,
          total_score: newTotal,
          rating_change: change,
        };
      });

      totalsRef.current = nextTotals;

      await api.sendCooperativeJeopardyQuestionResults(wsRef.current, nav.roomId, {
        question_id: currentQuestion.id!,
        all_answers,
        ratings,
      });

      setLastResults({ question_id: currentQuestion.id!, all_answers, ratings });
      setScoreboard(ratings);
      setQuestionOpen(false);
      setStage('RESULTS');
    },
    [nav.isHost, nav.roomId, currentQuestion]
  );

  // Time expiry -> host finalize
  useEffect(() => {
    if (!questionOpen) return;
    if (timeLeftSec > 0) return;
    if (nav.isHost) void hostFinalizeToResults();
  }, [timeLeftSec, questionOpen, nav.isHost, hostFinalizeToResults]);

  // Host: Continue -> reveal cell + pick next chooser OR end game (PREFERENCE: end on Continue)
  const hostContinueAfterResults = useCallback(async () => {
    if (!nav.isHost || !wsRef.current || !nav.roomId || !lastResults) return;

    const picked = lastPickedCellRef.current;
    const cat = picked?.category ?? ((currentQuestion as any)?.category || 'Uncategorized');
    const pts = picked?.points ?? Number((currentQuestion as any)?.points ?? 0);

    const justPlayedId = cat && pts ? makeCellId(cat, pts) : null;

    // Deterministic next revealed set (do not rely on async setState timing)
    const nextRevealed = new Set(revealedCells);
    if (justPlayedId) nextRevealed.add(justPlayedId);

    // Commit reveal in UI
    if (justPlayedId) setRevealedCells(nextRevealed);

    // Finished?
    const playableIds = playableCellIdsRef.current;
    const totalPlayable = playableIds.size;
    const donePlayable = countIntersection(nextRevealed, playableIds);
    const isFinished = totalPlayable > 0 && donePlayable >= totalPlayable;

    if (isFinished) {
      const finals = computeFinalRatings();

      // Broadcast end (works even if server doesn't implement an API helper)
      wsRef.current.send(
        JSON.stringify({
          type: 'cooperative_jeopardy_quiz_end',
          data: { final_ratings: finals } as FinalPayload,
          timestamp: new Date().toISOString(),
        })
      );

      setFinalRatings(finals);
      setStage('FINAL');
      return;
    }

    // Not finished -> choose next chooser
    const active = getActivePlayersExcludingHost(participantsRef.current);

    const winners = lastResults.all_answers
      .filter(a => a.is_correct)
      .map(a => ({ id: a.participant_id, name: a.participant_name }));

    const pool =
      winners.length > 0
        ? winners
        : active.map(p => ({ id: p.id, name: p.guest_name }));

    const next = pickRandom(pool);

    if (next) {
      await api.sendCooperativeJeopardyChooserSelected(wsRef.current, nav.roomId, {
        chooser_id: next.id,
        chooser_name: next.name,
        is_initial: false,
        revealed_cell: { category: cat, points: pts },
      } as any);
    } else {
      setStage('BOARD');
    }

    // reset for next question pick
    setParticipantAnswers(new Map());
    participantAnswersRef.current = new Map();
    setSelectedAnswerId(null);
    setShortAnswerDraft('');
    setMySubmitted(false);
    setCurrentQuestion(null);
    setQuestionOpen(false);
    setLastResults(null);
    setStage('BOARD');
  }, [
    nav.isHost,
    nav.roomId,
    lastResults,
    currentQuestion,
    revealedCells,
    computeFinalRatings,
  ]);

  // Host: start game
  const startCategories = useMemo(() => categoryNames, [categoryNames]);
  const hostStartGame = useCallback(async () => {
    if (!nav.isHost || !wsRef.current || !nav.roomId || !quiz) return;

    await api.sendCooperativeJeopardyStart(wsRef.current, nav.roomId, {
      quiz_data: { quiz_id: quiz.id },
      categories: startCategories,
    });
  }, [nav.isHost, nav.roomId, quiz, startCategories]);

  // Board: click cell -> start question
  const handleCellClick = useCallback(
    async (category: string, points: number) => {
      if (!wsRef.current || !nav.roomId) return;
      if (!canPickCell) return;
      if (stage !== 'BOARD') return;

      const id = makeCellId(category, points);
      if (revealedCells.has(id)) return;

      const q = getQuestionByCategoryAndPoints(questions, category, points);
      if (!q) return;

      lastPickedCellRef.current = { category, points };

      await api.sendCooperativeJeopardyQuestionStarted(wsRef.current, nav.roomId, {
        question: q,
        time_limit: timeLimitSec,
        cell: { category, points },
      } as any);
    },
    [nav.roomId, canPickCell, stage, revealedCells, questions, timeLimitSec]
  );

  // Submit answer / skip
  const submitAnswer = useCallback(
    async (answerIdOrText: string) => {
      if (!wsRef.current || !nav.roomId || !currentQuestion?.id || !currentParticipantId) return;
      if (!questionOpen) return;
      if (mySubmitted) return;

      const time_taken_ms = Math.max(0, Date.now() - (questionStartMsRef.current || Date.now()));

      await api.sendCooperativeJeopardyAnswerSubmit(wsRef.current, nav.roomId, {
        question_id: currentQuestion.id!,
        answer_id: answerIdOrText,
        participant_id: currentParticipantId,
        time_taken_ms,
      });

      // optimistic update
      const next = new Map(participantAnswersRef.current);
      next.set(currentParticipantId, { answer_id: answerIdOrText, time_taken: time_taken_ms });
      participantAnswersRef.current = next;
      setParticipantAnswers(next);

      setMySubmitted(true);
    },
    [nav.roomId, currentQuestion, currentParticipantId, questionOpen, mySubmitted]
  );

  const submitSelected = useCallback(async () => {
    if (!currentQuestion) return;

    if (currentQuestion.type === 'short_answer') {
      const text = (shortAnswerDraft ?? '').trim();
      if (!text) return;
      await submitAnswer(text);
      return;
    }

    if (!selectedAnswerId) return;
    await submitAnswer(selectedAnswerId);
  }, [currentQuestion, shortAnswerDraft, selectedAnswerId, submitAnswer]);

  const skipAnswer = useCallback(async () => {
    await submitAnswer('NO_ANSWER');
  }, [submitAnswer]);

  // WS connect & message handling
  useEffect(() => {
    if (!nav.roomId) return;

    const ws = api.connectToRoomWebSocket(nav.roomId);
    wsRef.current = ws;

    ws.onmessage = event => {
      const msg = typeof event.data === 'string' ? safeJsonParse(event.data) : null;
      if (!msg) return;

      const { type, data } = msg;

      switch (type) {
        case 'room_state': {
          if (data?.participants) setParticipants(data.participants);
          if (typeof data?.current_participant_id === 'string') {
            setCurrentParticipantId(data.current_participant_id);
          }
          break;
        }

        case 'cooperative_jeopardy_start': {
          // board already visible
          break;
        }

        case 'cooperative_jeopardy_question_started': {
          const q = data.question;

          const cell = data.cell;
          if (cell?.category && cell?.points) {
            lastPickedCellRef.current = {
              category: String(cell.category),
              points: Number(cell.points),
            };
          } else {
            const cat = (q?.category || 'Uncategorized') as string;
            const pts = Number(q?.points ?? 0);
            if (cat && pts) lastPickedCellRef.current = { category: cat, points: pts };
          }

          setHasFirstQuestionStarted(true);

          setCurrentQuestion(q);
          setTimeLimitSec(Number(data.time_limit ?? 20));

          setParticipantAnswers(new Map());
          participantAnswersRef.current = new Map();
          setSelectedAnswerId(null);
          setShortAnswerDraft('');
          setMySubmitted(false);

          questionStartMsRef.current = Date.now();
          setQuestionOpen(true);
          setStage('QUESTION');
          break;
        }

        case 'cooperative_jeopardy_answer_submitted': {
          const pid = data.participant_id as string | undefined;
          const answer_id = data.answer_id as string | undefined;
          const time_taken = Number(data.time_taken_ms ?? data.time_taken ?? 0);
          if (!pid || !answer_id) break;

          const now = new Map(participantAnswersRef.current);
          now.set(pid, { answer_id, time_taken });
          participantAnswersRef.current = now;
          setParticipantAnswers(now);

          // host: if all answered, finalize immediately (with snapshot)
          if (nav.isHost && currentQuestion?.id) {
            const active = getActivePlayersExcludingHost(participantsRef.current);
            const allAnswered = active.length > 0 && active.every(p => now.has(p.id));
            if (allAnswered) void hostFinalizeToResults(now);
          }

          break;
        }

        case 'cooperative_jeopardy_question_results': {
          const payload = data as ResultsPayload;

          if (payload && Array.isArray(payload.all_answers) && Array.isArray(payload.ratings)) {
            setLastResults(payload);
            setScoreboard(payload.ratings);

            const totals = new Map<string, number>();
            for (const r of payload.ratings) totals.set(r.participant_id, r.total_score);
            totalsRef.current = totals;
          }

          setQuestionOpen(false);
          setStage('RESULTS');
          break;
        }

        case 'cooperative_jeopardy_chooser_selected': {
          setChooser({
            chooser_id: data.chooser_id,
            chooser_name: data.chooser_name,
            is_initial: !!data.is_initial,
          });

          const rc = data.revealed_cell;
          if (rc?.category && rc?.points) {
            setRevealedCells(prev => {
              const next = new Set(prev);
              next.add(makeCellId(String(rc.category), Number(rc.points)));
              return next;
            });
          }

          setParticipantAnswers(new Map());
          participantAnswersRef.current = new Map();
          setSelectedAnswerId(null);
          setShortAnswerDraft('');
          setMySubmitted(false);
          setCurrentQuestion(null);
          setQuestionOpen(false);
          setLastResults(null);
          setStage('BOARD');
          break;
        }

        case 'cooperative_jeopardy_quiz_end': {
          const payload = data as Partial<FinalPayload> | undefined;
          const finals =
            payload?.final_ratings && Array.isArray(payload.final_ratings)
              ? payload.final_ratings
              : computeFinalRatings();

          setFinalRatings(finals);
          setStage('FINAL');
          break;
        }

        default:
          break;
      }
    };

    return () => {
      api.disconnectFromRoomWebSocket(nav.roomId as string);
      wsRef.current = null;
    };
  }, [nav.roomId, nav.isHost, currentQuestion, hostFinalizeToResults, computeFinalRatings]);

  // Guard
  if (!nav.roomId || !quiz) return <Navigate to="/" replace />;

  const hasQuestions = !loadingQuiz && questions.length > 0 && categoryNames.length > 0;

  const progressTotal = Math.max(playableTotal, 1);
  const progressDone = playableDone;

  const showHostPickFirstBadge = nav.isHost && !hasFirstQuestionStarted;

  return (
    <div className="coop-jeopardy">
      <div className="cj-header">
        <div className="cj-titleBlock">
          <h1 className="cj-title">{quiz.title}</h1>
          <div className="cj-subtitle">
            Room <b>{nav.roomId}</b> · Role <b>{nav.isHost ? 'Host' : 'Player'}</b>
            {' · '}
            Chooser <b>{chooser?.chooser_name ?? '—'}</b>
            {chooser && (iAmChooser ? <span className="cj-badge">You choose</span> : null)}
            {showHostPickFirstBadge ? <span className="cj-badge">Pick first question</span> : null}
          </div>
        </div>

        <div className="cj-actions">
          {nav.isHost && !hasFirstQuestionStarted && (
            <button className="cj-btn cj-btnPrimary" onClick={() => void hostStartGame()} disabled={loadingQuiz}>
              {loadingQuiz ? 'Loading…' : 'Start game'}
            </button>
          )}
          <button className="cj-btn cj-btnGhost" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>

      <div className="cj-main">
        <div className="cj-left">
          {/* BOARD */}
          {stage === 'BOARD' && (
            <div className="cj-boardCard">
              <div className="cj-progress">
                <div className="cj-progressBar">
                  <div
                    className="cj-progressFill"
                    style={{ width: `${(progressDone / progressTotal) * 100}%` }}
                  />
                </div>
                <div className="cj-progressText">
                  {progressDone} of {playableTotal} answered
                </div>
              </div>

              {loadingQuiz && <div className="cj-muted">Loading questions…</div>}

              {!loadingQuiz && !hasQuestions && (
                <div className="cj-empty">
                  No questions loaded for this quiz (or missing categories/points).
                </div>
              )}

              {hasQuestions && (
                <div className="cj-board">
                  <div className="cj-boardHeader" style={{ gridTemplateColumns: gridCols }}>
                    {categoryNames.map(cat => (
                      <div key={cat} className="cj-cat">
                        {cat}
                      </div>
                    ))}
                  </div>

                  <div className="cj-boardGrid">
                    {pointValues.map(points => (
                      <div key={points} className="cj-row" style={{ gridTemplateColumns: gridCols }}>
                        {categoryNames.map(cat => {
                          const id = makeCellId(cat, points);
                          const revealed = revealedCells.has(id);
                          const hasQuestionCell = !!getQuestionByCategoryAndPoints(questions, cat, points);
                          const clickable = canPickCell && !revealed && hasQuestionCell;

                          return (
                            <button
                              key={id}
                              className={[
                                'cj-cell',
                                revealed ? 'isRevealed' : 'isHidden',
                                clickable ? 'isClickable' : '',
                                !hasQuestionCell ? 'isMissing' : '',
                              ].join(' ')}
                              disabled={!clickable}
                              onClick={() => void handleCellClick(cat, points)}
                              title={
                                !hasQuestionCell
                                  ? 'No question for this cell'
                                  : revealed
                                    ? 'Already answered'
                                    : !chooser
                                      ? nav.isHost
                                        ? 'Host selects the first question'
                                        : 'Waiting for host to pick the first question'
                                      : !canPickCell
                                        ? 'Only chooser can select'
                                        : 'Select this question'
                              }
                            >
                              {revealed ? <span className="cj-check">✓</span> : <span className="cj-points">${points}</span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="cj-hint">
                    {!chooser
                      ? nav.isHost
                        ? 'Pick the first question.'
                        : 'Waiting for host to pick the first question.'
                      : canPickCell
                        ? 'Select a cell to start the next question.'
                        : 'Wait for the chooser to select a cell.'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QUESTION */}
          {stage === 'QUESTION' && currentQuestion && (
            <div className="cj-questionCard">
              <div className="cj-questionTop">
                <div className="cj-questionMeta">
                  <span className="cj-metaPill">{(currentQuestion as any).category || 'Uncategorized'}</span>
                  <span className="cj-metaPill">${Number((currentQuestion as any).points ?? 0)}</span>
                  <span className="cj-metaPill">
                    {answeredCount}/{totalParticipants} answered
                  </span>
                </div>

                {questionOpen ? (
                  <div className={['cj-timer', timeLeftSec <= 10 ? 'isWarn' : ''].join(' ')}>
                    {timeLeftSec}s
                  </div>
                ) : (
                  <div className="cj-timer isClosed">Closed</div>
                )}
              </div>

              <div className="cj-questionText">{currentQuestion.question}</div>

              {/* Media (image/audio) */}
              {(currentQuestion.image_url || currentQuestion.audio_url) && (
                <div className="cj-questionMedia">
                  {currentQuestion.image_url && (
                    <img
                      className="cj-questionImage"
                      src={resolveMediaUrl(currentQuestion.image_url)}
                      alt="Question"
                    />
                  )}
                  {currentQuestion.audio_url && (
                    <audio
                      className="cj-questionAudio"
                      controls
                      src={resolveMediaUrl(currentQuestion.audio_url)}
                    />
                  )}
                </div>
              )}

              {/* Host view: only relevant UI (no broadcast) */}
              {nav.isHost && (
                <>
                  {!isShortAnswer ? (
                    <div className="cj-answers cj-answersHost">
                      {(currentQuestion.answers || []).map((a: any) => (
                        <button key={a.id} className="cj-answer" disabled>
                          {a.answer}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="cj-shortAnswerSection">
                      <input
                        className="cj-shortAnswerInput"
                        value=""
                        disabled
                        placeholder="Short answer (host view only)"
                      />
                    </div>
                  )}

                  <div className="cj-questionFooter">
                    <div className="cj-answerStatus">
                      Host is not a player. Responded: <b>{answeredCount}</b> / <b>{activeParticipants.length}</b>
                    </div>

                    {questionOpen && (
                      <button className="cj-btn cj-btnDanger" onClick={() => void hostFinalizeToResults()}>
                        End question
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Player view */}
              {!nav.isHost && (
                <>
                  {!isShortAnswer ? (
                    <div className="cj-answers">
                      {(currentQuestion.answers || []).map((a: any) => {
                        const picked = selectedAnswerId === a.id;
                        return (
                          <button
                            key={a.id}
                            className={['cj-answer', picked ? 'isPicked' : ''].join(' ')}
                            disabled={!questionOpen || mySubmitted || !currentParticipantId}
                            onClick={() => setSelectedAnswerId(a.id)}
                          >
                            {a.answer}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="cj-shortAnswerSection">
                      <input
                        className="cj-shortAnswerInput"
                        value={shortAnswerDraft}
                        onChange={e => setShortAnswerDraft(e.target.value)}
                        disabled={!questionOpen || mySubmitted || !currentParticipantId}
                        placeholder="Type your answer…"
                      />
                    </div>
                  )}

                  <div className="cj-questionFooter">
                    <div className="cj-answerStatus">
                      {mySubmitted ? (
                        <span>
                          You have <b>responded</b>.
                        </span>
                      ) : (
                        <span>Submit, or skip.</span>
                      )}
                    </div>

                    <div className="cj-answerButtons">
                      <button
                        className="cj-btn cj-btnGhost"
                        disabled={!questionOpen || mySubmitted || !currentParticipantId}
                        onClick={() => void skipAnswer()}
                      >
                        Skip
                      </button>

                      <button
                        className="cj-btn cj-btnPrimary"
                        disabled={
                          !questionOpen ||
                          mySubmitted ||
                          !currentParticipantId ||
                          (isShortAnswer ? shortAnswerDraft.trim() === '' : !selectedAnswerId)
                        }
                        onClick={() => void submitSelected()}
                      >
                        {mySubmitted ? 'Submitted' : 'Submit answer'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Participants Status (bottom) */}
              <div className="participant-status">
                <h3>Participants Status</h3>
                <div className="status-list">
                  {activeParticipants.length === 0 ? (
                    <p className="no-players">No active players yet.</p>
                  ) : (
                    activeParticipants.map(participant => {
                      const entry = participantAnswers.get(participant.id);
                      const hasAnswered = !waitingForAnswers.has(participant.id);
                      const isSkipped = entry?.answer_id === 'NO_ANSWER';

                      return (
                        <div
                          key={participant.id}
                          className={[
                            'status-item',
                            hasAnswered ? (isSkipped ? 'skipped' : 'answered') : 'waiting',
                          ].join(' ')}
                        >
                          <div className="participant-info">
                            <span className="participant-name">{participant.guest_name}</span>
                            {participant.id === currentParticipantId && (
                              <span className="you-badge">You</span>
                            )}
                          </div>

                          <div className="answer-status">
                            <span className="status-icon">
                              {hasAnswered ? (isSkipped ? '—' : '✓') : '…'}
                            </span>
                            <span className="status-text">
                              {hasAnswered ? (isSkipped ? 'Skipped' : 'Answered') : 'Waiting'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {stage === 'RESULTS' && lastResults && (
            <div className="cj-resultsCard">
              <div className="cj-cardTitle">Results</div>

              <div className="cj-resultsQuestion">
                <div className="cj-resultsQText">{currentQuestion?.question ?? 'Question'}</div>
                <div className="cj-resultsQMeta">
                  <span className="cj-metaPill">{(currentQuestion as any)?.category || 'Uncategorized'}</span>
                  <span className="cj-metaPill">${Number((currentQuestion as any)?.points ?? 0)}</span>
                </div>
              </div>

              <div className="cj-resultsTable">
                {lastResults.all_answers
                  .slice()
                  .sort((a, b) => {
                    const rank = (x: AnswerRecord) => (x.answer_id === 'NO_ANSWER' ? 1 : x.is_correct ? 0 : 2);
                    return rank(a) - rank(b);
                  })
                  .map(a => {
                    const skipped = a.answer_id === 'NO_ANSWER';
                    const cls = skipped ? 'isSkipped' : a.is_correct ? 'isCorrect' : 'isWrong';

                    const pts = Number((currentQuestion as any)?.points ?? 0);
                    const delta = skipped ? 0 : a.is_correct ? +pts : -pts;

                    const isMe = !!currentParticipantId && a.participant_id === currentParticipantId;

                    const avatar = getParticipantAvatar(participantsRef.current, a);

                    return (
                      <div key={a.participant_id} className={['cj-resultLine', cls].join(' ')}>
                        <div className="cj-resultLeft">
                          <div className="cj-resultName">
                            <div className="user-avatar">
                              {avatar ? (
                                avatar.startsWith('http') ? (
                                  <img src={avatar} alt={a.participant_name} />
                                ) : (
                                  <div className="avatar-placeholder">{avatar}</div>
                                )
                              ) : (
                                <div className="avatar-placeholder">
                                  {a.participant_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>

                            {a.participant_name}
                            {isMe ? <span className="cj-pill cj-pillAccent">You</span> : null}
                          </div>

                          <div className="cj-resultAnswer">
                            {skipped ? '—' : findAnswerText(currentQuestion, a.answer_id)}
                          </div>
                        </div>

                        <div className="cj-resultRight">
                          <div className="cj-resultTag">
                            {skipped ? 'Skipped' : a.is_correct ? 'Correct' : 'Wrong'}
                          </div>
                          <div className="cj-resultDelta">
                            {delta >= 0 ? `+${delta}` : `${delta}`} pts
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="cj-resultsFooter">
                {nav.isHost ? (
                  <button className="cj-btn cj-btnPrimary" onClick={() => void hostContinueAfterResults()}>
                    Continue
                  </button>
                ) : (
                  <div className="cj-muted">Waiting for host to continue…</div>
                )}
              </div>
            </div>
          )}

          {/* FINAL RATINGS */}
          {stage === 'FINAL' && (
            <div className="cj-resultsCard">
              <div className="cj-cardTitle">Final ratings</div>

              <div className="cj-muted">
                Completed: {playableDone} / {playableTotal} questions
              </div>

              <div className="cj-results" style={{ marginTop: 12 }}>
                {(finalRatings ?? computeFinalRatings()).map((r, idx) => {
                  const p = participants.find(x => x.id === r.participant_id);
                  const avatar = (p as any)?.guest_avatar as string | undefined;

                  return (
                    <div key={r.participant_id} className="cj-resultRow">
                      <div className="cj-resultName">
                        <span className="cj-rank">#{idx + 1}</span>

                        <div className="user-avatar">
                          {avatar ? (
                            avatar.startsWith('http') ? (
                              <img src={avatar} alt={r.participant_name} />
                            ) : (
                              <div className="avatar-placeholder">{avatar}</div>
                            )
                          ) : (
                            <div className="avatar-placeholder">
                              {r.participant_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {r.participant_name}
                      </div>

                      <div className="cj-resultScore">
                        <b>{r.total_score}</b>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cj-resultsFooter">
                <button className="cj-btn cj-btnPrimary" onClick={() => navigate(-1)}>
                  Back
                </button>
                <button className="cj-btn cj-btnGhost" onClick={() => navigate('/', { replace: true })}>
                  Home
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div className="cj-right">
          <div className="cj-card">
            <div className="cj-cardTitle">Players (no host)</div>
            <div className="cj-players">
              {activePlayers.map(p => {
                const total = totalsRef.current.get(p.id) ?? 0;
                const isCh = chooser?.chooser_id === p.id;
                const avatar = (p as any)?.guest_avatar;

                return (
                  <div key={p.id} className="cj-playerRow">
                    <div className="cj-playerName">
                      {avatar ? <span className="cj-pill">{avatar}</span> : null}
                      {p.guest_name}
                      {isCh ? <span className="cj-pill cj-pillAccent">chooser</span> : null}
                    </div>
                    <div className="cj-playerScore">{total}</div>
                  </div>
                );
              })}
              {activePlayers.length === 0 && <div className="cj-muted">No active players.</div>}
            </div>
          </div>

          <div className="cj-card">
            <div className="cj-cardTitle">Last ratings</div>
            {scoreboard.length === 0 ? (
              <div className="cj-muted">No results yet.</div>
            ) : (
              <div className="cj-results">
                {scoreboard
                  .slice()
                  .sort((a, b) => b.total_score - a.total_score)
                  .map(r => (
                    <div key={r.participant_id} className="cj-resultRow">
                      <div className="cj-resultName">{r.participant_name}</div>
                      <div className="cj-resultScore">
                        <b>{r.total_score}</b>
                        <span className="cj-delta">
                          ({r.rating_change >= 0 ? '+' : ''}
                          {r.rating_change})
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};