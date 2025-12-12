// import React, { useEffect, useMemo, useRef, useState } from 'react';
// import { motion } from 'framer-motion';
// import { api, Question, RoomParticipant, resolveMediaUrl } from '../api'; // adjust path as needed
import './CooperativeJeopardyPlayer.css';

// type JeopardyCategoryMap = Record<string, Question[]>;

// type CooperativeAnswer = {
//   participant_id: string;
//   participant_name: string;
//   question_id: string;
//   answer_id: string; // for short_answer we store typed text here, for skip => "NO_ANSWER"
//   is_correct: boolean;
//   time_taken: number; // ms
// };

// type RatingRow = {
//   participant_id: string;
//   participant_name: string;
//   total_score: number;
//   rating_change: number;
// };

// type QuestionResultsPayload = {
//   question_id: string;
//   all_answers: CooperativeAnswer[];
//   ratings: RatingRow[];
// };

// type FinalResultsPayload = {
//   participants: Array<{
//     participant_id: string;
//     participant_name: string;
//     total_score: number;
//     correct_answers: number;
//     total_questions: number;
//   }>;
// };

// export type { Props };

// type Props = {
//   roomId: string;
//   quiz: {
//     id?: string;
//     title: string;
//     type: 'classic' | 'jeopardy';
//     settings?: { timeLimit?: number };
//     questions: Question[];
//   };
//   currentParticipantId: string;
//   allParticipants: RoomParticipant[];
//   isHost: boolean;
//   onBackToLobby?: () => void;
// };

// const QUESTION_DEFAULT_TIME = 20;

// const normalize = (s: string) => (s ?? '').trim().toLowerCase();

// const getCorrectAnswerText = (q: Question): string | null => {
//   if (q.type === 'short_answer') {
//     const canonical =
//       q.correct_answer?.trim() ||
//       q.answers?.find(a => a.is_correct)?.answer?.trim();
//     return canonical || null;
//   }
//   const correct = q.answers?.find(a => a.is_correct);
//   return correct?.answer ?? null;
// };

// const getUserAnswerText = (q: Question, a: CooperativeAnswer): string => {
//   if (a.answer_id === 'NO_ANSWER') return '—';

//   if (q.type === 'short_answer') {
//     // in this app protocol we store typed value in answer_id
//     return a.answer_id;
//   }

//   const chosen = q.answers?.find(opt => opt.id === a.answer_id);
//   return chosen?.answer ?? '(unknown option)';
// };

// const isAnswerCorrect = (q: Question, answerIdOrText: string): boolean => {
//   if (!answerIdOrText || answerIdOrText === 'NO_ANSWER') return false;

//   if (q.type === 'short_answer') {
//     const correct = getCorrectAnswerText(q);
//     if (!correct) return false;
//     return normalize(answerIdOrText) === normalize(correct);
//   }

//   const chosen = q.answers?.find(a => a.id === answerIdOrText);
//   return !!chosen?.is_correct;
// };

// const getActivePlayers = (participants: RoomParticipant[]) =>
//   participants.filter(p => p.is_active && !p.is_spectator && !p.is_host);

// const groupQuestionsByCategory = (questions: Question[]): JeopardyCategoryMap => {
//   const map: JeopardyCategoryMap = {};
//   for (const q of questions) {
//     const cat = (q.category || 'Uncategorized').trim();
//     if (!map[cat]) map[cat] = [];
//     map[cat].push(q);
//   }
//   // stable sort by order_index inside each category
//   Object.keys(map).forEach(cat => {
//     map[cat] = [...map[cat]].sort((a, b) => a.order_index - b.order_index);
//   });
//   return map;
// };

// export const CooperativeJeopardyPlayer: React.FC<Props> = ({
//   roomId,
//   quiz,
//   currentParticipantId,
//   allParticipants,
//   isHost,
//   onBackToLobby,
// }) => {
//   const wsRef = useRef<WebSocket | null>(null);

