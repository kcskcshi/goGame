import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

import { WORDS } from '../data/words';
import type { WordEntry } from '../data/words';
import {
  createPhonemeProfile,
  extractChoseong,
  normalizeForComparison,
  similarityScore,
} from '../lib/hangul';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '../components/ui/chart';
import { cn } from '../lib/utils';

type SimilarityBreakdown = {
  overall: number;
  initial: number;
  medial: number;
  final: number;
};

type Guess = {
  value: string;
  normalized: string;
  breakdown: SimilarityBreakdown;
};

type FeedbackTone = 'info' | 'success' | 'warn';
type GameMode = 'daily' | 'endless';

type PlayerStats = {
  totalGuesses: number;
  correctAnswers: number;
  lastReset: string;
};

const SOLVED_STORAGE_KEY = 'kkomaentle-conquered-terms';
const STATS_STORAGE_KEY = 'kkomaentle-stats';
const MODE_STORAGE_KEY = 'kkomaentle-mode';

const formatFeedback = (overall: number): { tone: FeedbackTone; text: string } => {
  if (overall === 100) {
    return { tone: 'success', text: '정답입니다! 완벽한 추측이에요 🎉' };
  }

  if (overall >= 85) {
    return { tone: 'info', text: '아주 근접했어요. 한 글자만 더 떠올려 보세요.' };
  }

  if (overall >= 60) {
    return { tone: 'info', text: '방향이 좋아요. 초성과 모음을 더 맞춰 볼까요?' };
  }

  if (overall >= 35) {
    return { tone: 'warn', text: '조금 멀지만 단서를 조합해 보세요. 힌트를 더 열어도 좋아요.' };
  }

  return { tone: 'warn', text: '유사도가 낮아요. 다른 연상 단어를 시도해 보세요.' };
};

const toPercent = (value: number) => Math.round(value * 100);

const scorePhonemes = (guess: string, answerProfile: ReturnType<typeof createPhonemeProfile>) => {
  const profile = createPhonemeProfile(guess);

  return {
    overall: toPercent(similarityScore(profile.combined, answerProfile.combined)),
    initial: toPercent(similarityScore(profile.initial, answerProfile.initial)),
    medial: toPercent(similarityScore(profile.medial, answerProfile.medial)),
    final: toPercent(similarityScore(profile.final, answerProfile.final)),
  };
};

const pickNextEntry = (previousTerm: string, solved: string[]): WordEntry => {
  const unsolvedPool = WORDS.filter(
    (item) => item.term !== previousTerm && !solved.includes(item.term),
  );

  if (unsolvedPool.length > 0) {
    return unsolvedPool[Math.floor(Math.random() * unsolvedPool.length)]!;
  }

  const fallbackPool = WORDS.filter((item) => item.term !== previousTerm);
  if (fallbackPool.length === 0) {
    return WORDS[Math.floor(Math.random() * WORDS.length)]!;
  }

  return fallbackPool[Math.floor(Math.random() * fallbackPool.length)]!;
};

const createDefaultStats = (): PlayerStats => ({
  totalGuesses: 0,
  correctAnswers: 0,
  lastReset: new Date().toISOString(),
});

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch (error) {
    console.warn('Failed to parse storage value', error);
    return fallback;
  }
};

const createDailyEntry = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const index = hash % WORDS.length;
  return WORDS[index]!;
};