//   // keep latest state for ws callbacks (avoid stale closure bugs)
//   const participantsRef = useRef<RoomParticipant[]>([]);
//   const categoryMapRef = useRef<JeopardyCategoryMap>({});
//   const usedQuestionIdsRef = useRef<Set<string>>(new Set());
//   const totalScoreRef = useRef<Map<string, number>>(new Map());
//   const correctCountRef = useRef<Map<string, number>>(new Map());

//   useEffect(() => {
//     participantsRef.current = allParticipants;
//   }, [allParticipants]);

//   // game state
//   const [gameStarted, setGameStarted] = useState(false);
//   const [chooserId, setChooserId] = useState<string | null>(null);
//   const [chooserName, setChooserName] = useState<string>('');
//   const [showChooserBanner, setShowChooserBanner] = useState(true);

//   const [categoryMap, setCategoryMap] = useState<JeopardyCategoryMap>({});
//   const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set());
//   const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

//   const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
//   const [questionStarted, setQuestionStarted] = useState(false);

//   // answering
//   const [selectedAnswerId, setSelectedAnswerId] = useState<string>(''); // for mc/tf
//   const [shortAnswerText, setShortAnswerText] = useState<string>(''); // for short_answer
//   const [participantAnswers, setParticipantAnswers] = useState<Map<string, CooperativeAnswer>>(new Map());
//   const [waitingForAnswers, setWaitingForAnswers] = useState<Set<string>>(new Set());

//   // timer
//   const [timeRemaining, setTimeRemaining] = useState<number>(0);
//   const [timerActive, setTimerActive] = useState<boolean>(false);
//   const questionStartMsRef = useRef<number>(0);

//   // results
//   const [showQuestionResults, setShowQuestionResults] = useState(false);
//   const [questionResults, setQuestionResults] = useState<QuestionResultsPayload | null>(null);

//   // final
//   const [showFinal, setShowFinal] = useState(false);
//   const [finalPayload, setFinalPayload] = useState<FinalResultsPayload | null>(null);

//   const timeLimit = useMemo(() => {
//     return (quiz.settings?.timeLimit as number | undefined) ?? QUESTION_DEFAULT_TIME;
//   }, [quiz.settings?.timeLimit]);

//   // build initial category map from quiz questions (client-side)
//   useEffect(() => {
//     const map = groupQuestionsByCategory(quiz.questions || []);
//     setCategoryMap(map);
//     categoryMapRef.current = map;
//   }, [quiz.questions]);

//   useEffect(() => {
//     categoryMapRef.current = categoryMap;
//   }, [categoryMap]);

//   useEffect(() => {
//     usedQuestionIdsRef.current = usedQuestionIds;
//   }, [usedQuestionIds]);

//   // connect ws
//   useEffect(() => {
//     const ws = api.connectToRoomWebSocket(roomId);
//     wsRef.current = ws;

//     const onMessage = (event: MessageEvent) => {
//       let payload: any;
//       try {
//         payload = JSON.parse(event.data);
//       } catch {
//         return;
//       }
//       const type = payload?.type;
//       const data = payload?.data ?? {};

//       switch (type) {
//         case 'room_state': {
//           // ignore here; parent usually manages allParticipants
//           break;
//         }

//         case 'cooperative_jeopardy_start': {
//           // everyone receives quiz_data + categories map (optional)
//           setGameStarted(true);
//           setShowFinal(false);
//           setFinalPayload(null);

//           const incomingCategories = data.categories as JeopardyCategoryMap | undefined;
//           if (incomingCategories && typeof incomingCategories === 'object') {
//             // trust server categories map if provided
//             setCategoryMap(incomingCategories);
//             categoryMapRef.current = incomingCategories;
//           } else {
//             // fallback to local quiz.questions
//             const map = groupQuestionsByCategory(quiz.questions || []);
//             setCategoryMap(map);
//             categoryMapRef.current = map;
//           }

//           // reset
//           setUsedQuestionIds(new Set());
//           usedQuestionIdsRef.current = new Set();
//           setSelectedCategory(null);
//           setCurrentQuestion(null);
//           setQuestionStarted(false);
//           setParticipantAnswers(new Map());
//           setWaitingForAnswers(new Set());
//           setShowQuestionResults(false);
//           setQuestionResults(null);

//           // reset scores
//           totalScoreRef.current = new Map();
//           correctCountRef.current = new Map();

//           break;
//         }

//         case 'cooperative_jeopardy_chooser_selected': {
//           setChooserId(data.chooser_id ?? null);
//           setChooserName(data.chooser_name ?? '');
//           setShowChooserBanner(true);
//           // after chooser selected, show the board
//           setSelectedCategory(null);
//           setCurrentQuestion(null);
//           setQuestionStarted(false);
//           setShowQuestionResults(false);
//           setQuestionResults(null);
//           break;
//         }

//         case 'cooperative_jeopardy_category_selected': {
//           const q = data.question as Question | undefined;
//           const cat = data.category_name as string | undefined;

//           if (!q || !cat) return;

//           setSelectedCategory(cat);
//           setCurrentQuestion(q);

//           // mark used now (board updates for everyone)
//           if (q.id) {
//             setUsedQuestionIds(prev => {
//               const next = new Set(prev);
//               next.add(q.id!);
//               return next;
//             });
//           }

//           // question isn’t “started” until we get cooperative_jeopardy_question_started
//           setQuestionStarted(false);
//           setShowQuestionResults(false);
//           setQuestionResults(null);

//           // clear any previous answers
//           setParticipantAnswers(new Map());
//           setWaitingForAnswers(new Set());
//           setSelectedAnswerId('');
//           setShortAnswerText('');
//           setTimerActive(false);
//           setTimeRemaining(0);
//           break;
//         }

//         case 'cooperative_jeopardy_question_started': {
//           const q = data.question as Question | undefined;
//           const tl = Number(data.time_limit);

//           if (q) setCurrentQuestion(q);

//           // initialize answering state for everyone
//           const active = getActivePlayers(participantsRef.current);
//           const waiting = new Set(active.map(p => p.id));

//           setParticipantAnswers(new Map());
//           setWaitingForAnswers(waiting);
//           setSelectedAnswerId('');
//           setShortAnswerText('');

//           setQuestionStarted(true);
//           setShowQuestionResults(false);
//           setQuestionResults(null);

//           const resolvedLimit = Number.isFinite(tl) ? tl : timeLimit;
//           questionStartMsRef.current = Date.now();
//           setTimeRemaining(resolvedLimit);
//           setTimerActive(true);
//           break;
//         }

//         case 'cooperative_jeopardy_answer_submitted': {
//           const participant_id = data.participant_id as string;
//           const participant_name = data.participant_name as string;
//           const question_id = data.question_id as string;
//           const answer_id = data.answer_id as string;
//           const time_taken = Number(data.time_taken) || Number(data.time_taken_ms) || 0;

//           if (!participant_id) return;

//           setParticipantAnswers(prev => {
//             const next = new Map(prev);
//             // is_correct will be recomputed by host for results;
//             // for UI "answered" status we don't need correctness here.
//             next.set(participant_id, {
//               participant_id,
//               participant_name: participant_name || 'Player',
//               question_id,
//               answer_id,
//               is_correct: false,
//               time_taken,
//             });
//             return next;
//           });

//           setWaitingForAnswers(prev => {
//             const next = new Set(prev);
//             next.delete(participant_id);
//             return next;
//           });

//           break;
//         }

//         case 'cooperative_jeopardy_question_results': {
//           setTimerActive(false);
//           setQuestionStarted(false);
//           setShowQuestionResults(true);

//           const results = {
//             question_id: data.question_id,
//             all_answers: data.all_answers ?? [],
//             ratings: data.ratings ?? [],
//           } as QuestionResultsPayload;

//           setQuestionResults(results);

//           // update local score map so final ranking works for all clients
//           const nextScore = new Map(totalScoreRef.current);
//           for (const r of results.ratings) {
//             nextScore.set(r.participant_id, r.total_score);
//           }
//           totalScoreRef.current = nextScore;