const GameView = () => {
  const [todayKey] = useState(() => new Date().toISOString().slice(0, 10));
  const dailyEntry = useMemo(() => createDailyEntry(todayKey), [todayKey]);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (typeof window === 'undefined') {
      return 'daily';
    }
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return stored === 'endless' ? 'endless' : 'daily';
  });

  const [currentEntry, setCurrentEntry] = useState<WordEntry>(
    () => (gameMode === 'daily' ? dailyEntry : WORDS[Math.floor(Math.random() * WORDS.length)]!),
  );
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'playing' | 'cleared'>('playing');
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; text: string } | null>(null);
  const [solvedTerms, setSolvedTerms] = useState<string[]>([]);
  const [stats, setStats] = useState<PlayerStats>(() => createDefaultStats());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const solved = safeParse<string[]>(
      window.localStorage.getItem(SOLVED_STORAGE_KEY),
      [],
    ).filter((item): item is string => typeof item === 'string');
    setSolvedTerms(solved);

    const storedStats = safeParse<PlayerStats>(
      window.localStorage.getItem(STATS_STORAGE_KEY),
      createDefaultStats(),
    );
    setStats({
      totalGuesses: storedStats.totalGuesses ?? 0,
      correctAnswers: storedStats.correctAnswers ?? 0,
      lastReset: storedStats.lastReset ?? new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(MODE_STORAGE_KEY, gameMode);
  }, [gameMode]);

  const answerProfile = useMemo(
    () => createPhonemeProfile(currentEntry.term),
    [currentEntry.term],
  );

  const hints = useMemo(
    () => [
      { label: '글자 수', value: `${currentEntry.term.length} 글자`, unlockAt: 0 },
      { label: '카테고리', value: currentEntry.category, unlockAt: 10 },
      { label: '추가 힌트', value: currentEntry.hint, unlockAt: 20 },
    ],
    [currentEntry],
  );

  const bestBreakdown = useMemo(() => {
    if (guesses.length === 0) {
      return { overall: 0, initial: 0, medial: 0, final: 0 };
    }

    return guesses.reduce(
      (acc, guess) => ({
        overall: Math.max(acc.overall, guess.breakdown.overall),
        initial: Math.max(acc.initial, guess.breakdown.initial),
        medial: Math.max(acc.medial, guess.breakdown.medial),
        final: Math.max(acc.final, guess.breakdown.final),
      }),
      { overall: 0, initial: 0, medial: 0, final: 0 },
    );
  }, [guesses]);

  const progressValue = status === 'cleared' ? 100 : bestBreakdown.overall;
  const lastGuess = guesses[0];

  const totalWords = WORDS.length;
  const conquestCount = solvedTerms.length;
  const conquestRate = totalWords === 0 ? 0 : Math.round((conquestCount / totalWords) * 100);
  const remainingCount = Math.max(totalWords - conquestCount, 0);
  const isDailySolved = solvedTerms.includes(dailyEntry.term);

  const successRate =
    stats.totalGuesses === 0
      ? 0
      : Math.round((stats.correctAnswers / stats.totalGuesses) * 100);

  const lastResetLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(
        new Date(stats.lastReset),
      );
    } catch {
      return '알 수 없음';
    }
  }, [stats.lastReset]);

  const radarData = useMemo(
    () => [
      { metric: '초성', score: bestBreakdown.initial },
      { metric: '모음', score: bestBreakdown.medial },
      { metric: '받침', score: bestBreakdown.final },
      { metric: '총점', score: bestBreakdown.overall },
    ],
    [bestBreakdown],
  );

  const radarConfig = useMemo<ChartConfig>(
    () => ({
      score: { label: '정확도', color: 'hsl(262 83% 66%)' },
    }),
    [],
  );

  const recordGuess = (correct: boolean) => {
    setStats((prev) => {
      const next = {
        totalGuesses: prev.totalGuesses + 1,
        correctAnswers: prev.correctAnswers + (correct ? 1 : 0),
        lastReset: prev.lastReset,
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const resetRoundState = () => {
    setGuesses([]);
    setInputValue('');
    setStatus('playing');
    setFeedback(null);
  };

  const startNewRound = (mode: GameMode = gameMode) => {
    resetRoundState();
    if (mode === 'daily') {
      setCurrentEntry(dailyEntry);
      return;
    }
    setCurrentEntry((prev) => pickNextEntry(prev.term, solvedTerms));
  };

  useEffect(() => {
    startNewRound(gameMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, dailyEntry]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const guess = inputValue.trim();
    if (!guess) {
      setFeedback({ tone: 'warn', text: '단어를 입력해 주세요.' });
      return;
    }

    const normalizedGuess = normalizeForComparison(guess);
    if (!normalizedGuess) {
      setFeedback({
        tone: 'warn',
        text: '초성이나 특수문자만으로는 비교가 어려워요. 단어를 입력해 주세요.',
      });
      return;
    }

    if (guesses.some((item) => item.normalized === normalizedGuess)) {
      setFeedback({ tone: 'warn', text: '이미 시도한 단어예요. 다른 단어를 생각해 보세요.' });
      return;
    }

    const breakdown = scorePhonemes(guess, answerProfile);
    const newGuess: Guess = {
      value: guess,
      normalized: normalizedGuess,
      breakdown,
    };

    setGuesses((prev) => [newGuess, ...prev]);
    setInputValue('');

    recordGuess(breakdown.overall === 100);

    const { tone, text } = formatFeedback(breakdown.overall);
    setFeedback({ tone, text });

    if (breakdown.overall === 100) {
      setStatus('cleared');
      setSolvedTerms((prev) => {
        if (prev.includes(currentEntry.term)) {
          return prev;
        }
        const next = [...prev, currentEntry.term];
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(SOLVED_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
    }
  };

  const handleResetProgress = () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('정복률과 통계를 초기화할까요?');
      if (!confirmed) {
        return;
      }
    }

    setSolvedTerms([]);
    setStats(createDefaultStats());

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SOLVED_STORAGE_KEY);
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    }

    startNewRound('daily');
    setGameMode('daily');
  };

  const toneStyles: Record<FeedbackTone, string> = {
    info: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-100',
    success: 'border-success/40 bg-success/10 text-success-foreground',
    warn: 'border-warning/40 bg-warning/10 text-warning-foreground',
  };

  const statistics = [
    {
      label: '초성 맞춤도',
      value: bestBreakdown.initial,
      description: '자음 위치가 얼마나 맞는지',
    },
    {
      label: '모음 맞춤도',
      value: bestBreakdown.medial,
      description: '모음 조합의 일치 정도',
    },
    {
      label: '받침 맞춤도',
      value: bestBreakdown.final,
      description: '받침 유사도 (없으면 100%)',
    },
  ];

  const modeBadges: Record<GameMode, string> = {
    daily: isDailySolved ? '오늘의 문제 완료!' : '오늘의 문제 진행 중',
    endless: '무한 모드 플레이',
  };

  return (
    <>
      <section className="rounded-3xl border border-border/80 bg-card/95 p-6 shadow-glow sm:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-slate-900/60 p-1">
              {(['daily', 'endless'] as GameMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGameMode(mode)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
                    gameMode === mode
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white',
                  )}
                >
                  {mode === 'daily' ? '오늘의 문제' : '무한 모드'}
                </button>
              ))}
            </div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-indigo-200/70">
              {modeBadges[gameMode]}
            </p>
          </div>
          {gameMode === 'daily' && (
            <p className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100 shadow-subtle">
              오늘의 문제는 하루에 한 번만 변경돼요. 새로운 단어를 풀고 싶다면 무한 모드로 전환해
              보세요.
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-200/70">
                오늘의 초성
              </span>
              <div className="rounded-3xl border border-indigo-400/40 bg-gradient-to-br from-indigo-500/20 via-indigo-400/10 to-transparent px-6 py-10 text-center text-5xl font-bold text-indigo-100 sm:text-6xl">
                {extractChoseong(currentEntry.term)}
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="space-y-2 text-sm font-medium text-slate-200">
                정답 후보 입력
                <input
                  type="text"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="예: 은하수"
                  disabled={status === 'cleared' || (gameMode === 'daily' && isDailySolved)}
                  className="w-full rounded-2xl border border-border/60 bg-slate-900/60 px-4 py-3 text-base text-slate-100 shadow-inner transition placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={status === 'cleared' || (gameMode === 'daily' && isDailySolved)}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-6 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                  >
                    제출하기
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      gameMode === 'daily' ? setGameMode('endless') : startNewRound('endless')
                    }
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-border/70 bg-slate-900/60 px-6 text-sm font-semibold text-slate-200 shadow-subtle transition hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 sm:flex-none"
                  >
                    {gameMode === 'daily' ? '무한 모드로 전환' : '새 문제'}
                  </button>
                </div>

                {status === 'cleared' && (
                  <p className="text-sm font-semibold text-success">
                    정답: <span className="ml-1 text-white">{currentEntry.term}</span>
                  </p>
                )}
              </div>
            </form>

            {gameMode === 'daily' && isDailySolved && status !== 'cleared' && (
              <div className="rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm font-medium text-success-foreground shadow-subtle">
                오늘의 문제를 이미 완료했습니다! 내일 다시 도전하거나 무한 모드로 전환해 보세요.
              </div>
            )}

            {feedback && (
              <div
                className={cn(
                  'rounded-2xl border px-5 py-4 text-sm font-medium shadow-subtle transition',
                  toneStyles[feedback.tone],
                )}
              >
                {feedback.text}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-slate-200">힌트 패널</h2>
                <p className="text-xs font-medium text-indigo-200/70">
                  {guesses.length}회 시도
                </p>
              </div>

              <ul className="grid gap-3">
                {hints.map((hint) => {
                  const isUnlocked = guesses.length >= hint.unlockAt;
                  return (
                    <li
                      key={hint.label}
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left text-sm shadow-subtle',
                        isUnlocked
                          ? 'border-border/70 bg-muted/60 text-slate-200'
                          : 'border-slate-700/50 bg-slate-900/40 text-slate-500',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200/70">
                          {hint.label}
                        </p>
                        {!isUnlocked && (
                          <p className="text-xs text-slate-500">
                            {hint.unlockAt}회 시도 시 공개
                          </p>
                        )}
                      </div>
                      <p className={cn('mt-1 text-base', isUnlocked ? 'text-slate-100' : 'text-slate-600')}>
                        {isUnlocked ? hint.value : '🔒 잠김'}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-3xl border border-success/30 bg-success/10 p-6 text-success-foreground shadow-subtle">
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-success-foreground/80">
                정복률
              </span>
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold">
                  {conquestRate}
                  <span className="ml-1 text-base font-medium text-success-foreground/80">%</span>
                </p>
                <p className="text-xs text-success-foreground/80">
                  {conquestCount} / {totalWords} 단어 정복
                </p>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${conquestRate}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-success-foreground/80">
                {remainingCount > 0
                  ? `남은 단어 ${remainingCount}개를 정복하면 완전 정복이에요.`
                  : '모든 단어를 정복했어요! 무한 모드에서 감각을 이어가 보세요.'}
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-500/30 bg-indigo-500/10 p-6 text-slate-100 shadow-glow">
              <span className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-200/80">
                총 유사도
              </span>
              <div className="mt-4 flex items-end justify-between">
                <p className="text-4xl font-bold text-white">
                  {progressValue}
                  <span className="ml-1 text-base font-medium text-indigo-200">%</span>
                </p>
                {lastGuess && (
                  <p className="text-xs text-indigo-100">
                    최근 시도: <span className="font-semibold">{lastGuess.value}</span>
                  </p>
                )}
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 transition-all"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-indigo-100/80">
                자모 분해 기준으로 계산한 정답과의 전반적인 거리감입니다. 100%에 도달하면 정답과
                동일한 단어예요.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {statistics.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/60 bg-muted/60 p-4 text-slate-100 shadow-subtle"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-200/70">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {item.value}
                    <span className="ml-1 text-sm font-medium text-indigo-200">%</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-300">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-border/70 bg-muted/50 p-6 text-slate-200 shadow-subtle">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">플레이 통계</p>
                  <p className="text-xs text-slate-400">
                    로컬에만 저장되며 기기 변경 시 초기화됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetProgress}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-warning/40 bg-transparent px-4 text-xs font-semibold text-warning-foreground transition hover:bg-warning/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
                >
                  정복률 초기화
                </button>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-slate-900/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200/70">
                    총 시도
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">{stats.totalGuesses}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-slate-900/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200/70">
                    정답 횟수
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">{stats.correctAnswers}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-slate-900/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200/70">
                    정답 확률
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    {successRate}
                    <span className="ml-1 text-sm text-indigo-200">%</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">마지막 초기화: {lastResetLabel}</p>
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader className="items-center pb-4">
          <CardTitle>자모별 정확도 레이더</CardTitle>
          <CardDescription>최근 라운드에서 달성한 최고 유사도를 시각화합니다.</CardDescription>
        </CardHeader>
        <CardContent className="pb-0">
          <ChartContainer config={radarConfig} className="mx-auto aspect-square w-full max-w-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(148, 163, 184, 0.2)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: 'rgba(148, 163, 184, 0.85)', fontSize: 12 }}
                />
                <ChartTooltip cursor={false} />
                <Radar
                  dataKey="score"
                  stroke="var(--color-score)"
                  fill="var(--color-score)"
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm text-slate-200">
          <div className="flex items-center gap-2 font-medium text-slate-100">
            최근 최고 유사도 {progressValue}%
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            정답 확률 {successRate}% · 총 시도 {stats.totalGuesses}회
          </div>
        </CardFooter>
      </Card>

      <section className="rounded-3xl border border-border/80 bg-card/95 p-6 shadow-subtle sm:p-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">추측 로그</h2>
            <p className="text-xs text-slate-400">
              자음·모음·받침 각각의 유사도를 확인해 보세요.
            </p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-200/70">
            {String(guesses.length).padStart(2, '0')} 회 시도
          </span>
        </header>

        {guesses.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border/70 bg-muted/50 px-4 py-6 text-center text-sm text-slate-300">
            아직 추측이 없습니다. 초성을 보고 떠오르는 단어를 입력해 보세요!
          </p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {guesses.map((guess) => (
              <li
                key={guess.normalized}
                className="rounded-2xl border border-border/60 bg-slate-900/60 p-4 text-slate-200 shadow-subtle"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{guess.value}</p>
                    <p className="text-xs text-slate-400">초성: {extractChoseong(guess.value)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-2xl font-bold text-white">
                      {guess.breakdown.overall}
                      <span className="ml-1 text-sm font-medium text-indigo-200">%</span>
                    </span>
                    <span className="text-xs uppercase tracking-[0.4em] text-indigo-200/70">
                      총점
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                  {[
                    { label: '초성', value: guess.breakdown.initial },
                    { label: '모음', value: guess.breakdown.medial },
                    { label: '받침', value: guess.breakdown.final },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-slate-800/60 px-3 py-2"
                    >
                      <span className="font-semibold text-indigo-200/80">{item.label}</span>
                      <span className="font-semibold text-white">
                        {item.value}
                        <span className="ml-1 text-[0.7rem] text-indigo-200">%</span>
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {status === 'cleared' && (
        <section className="rounded-3xl border border-success/30 bg-success/10 p-6 text-success-foreground shadow-subtle sm:p-8">
          <h2 className="text-base font-semibold">정답 해설</h2>
          <p className="mt-3 text-sm leading-relaxed">{currentEntry.description}</p>
        </section>
      )}
    </>
  );
};

export default GameView;