//           // also track correct counts
//           const nextCorrect = new Map(correctCountRef.current);
//           for (const ans of results.all_answers) {
//             if (ans.is_correct) {
//               nextCorrect.set(ans.participant_id, (nextCorrect.get(ans.participant_id) ?? 0) + 1);
//             }
//           }
//           correctCountRef.current = nextCorrect;

//           break;
//         }

//         case 'cooperative_jeopardy_next_chooser': {
//           // server forwards this; in our host-authoritative approach,
//           // host broadcasts chooser selection separately with cooperative_jeopardy_chooser_selected
//           // so we can ignore or just keep as “info”.
//           break;
//         }

//         case 'cooperative_jeopardy_quiz_end': {
//           setTimerActive(false);
//           setQuestionStarted(false);
//           setShowQuestionResults(false);
//           setShowFinal(true);

//           const fp = {
//             participants: data.participants ?? [],
//           } as FinalResultsPayload;

//           setFinalPayload(fp);
//           break;
//         }

//         default:
//           break;
//       }
//     };

//     ws.addEventListener('message', onMessage);

//     return () => {
//       ws.removeEventListener('message', onMessage);
//       // don't force-close, api caches WS; parent may reuse
//     };
//   }, [roomId, quiz.questions, timeLimit]);

//   // timer tick
//   useEffect(() => {
//     if (!timerActive) return;

//     const t = setInterval(() => {
//       setTimeRemaining(prev => {
//         if (prev <= 1) {
//           clearInterval(t);
//           setTimerActive(false);

//           // host finalizes on time
//           if (isHost) {
//             void finalizeQuestionBecauseTimeExpired();
//           }
//           return 0;
//         }
//         return prev - 1;
//       });
//     }, 1000);

//     return () => clearInterval(t);
//   }, [timerActive, isHost]);

//   // host: when all answered, finalize
//   useEffect(() => {
//     if (!isHost) return;
//     if (!questionStarted) return;
//     if (!currentQuestion?.id) return;

//     if (waitingForAnswers.size === 0) {
//       void finalizeQuestionBecauseAllAnswered();
//     }
//   }, [waitingForAnswers, isHost, questionStarted, currentQuestion?.id]);

//   const startGame = async () => {
//     if (!isHost || !wsRef.current) return;

//     // categories map for server (it stores it; can also broadcast to others)
//     const categories = groupQuestionsByCategory(quiz.questions || []);

//     await api.sendCooperativeJeopardyStart(wsRef.current, roomId, {
//       quiz_data: quiz,
//       categories,
//     });
//   };

//   const isChooser = chooserId === currentParticipantId;

//   const remainingQuestionsCount = useMemo(() => {
//     const map = categoryMap;
//     let total = 0;
//     Object.values(map).forEach(list => {
//       list.forEach(q => {
//         if (q.id && !usedQuestionIds.has(q.id)) total += 1;
//       });
//     });
//     return total;
//   }, [categoryMap, usedQuestionIds]);

//   const pickFirstUnusedQuestionInCategory = (category: string): Question | null => {
//     const list = categoryMapRef.current[category] || [];
//     for (const q of list) {
//       if (q.id && !usedQuestionIdsRef.current.has(q.id)) return q;
//       // if q.id missing (shouldn't), treat as selectable once:
//       if (!q.id) return q;
//     }
//     return null;
//   };

//   const handleSelectCategory = async (category: string) => {
//     if (!wsRef.current) return;
//     if (!isChooser) return;
//     if (!category) return;

//     const q = pickFirstUnusedQuestionInCategory(category);
//     if (!q) return;

//     // broadcast category selection to everyone
//     await api.sendCooperativeJeopardyCategorySelected(wsRef.current, roomId, {
//       category_name: category,
//       question: q,
//       selected_by: currentParticipantId,
//     });

//     // host starts question (timer)
//     if (isHost) {
//       await api.sendCooperativeJeopardyQuestionStarted(wsRef.current, roomId, {
//         question: q,
//         time_limit: timeLimit,
//       });
//     }
//   };

//   const submitAnswer = async (answer_id: string) => {
//     if (!wsRef.current || !currentQuestion?.id) return;
//     if (!questionStarted) return;

//     // prevent multiple submits by same user
//     if (participantAnswers.has(currentParticipantId)) return;

//     const timeTakenMs = Math.max(0, Date.now() - questionStartMsRef.current);

//     await api.sendCooperativeJeopardyAnswerSubmit(wsRef.current, roomId, {
//       question_id: currentQuestion.id,
//       answer_id,
//       participant_id: currentParticipantId,
//       time_taken_ms: timeTakenMs,
//     });
//   };

//   const handleSkip = async () => {
//     await submitAnswer('NO_ANSWER');
//   };

//   const finalizeQuestionBecauseAllAnswered = async () => {
//     await finalizeQuestion('all_answered');
//   };

//   const finalizeQuestionBecauseTimeExpired = async () => {
//     await finalizeQuestion('time_expired');
//   };

//   const finalizeQuestion = async (_reason: 'all_answered' | 'time_expired') => {
//     if (!isHost || !wsRef.current || !currentQuestion?.id) return;

//     // compute results for all active players: answered, skipped, or missing -> NO_ANSWER
//     const active = getActivePlayers(participantsRef.current);

//     const answers: CooperativeAnswer[] = active.map(p => {
//       const existing = participantAnswers.get(p.id);
//       const answer_id = existing?.answer_id ?? 'NO_ANSWER';
//       const time_taken = existing?.time_taken ?? 0;

//       return {
//         participant_id: p.id,
//         participant_name: p.guest_name,
//         question_id: currentQuestion.id!,
//         answer_id,
//         is_correct: isAnswerCorrect(currentQuestion, answer_id),
//         time_taken,
//       };
//     });

//     // scoring:
//     // correct => +points, wrong => -points, NO_ANSWER => 0
//     const deltaPoints = currentQuestion.points ?? 0;

//     const nextTotal = new Map(totalScoreRef.current);
//     for (const a of answers) {
//       const prev = nextTotal.get(a.participant_id) ?? 0;
//       let change = 0;
//       if (a.answer_id === 'NO_ANSWER') change = 0;
//       else change = a.is_correct ? deltaPoints : -deltaPoints;
//       nextTotal.set(a.participant_id, prev + change);
//     }

//     totalScoreRef.current = nextTotal;

//     const ratings: RatingRow[] = active.map(p => {
//       const prevTotal = (totalScoreRef.current.get(p.id) ?? 0);
//       // We need rating_change for this question; recompute from answers for each p
//       const a = answers.find(x => x.participant_id === p.id)!;
//       const change =
//         a.answer_id === 'NO_ANSWER' ? 0 : a.is_correct ? deltaPoints : -deltaPoints;

//       return {
//         participant_id: p.id,
//         participant_name: p.guest_name,
//         total_score: prevTotal, // already includes change
//         rating_change: change,
//       };
//     });

//     // broadcast results
//     await api.sendCooperativeJeopardyQuestionResults(wsRef.current, roomId, {
//       question_id: currentQuestion.id!,
//       all_answers: answers,
//       ratings,
//     });

//     // determine winners (correct)
//     const winners = answers
//       .filter(a => a.is_correct)
//       .map(a => ({ participant_id: a.participant_id, participant_name: a.participant_name }));

//     // broadcast “next chooser” info (optional)
//     await api.sendCooperativeJeopardyNextChooser(wsRef.current, roomId, { winners });

//     // pick next chooser randomly from winners, else from all active
//     const pool = winners.length > 0 ? winners : active.map(p => ({
//       participant_id: p.id,
//       participant_name: p.guest_name,
//     }));
//     const next = pool[Math.floor(Math.random() * pool.length)];

//     // broadcast chooser selection to all (this is what clients actually use)
//     await api.sendCooperativeJeopardyChooserSelected(wsRef.current, roomId, {
//       chooser_id: next.participant_id,
//       chooser_name: next.participant_name,
//       is_initial: false,
//     });

//     // If the board is empty now => end game
//     const stillRemaining = countRemainingQuestions();
//     if (stillRemaining === 0) {
//       await endGame();
//     }
//   };

//   const countRemainingQuestions = () => {
//     const map = categoryMapRef.current;
//     const used = usedQuestionIdsRef.current;
//     let total = 0;
//     for (const list of Object.values(map)) {
//       for (const q of list) {
//         if (q.id && !used.has(q.id)) total += 1;
//         if (!q.id) total += 1;
//       }
//     }
//     return total;
//   };

//   const endGame = async () => {
//     if (!isHost || !wsRef.current) return;

//     const active = getActivePlayers(participantsRef.current);

//     // total_questions = number of used questions (with id)
//     const totalQ = usedQuestionIdsRef.current.size;

//     const participants = active.map(p => {
//       const total_score = totalScoreRef.current.get(p.id) ?? 0;
//       const correct_answers = correctCountRef.current.get(p.id) ?? 0;

//       return {
//         participant_id: p.id,
//         participant_name: p.guest_name,
//         total_score,
//         correct_answers,
//         total_questions: totalQ,
//       };
//     });

//     await api.sendCooperativeJeopardyQuizEnd(wsRef.current, roomId, { participants });
//   };

//   const handleBackToLobby = () => {
//     if (onBackToLobby) onBackToLobby();
//   };

//   // ---------- UI RENDERING ----------

//   // Final screen
//   if (showFinal) {
//     // Prefer payload from server; but ensure names/avatars show via allParticipants
//     const rankingRows = getActivePlayers(allParticipants)
//       .map(p => {
//         const score =
//           finalPayload?.participants?.find(x => x.participant_id === p.id)?.total_score ??
//           totalScoreRef.current.get(p.id) ??
//           0;

//         return {
//           participant_id: p.id,
//           participant_name: p.guest_name,
//           total_score: score,
//           guest_avatar: p.guest_avatar,
//         };
//       })
//       .sort((a, b) => b.total_score - a.total_score);

//     return (
//       <div className="cooperative-jeopardy">
//         <motion.div className="final-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
//           <h1 className="title">Game Complete</h1>

//           <div className="final-rankings">
//             <h2>Final Rankings</h2>

//             {rankingRows.map((row, idx) => {
//               const avatarUrl = row.guest_avatar ? resolveMediaUrl(row.guest_avatar) : undefined;
//               return (
//                 <div key={row.participant_id} className="ranking-item">
//                   <div className="rank">#{idx + 1}</div>

//                   <div className="ranking-user">
//                     {avatarUrl ? (
//                       <img className="ranking-avatar" src={avatarUrl} alt={row.participant_name} />
//                     ) : (
//                       <div className="ranking-avatar placeholder">
//                         {row.participant_name.charAt(0).toUpperCase()}
//                       </div>
//                     )}
//                     <div className="ranking-name">{row.participant_name}</div>
//                   </div>

//                   <div className="ranking-score">{row.total_score} $</div>
//                 </div>
//               );
//             })}
//           </div>

//           <button className="back-btn" onClick={handleBackToLobby}>
//             Back to Lobby
//           </button>
//         </motion.div>
//       </div>
//     );
//   }

//   // Question results screen
//   if (showQuestionResults && questionResults && currentQuestion) {
//     const active = getActivePlayers(allParticipants);

//     // Ensure everyone appears (even if they never submitted)
//     const answersById = new Map(questionResults.all_answers.map(a => [a.participant_id, a]));
//     const normalizedAnswers: CooperativeAnswer[] = active.map(p => {
//       const existing = answersById.get(p.id);
//       return (
//         existing ?? {
//           participant_id: p.id,
//           participant_name: p.guest_name,
//           question_id: currentQuestion.id || '',
//           answer_id: 'NO_ANSWER',
//           is_correct: false,
//           time_taken: 0,
//         }
//       );
//     });

//     const correctAnswerText = getCorrectAnswerText(currentQuestion);

//     return (
//       <div className="cooperative-jeopardy">
//         <motion.div className="results-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
//           <h2 className="title">Results</h2>

//           {correctAnswerText && (
//             <div className="correct-answer-banner">
//               <span className="label">Correct:</span>
//               <span className="value">{correctAnswerText}</span>
//             </div>
//           )}

//           <div className="results-list">
//             {normalizedAnswers.map(a => {
//               const p = allParticipants.find(x => x.id === a.participant_id);
//               const name = p?.guest_name || a.participant_name;
//               const avatarUrl = p?.guest_avatar ? resolveMediaUrl(p.guest_avatar) : undefined;

//               const rating = questionResults.ratings.find(r => r.participant_id === a.participant_id);
//               const change = rating?.rating_change ?? 0;

//               const isNoAnswer = a.answer_id === 'NO_ANSWER';
//               const userAnswerText = getUserAnswerText(currentQuestion, a);

//               return (
//                 <div
//                   key={a.participant_id}
//                   className={`result-item ${a.is_correct ? 'correct' : isNoAnswer ? 'no-answer' : 'incorrect'}`}
//                 >
//                   <div className="result-user">
//                     {avatarUrl ? (
//                       <img className="avatar" src={avatarUrl} alt={name} />
//                     ) : (
//                       <div className="avatar placeholder">{name.charAt(0).toUpperCase()}</div>
//                     )}
//                     <div className="meta">
//                       <div className="row">
//                         <div className="name">
//                           {name}
//                           {a.participant_id === currentParticipantId && <span className="you-badge">You</span>}
//                         </div>
//                         <div className={`delta ${change > 0 ? 'plus' : change < 0 ? 'minus' : ''}`}>
//                           {change > 0 ? '+' : ''}
//                           {change} $
//                         </div>
//                       </div>

//                       <div className="row secondary">
//                         <div className="status">
//                           {isNoAnswer ? 'Skipped' : a.is_correct ? 'Correct' : 'Wrong'}
//                         </div>
//                         <div className="answer">
//                           <span className="label">Answered:</span> <span className="value">{userAnswerText}</span>
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="hint">
//             Next chooser will be selected automatically from the winners.
//           </div>
//         </motion.div>
//       </div>
//     );
//   }

//   // Question screen
//   if (currentQuestion && questionStarted) {
//     const q = currentQuestion;
//     const imgUrl = q.image_url ? resolveMediaUrl(q.image_url) : undefined;
//     const audioUrl = q.audio_url ? resolveMediaUrl(q.audio_url) : undefined;

//     const alreadyAnswered = participantAnswers.has(currentParticipantId);

//     return (
//       <div className="cooperative-jeopardy">
//         <motion.div className="question-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
//           <div className="topbar">
//             <div className="chooser">
//               Chooser: <b>{chooserName || '—'}</b>
//             </div>
//             <div className="timer">{timeRemaining}s</div>
//           </div>

//           <div className="question-header">
//             <div className="category">{selectedCategory}</div>
//             <div className="points">{q.points ?? 0} $</div>
//           </div>

//           <div className="question-text">{q.question}</div>

//           {imgUrl && <img className="media-image" src={imgUrl} alt="question" />}
//           {audioUrl && <audio className="media-audio" controls src={audioUrl} />}

//           <div className="answer-area">
//             {(q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'picture_choice') && (
//               <div className="choices">
//                 {(q.answers ?? []).map(opt => (
//                   <button
//                     key={opt.id}
//                     className={`choice ${selectedAnswerId === opt.id ? 'selected' : ''}`}
//                     disabled={alreadyAnswered}
//                     onClick={() => setSelectedAnswerId(opt.id || '')}
//                   >
//                     {opt.image_url ? (
//                       <div className="picture-choice">
//                         <img src={resolveMediaUrl(opt.image_url)} alt={opt.answer} />
//                         <div className="caption">{opt.answer}</div>
//                       </div>
//                     ) : (
//                       opt.answer
//                     )}
//                   </button>
//                 ))}
//               </div>
//             )}

//             {q.type === 'short_answer' && (
//               <input
//                 className="short-input"
//                 placeholder={alreadyAnswered ? 'Answer submitted' : 'Type your answer'}
//                 value={shortAnswerText}
//                 disabled={alreadyAnswered}
//                 onChange={e => setShortAnswerText(e.target.value)}
//               />
//             )}

//             <div className="action-row">
//               <button
//                 className="submit-btn"
//                 disabled={alreadyAnswered || (q.type === 'short_answer' ? shortAnswerText.trim() === '' : selectedAnswerId === '')}
//                 onClick={() => {
//                   if (q.type === 'short_answer') void submitAnswer(shortAnswerText.trim());
//                   else void submitAnswer(selectedAnswerId);
//                 }}
//               >
//                 Submit
//               </button>

//               <button className="skip-btn" disabled={alreadyAnswered} onClick={() => void handleSkip()}>
//                 Skip
//               </button>
//             </div>

//             <div className="status-row">
//               <div className="answered">
//                 Answered: {participantAnswers.size} / {getActivePlayers(allParticipants).length}
//               </div>
//             </div>
//           </div>
//         </motion.div>
//       </div>
//     );
//   }

//   // Board screen (category table)
//   if (gameStarted) {
//     const categories = Object.keys(categoryMap);

//     return (
//       <div className="cooperative-jeopardy">
//         <motion.div className="board-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
//           <div className="board-header">
//             <div className="quiz-title">{quiz.title}</div>
//             <div className="remaining">Remaining: {remainingQuestionsCount}</div>
//           </div>

//           {showChooserBanner && (
//             <div className="chooser-banner">
//               <div className="text">
//                 Next chooser: <b>{chooserName || '—'}</b>
//               </div>
//               <div className="sub">
//                 {isChooser ? 'It’s your turn to choose a category.' : 'Waiting for the chooser to pick a category.'}
//               </div>
//               <button className="dismiss" onClick={() => setShowChooserBanner(false)}>
//                 OK
//               </button>
//             </div>
//           )}

//           <div className="board">
//             {categories.length === 0 ? (
//               <div className="empty">No categories</div>
//             ) : (
//               categories.map(cat => {
//                 const unused = (categoryMap[cat] || []).filter(q => !q.id || !usedQuestionIds.has(q.id));
//                 const disabled = !isChooser || unused.length === 0;

//                 return (
//                   <button
//                     key={cat}
//                     className={`category-tile ${disabled ? 'disabled' : ''}`}
//                     disabled={disabled}
//                     onClick={() => void handleSelectCategory(cat)}
//                   >
//                     <div className="cat-name">{cat}</div>
//                     <div className="cat-meta">
//                       {unused.length > 0 ? `${unused.length} left` : 'Done'}
//                     </div>
//                   </button>
//                 );
//               })
//             )}
//           </div>

//           {isHost && (
//             <div className="host-controls">
//               <button className="start-btn" onClick={() => void startGame()}>
//                 Restart Jeopardy (Host)
//               </button>
//               <button className="end-btn" onClick={() => void endGame()}>
//                 End Game (Host)
//               </button>
//             </div>
//           )}
//         </motion.div>
//       </div>
//     );
//   }

//   // Pre-start screen
//   return (
//     <div className="cooperative-jeopardy">
//       <motion.div className="prestart-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
//         <h1 className="title">{quiz.title}</h1>
//         <div className="subtitle">Cooperative Jeopardy mode</div>

//         {isHost ? (
//           <button className="start-btn" onClick={() => void startGame()}>
//             Start Game
//           </button>
//         ) : (
//           <div className="waiting">
//             Waiting for host to start…
//           </div>
//         )}

//         <button className="back-btn" onClick={handleBackToLobby}>
//           Back to Lobby
//         </button>
//       </motion.div>
//     </div>
//   );
// };