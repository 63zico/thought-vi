"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  Brain,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  Ear,
  Flame,
  Archive,
  Loader2,
  Mic,
  Moon,
  Play,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Volume2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { CardStatus, Difficulty, ThoughtCard, TranslationResult } from "@/types/card";

type View = "home" | "result" | "cards" | "review";
type QuizMode = "ko-to-vi" | "vi-to-ko" | "blank";
type SpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type ZaloSdk = {
  init?: (...args: unknown[]) => void;
  [key: string]: unknown;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    zaloJSV2?: ZaloSdk;
  }
}

const difficultyLabel: Record<Difficulty, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움"
};

const emotionLabel: Record<ThoughtCard["emotion"], string> = {
  angry: "화남",
  funny: "웃김",
  stressful: "스트레스",
  exciting: "신남",
  neutral: "감정 없음"
};

const fixedFilters = [
  "전체",
  "생활",
  "연애",
  "직원관리",
  "주방",
  "손님응대",
  "업체협상",
  "감정",
  "집착",
  "마스터",
  "보관"
];

const tabs: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "입력", icon: Brain },
  { view: "cards", label: "카드", icon: BookOpen },
  { view: "review", label: "복습", icon: Ear }
];

function formatDate(value: string) {
  if (!value) return "아직 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function isToday(value: string) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function makeBlank(text: string) {
  const parts = text.split(" ").filter(Boolean);
  if (parts.length < 2) return { question: text.replace(/[^\s]+/, "____"), answer: parts[0] ?? text };
  const index = Math.min(1, parts.length - 1);
  const answer = parts[index];
  parts[index] = "____";
  return { question: parts.join(" "), answer };
}

export default function VietnameseThoughtApp() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("home");
  const [korean, setKorean] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [cards, setCards] = useState<ThoughtCard[]>([]);
  const [dueCards, setDueCards] = useState<ThoughtCard[]>([]);
  const [activeTag, setActiveTag] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizMode, setQuizMode] = useState<QuizMode>("ko-to-vi");
  const [convertedToday, setConvertedToday] = useState(0);
  const [vietnameseVoice, setVietnameseVoice] = useState<SpeechSynthesisVoice | null>(null);

  const tags = fixedFilters;

  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        if (activeTag === "마스터") return card.status === "mastered";
        if (activeTag === "보관") return card.status === "archived";
        if (card.status !== "active") return false;
        if (activeTag === "전체") return true;
        if (activeTag === "집착") return card.hard_count >= 3;
        if (activeTag === "감정") return card.emotion !== "neutral";
        return card.tag === activeTag;
      }),
    [cards, activeTag]
  );

  const obsessionCount = cards.filter((card) => card.status === "active" && card.hard_count >= 3).length;
  const newToday = cards.filter((card) => isToday(card.created_at)).length;
  const usedToday = cards.reduce(
    (sum, card) => sum + (isToday(card.last_used_at) ? Math.max(1, card.used_count) : 0),
    0
  );
  const visibleConvertedToday = Math.max(convertedToday, newToday);
  const cardSaveRate = visibleConvertedToday
    ? Math.min(100, Math.round((newToday / visibleConvertedToday) * 100))
    : 0;
  const currentReview = dueCards[reviewIndex] ?? null;
  const blankQuiz = currentReview ? makeBlank(currentReview.vietnamese) : null;

  async function refreshCards() {
    setListLoading(true);
    try {
      const [allResponse, dueResponse] = await Promise.all([
        fetch("/api/cards"),
        fetch("/api/cards?due=true")
      ]);
      if (!allResponse.ok || !dueResponse.ok) throw new Error("카드 목록을 불러오지 못했습니다.");
      setCards(await allResponse.json());
      setDueCards(await dueResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드 목록 오류");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    refreshCards();
    const key = `thought-vi-converted-${todayKey()}`;
    setConvertedToday(Number(window.localStorage.getItem(key) ?? 0));
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;

    // Zalo WebView may inject the SDK after hydration. Keep access client-only
    // and do not initialize it because this app does not depend on Zalo APIs.
    void window.zaloJSV2;
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!("speechSynthesis" in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const viVoice =
        voices.find((voice) => voice.lang.toLowerCase() === "vi-vn") ??
        voices.find((voice) => voice.lang.toLowerCase().startsWith("vi")) ??
        null;
      setVietnameseVoice(viVoice);
    };

    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [mounted]);

  async function translate() {
    const trimmed = korean.trim();
    if (!trimmed) {
      setError("먼저 한국어 생각이나 문장을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setSavedCardId(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ korean: trimmed })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "번역에 실패했습니다.");
      const key = `thought-vi-converted-${todayKey()}`;
      const nextCount = Number(window.localStorage.getItem(key) ?? 0) + 1;
      window.localStorage.setItem(key, String(nextCount));
      setConvertedToday(nextCount);
      setResult(data);
      setView("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "번역 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCard() {
    if (!result) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, difficulty: "normal" })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error ?? "저장에 실패했습니다.");
      }
      setSavedCardId(data.id);
      await refreshCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function startNewThought() {
    setKorean("");
    setResult(null);
    setSavedCardId(null);
    setError("");
    setView("home");
  }

  function listen() {
    if (!window.isSecureContext) {
      setError("폰에서 마이크를 쓰려면 HTTPS 주소가 필요합니다. localhost에서는 되지만, http://192... 로 접속하면 브라우저가 음성 입력을 막을 수 있습니다.");
      return;
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("이 브라우저는 음성 입력을 지원하지 않습니다. Android Chrome 또는 HTTPS 배포 주소에서 다시 시도해주세요.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setError("음성 입력을 처리하지 못했습니다.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setKorean((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("이 브라우저는 TTS를 지원하지 않습니다.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    if (vietnameseVoice) {
      utterance.voice = vietnameseVoice;
      utterance.lang = vietnameseVoice.lang;
    }
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function gradeReview(difficulty: Difficulty) {
    if (!currentReview) return;
    setError("");

    try {
      const response = await fetch(`/api/cards/${currentReview.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "복습 저장에 실패했습니다.");

      const nextDue = dueCards.filter((card) => card.id !== currentReview.id);
      setDueCards(nextDue);
      setReviewIndex((index) => Math.min(index, Math.max(0, nextDue.length - 1)));
      setShowAnswer(false);
      await refreshCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "복습 처리 중 오류가 발생했습니다.");
    }
  }

  async function markCardUsed(id: string) {
    setError("");

    try {
      const response = await fetch(`/api/cards/${id}/used`, {
        method: "PATCH"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "사용 기록 저장에 실패했습니다.");
      await refreshCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "사용 기록 처리 중 오류가 발생했습니다.");
    }
  }

  async function changeCardStatus(id: string, status: CardStatus) {
    setError("");

    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "카드 상태 변경에 실패했습니다.");
      await refreshCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드 상태 변경 중 오류가 발생했습니다.");
    }
  }

  async function removeCard(id: string) {
    const ok = window.confirm("이 카드를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!ok) return;

    setError("");

    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "카드 삭제에 실패했습니다.");
      await refreshCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드 삭제 중 오류가 발생했습니다.");
    }
  }

  if (!mounted) {
    return <HydrationShell />;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(98,230,255,0.13),transparent_32%),linear-gradient(180deg,#090b10_0%,#111620_100%)] px-4 pb-28 pt-4 text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md flex-col">
        <header className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={() => setView("home")}
            className="focus-ring flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold"
          >
            <Moon size={16} className="text-cyanline" />
            Thought VI
          </button>
          <div className="flex items-center gap-2">
            {obsessionCount ? (
              <div className="rounded-full border border-rosehot/30 bg-rosehot/10 px-3 py-1 text-xs font-semibold text-rose-100">
                집착 {obsessionCount}
              </div>
            ) : null}
            <div className="rounded-full border border-limeglow/30 bg-limeglow/10 px-3 py-1 text-xs font-semibold text-limeglow">
              오늘 {dueCards.length}장
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rosehot/30 bg-rosehot/10 p-3 text-sm text-rose-100">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <section className="flex-1">
          {view === "home" ? (
            <HomeView
              korean={korean}
              setKorean={setKorean}
              loading={loading}
              isListening={isListening}
              convertedToday={visibleConvertedToday}
              newToday={newToday}
              usedToday={usedToday}
              thoughtRate={cardSaveRate}
              obsessionCount={obsessionCount}
              onListen={listen}
              onTranslate={translate}
            />
          ) : null}

          {view === "result" && result ? (
            <ResultView
              result={result}
              saved={Boolean(savedCardId)}
              saving={saving}
              onSave={saveCard}
              onSpeak={speak}
              onNewInput={startNewThought}
            />
          ) : null}

          {view === "cards" ? (
            <CardsView
              cards={filteredCards}
              tags={tags}
              activeTag={activeTag}
              listLoading={listLoading}
              onTag={setActiveTag}
              onSpeak={speak}
              onMarkUsed={markCardUsed}
              onChangeStatus={changeCardStatus}
              onDelete={removeCard}
            />
          ) : null}

          {view === "review" ? (
            <ReviewView
              card={currentReview}
              total={dueCards.length}
              showAnswer={showAnswer}
              quizMode={quizMode}
              blankQuiz={blankQuiz}
              onMode={setQuizMode}
              onShowAnswer={() => setShowAnswer(true)}
              onGrade={gradeReview}
              onMarkUsed={markCardUsed}
              onSpeak={speak}
            />
          ) : null}
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-ink/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => setView(tab.view)}
                className={clsx(
                  "focus-ring flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition",
                  view === tab.view
                    ? "bg-cyanline text-ink"
                    : "bg-white/5 text-mist hover:bg-white/10"
                )}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

function HomeView(props: {
  korean: string;
  setKorean: (value: string) => void;
  loading: boolean;
  isListening: boolean;
  convertedToday: number;
  newToday: number;
  usedToday: number;
  thoughtRate: number;
  obsessionCount: number;
  onListen: () => void;
  onTranslate: () => void;
}) {
  return (
    <div className="space-y-5 pt-6">
      <div className="rounded-3xl border border-white/10 bg-panel/80 p-4 shadow-glow">
        <div className="mb-3 flex items-center gap-2">
          <ChartNoAxesColumnIncreasing size={18} className="text-cyanline" />
          <h2 className="text-lg font-black">오늘의 뇌 통계</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="변환" value={`${props.convertedToday}`} />
          <StatTile label="새 문장" value={`${props.newToday}`} />
          <StatTile label="실제 사용" value={`${props.usedToday}`} />
          <StatTile label="카드화율" value={`${props.thoughtRate}%`} hot />
        </div>
      </div>

      <div className="rounded-3xl border border-limeglow/20 bg-limeglow/10 p-4">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-limeglow" />
          <p className="text-sm font-black text-limeglow">현실 미션</p>
        </div>
        <p className="mt-2 text-lg font-black">오늘 실제로 쓴 문장 {props.usedToday}/3</p>
        <div className="mt-3 h-2 rounded-full bg-ink/60">
          <div
            className="h-2 rounded-full bg-limeglow"
            style={{ width: `${Math.min(100, (props.usedToday / 3) * 100)}%` }}
          />
        </div>
        {props.obsessionCount ? (
          <p className="mt-3 text-sm text-rose-100">집착 카드 {props.obsessionCount}장이 먼저 튀어나올 준비 중입니다.</p>
        ) : null}
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-cyanline">순간 생각 캡처</p>
        <h1 className="text-3xl font-black leading-tight tracking-normal">
          방금 떠오른 한국어를 바로 베트남어 카드로.
        </h1>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-panel/80 p-4 shadow-glow">
        <textarea
          value={props.korean}
          onChange={(event) => props.setKorean(event.target.value)}
          placeholder="예: 오늘 직원들한테 재료 정리 먼저 하라고 말해야겠다."
          className="focus-ring min-h-56 w-full resize-none rounded-3xl border border-white/10 bg-ink/80 p-4 text-lg leading-relaxed text-white placeholder:text-slate-500"
        />
        <div className="mt-3 grid grid-cols-[56px_1fr] gap-3">
          <button
            type="button"
            onClick={props.onListen}
            className={clsx(
              "focus-ring flex h-14 items-center justify-center rounded-2xl border border-white/10",
              props.isListening ? "bg-rosehot text-white" : "bg-white/10 text-cyanline"
            )}
            aria-label="음성 입력"
          >
            <Mic size={22} />
          </button>
          <button
            type="button"
            onClick={props.onTranslate}
            disabled={props.loading}
            className="focus-ring flex h-14 items-center justify-center gap-2 rounded-2xl bg-limeglow px-4 text-base font-black text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
            베트남어로 바꾸기
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile(props: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={clsx("rounded-2xl bg-ink/70 p-3", props.hot && "border border-cyanline/30")}>
      <p className="text-xs font-bold text-mist">{props.label}</p>
      <p className={clsx("mt-1 text-2xl font-black", props.hot ? "text-cyanline" : "text-white")}>
        {props.value}
      </p>
    </div>
  );
}

function ResultView(props: {
  result: TranslationResult;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onSpeak: (text: string) => void;
  onNewInput: () => void;
}) {
  return (
    <div className="space-y-4 pt-4">
      <CardShell>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Korean</p>
        <p className="mt-2 text-lg leading-relaxed">{props.result.korean}</p>
      </CardShell>

      <CardShell className="border-cyanline/30 bg-cyanline/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyanline">
              Vietnamese
            </p>
            <p className="mt-2 text-2xl font-black leading-snug">{props.result.vietnamese}</p>
            <p className="mt-3 text-sm leading-relaxed text-mist">{props.result.pronunciation}</p>
          </div>
          <button
            type="button"
            onClick={() => props.onSpeak(props.result.vietnamese)}
            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyanline"
            aria-label="베트남어 재생"
          >
            <Volume2 size={20} />
          </button>
        </div>
      </CardShell>

      <div className="rounded-3xl border border-white/10 bg-panel/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">단어별 breakdown</h2>
          <div className="flex gap-2">
            <span className="rounded-full bg-cyanline/10 px-3 py-1 text-xs font-bold text-cyanline">
              {emotionLabel[props.result.emotion]}
            </span>
            <span className="rounded-full bg-limeglow/10 px-3 py-1 text-xs font-bold text-limeglow">
              {props.result.tag}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {props.result.word_breakdown.map((item) => (
            <div key={`${item.word}-${item.example_vi}`} className="rounded-2xl bg-ink/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-black">{item.word}</p>
                <p className="text-right text-sm text-cyanline">{item.meaning_ko}</p>
              </div>
              <p className="mt-2 text-sm text-mist">{item.grammar_role}</p>
              <p className="mt-2 text-sm leading-relaxed">{item.nuance_ko}</p>
              <p className="mt-3 text-sm font-semibold text-limeglow">{item.example_vi}</p>
              <p className="mt-1 text-sm text-mist">{item.example_ko}</p>
            </div>
          ))}
        </div>
      </div>

      {props.result.tone_variants.length ? (
        <div className="rounded-3xl border border-white/10 bg-panel/80 p-4">
          <h2 className="text-lg font-black">남자 스타일 3종</h2>
          <div className="mt-3 space-y-3">
            {props.result.tone_variants.map((variant) => (
              <div key={variant.tone} className="rounded-2xl bg-ink/70 p-3">
                <p className="text-xs font-black text-cyanline">{variant.label_ko}</p>
                <p className="mt-2 text-lg font-black">{variant.vietnamese}</p>
                <p className="mt-1 text-sm text-mist">발음: {variant.pronunciation}</p>
                <p className="mt-2 text-sm leading-relaxed">{variant.nuance_ko}</p>
                <button
                  type="button"
                  onClick={() => props.onSpeak(variant.vietnamese)}
                  className="focus-ring mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-cyanline/10 text-sm font-black text-cyanline"
                >
                  <Volume2 size={18} />
                  이 스타일로 듣기
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={props.onSave}
        disabled={props.saved || props.saving}
        className="focus-ring flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-limeglow text-base font-black text-ink disabled:opacity-70"
      >
        {props.saved ? <Check size={20} /> : props.saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
        {props.saved ? "저장됨" : "카드 저장"}
      </button>
      <button
        type="button"
        onClick={props.onNewInput}
        className="focus-ring flex h-12 w-full items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-cyanline"
      >
        새 문장 입력
      </button>
    </div>
  );
}

function CardsView(props: {
  cards: ThoughtCard[];
  tags: string[];
  activeTag: string;
  listLoading: boolean;
  onTag: (tag: string) => void;
  onSpeak: (text: string) => void;
  onMarkUsed: (id: string) => void;
  onChangeStatus: (id: string, status: CardStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">저장된 카드</h1>
        {props.listLoading ? <Loader2 className="animate-spin text-cyanline" size={18} /> : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {props.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => props.onTag(tag)}
            className={clsx(
              "focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-bold",
              props.activeTag === tag ? "bg-cyanline text-ink" : "bg-white/10 text-mist"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {props.cards.length ? (
          props.cards.map((card) => (
            <div
              key={card.id}
              className={clsx(
                "rounded-3xl border bg-panel/80 p-4",
                card.hard_count >= 3 ? "border-rosehot/40" : "border-white/10"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {card.hard_count >= 3 ? (
                    <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-rosehot/15 px-2 py-1 text-xs font-black text-rose-100">
                      <Flame size={13} />
                      집착 카드
                    </p>
                  ) : null}
                  <p className="mb-2 inline-flex rounded-full bg-cyanline/10 px-2 py-1 text-xs font-black text-cyanline">
                    {emotionLabel[card.emotion]}
                  </p>
                  <p className="text-sm leading-relaxed text-mist">{card.korean}</p>
                  <p className="mt-2 text-xl font-black leading-snug">{card.vietnamese}</p>
                  <p className="mt-2 text-sm text-cyanline">{card.pronunciation}</p>
                </div>
                <button
                  type="button"
                  onClick={() => props.onSpeak(card.vietnamese)}
                  className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyanline"
                  aria-label="베트남어 재생"
                >
                  <Play size={17} />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-mist">
                <span className="rounded-full bg-white/10 px-3 py-1 font-bold">{card.tag}</span>
                <span>
                  난이도: {difficultyLabel[card.difficulty]} · 다음 {formatDate(card.next_review)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                <p className="text-xs text-mist">
                  실제 사용 {card.used_count}회
                  {card.last_used_at ? ` · 최근 ${formatDate(card.last_used_at)}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => props.onMarkUsed(card.id)}
                  className="focus-ring rounded-full bg-limeglow/10 px-3 py-2 text-xs font-black text-limeglow"
                >
                  오늘 실제로 씀
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {card.status !== "active" ? (
                  <button
                    type="button"
                    onClick={() => props.onChangeStatus(card.id, "active")}
                    className="focus-ring flex h-10 items-center justify-center gap-1 rounded-2xl bg-white/10 text-xs font-black text-cyanline"
                  >
                    <Trophy size={14} />
                    다시 복습
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => props.onChangeStatus(card.id, "mastered")}
                    className="focus-ring flex h-10 items-center justify-center gap-1 rounded-2xl bg-cyanline/10 text-xs font-black text-cyanline"
                  >
                    <Trophy size={14} />
                    완벽히 외움
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => props.onChangeStatus(card.id, "archived")}
                  className="focus-ring flex h-10 items-center justify-center gap-1 rounded-2xl bg-white/10 text-xs font-black text-mist"
                >
                  <Archive size={14} />
                  보관
                </button>
                <button
                  type="button"
                  onClick={() => props.onDelete(card.id)}
                  className="focus-ring flex h-10 items-center justify-center gap-1 rounded-2xl bg-rosehot/10 text-xs font-black text-rose-100"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState icon={Search} title="아직 카드가 없습니다" body="홈에서 생각을 번역하고 저장하면 여기에 쌓입니다." />
        )}
      </div>
    </div>
  );
}

function ReviewView(props: {
  card: ThoughtCard | null;
  total: number;
  showAnswer: boolean;
  quizMode: QuizMode;
  blankQuiz: { question: string; answer: string } | null;
  onMode: (mode: QuizMode) => void;
  onShowAnswer: () => void;
  onGrade: (difficulty: Difficulty) => void;
  onMarkUsed: (id: string) => void;
  onSpeak: (text: string) => void;
}) {
  if (!props.card) {
    return (
      <div className="pt-14">
        <EmptyState icon={Check} title="오늘 복습 끝" body="지금 복습할 카드가 없습니다. 새 카드를 저장하면 바로 첫 복습에 들어옵니다." />
      </div>
    );
  }

  const card = props.card;
  const question =
    props.quizMode === "ko-to-vi"
      ? card.korean
      : props.quizMode === "vi-to-ko"
        ? card.vietnamese
        : props.blankQuiz?.question;
  const answer =
    props.quizMode === "ko-to-vi"
      ? card.vietnamese
      : props.quizMode === "vi-to-ko"
        ? card.korean
        : props.blankQuiz?.answer;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">오늘 복습</h1>
          <p className="mt-1 text-xs text-mist">
            떠올리고, 정답 보고, 쉬움/보통/어려움으로 직접 채점
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-mist">
          {props.total}장 남음
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["ko-to-vi", "한→베"],
          ["vi-to-ko", "베→뜻"],
          ["blank", "빈칸"]
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => props.onMode(mode as QuizMode)}
            className={clsx(
              "focus-ring h-10 rounded-2xl text-sm font-black",
              props.quizMode === mode ? "bg-cyanline text-ink" : "bg-white/10 text-mist"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <CardShell className={clsx("min-h-72", card.hard_count >= 3 && "border-rosehot/40")}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <p className="rounded-full bg-limeglow/10 px-2 py-1 text-sm font-bold text-limeglow">
              {card.tag}
            </p>
            <p className="rounded-full bg-cyanline/10 px-2 py-1 text-sm font-bold text-cyanline">
              {emotionLabel[card.emotion]}
            </p>
          </div>
          {card.hard_count >= 3 ? (
            <p className="inline-flex items-center gap-1 rounded-full bg-rosehot/15 px-2 py-1 text-xs font-black text-rose-100">
              <Flame size={13} />
              집착
            </p>
          ) : null}
        </div>
        <p className="mt-8 text-3xl font-black leading-tight">{question}</p>
        {props.quizMode !== "ko-to-vi" ? (
          <button
            type="button"
            onClick={() => props.onSpeak(card.vietnamese)}
            className="focus-ring mt-6 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-cyanline"
          >
            <Volume2 size={17} />
            듣기
          </button>
        ) : null}
      </CardShell>

      {props.showAnswer ? (
        <CardShell className="border-limeglow/30 bg-limeglow/10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-limeglow">Answer</p>
          <p className="mt-2 text-2xl font-black leading-snug">{answer}</p>
          <p className="mt-3 text-sm text-mist">{card.pronunciation}</p>
          <button
            type="button"
            onClick={() => props.onMarkUsed(card.id)}
            className="focus-ring mt-4 rounded-full bg-ink/30 px-4 py-2 text-sm font-black text-limeglow"
          >
            오늘 실제로 씀
          </button>
        </CardShell>
      ) : (
        <button
          type="button"
          onClick={props.onShowAnswer}
          className="focus-ring flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cyanline font-black text-ink"
        >
          정답 보기
          <ChevronRight size={20} />
        </button>
      )}

      {props.showAnswer ? (
        <div className="grid grid-cols-3 gap-2">
          {(["hard", "normal", "easy"] as Difficulty[]).map((difficulty) => (
            <button
              key={difficulty}
              type="button"
              onClick={() => props.onGrade(difficulty)}
              className={clsx(
                "focus-ring h-12 rounded-2xl text-sm font-black",
                difficulty === "hard" && "bg-rosehot text-white",
                difficulty === "normal" && "bg-white/15 text-white",
                difficulty === "easy" && "bg-limeglow text-ink"
              )}
            >
              {difficultyLabel[difficulty]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CardShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-3xl border border-white/10 bg-panel/80 p-4", className)}>
      {children}
    </div>
  );
}

function EmptyState(props: { icon: LucideIcon; title: string; body: string }) {
  const Icon = props.icon;
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyanline">
        <Icon size={22} />
      </div>
      <h2 className="mt-4 text-xl font-black">{props.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist">{props.body}</p>
    </div>
  );
}

function HydrationShell() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(98,230,255,0.13),transparent_32%),linear-gradient(180deg,#090b10_0%,#111620_100%)] px-4 pb-28 pt-4 text-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md flex-col">
        <header className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold">
            <Moon size={16} className="text-cyanline" />
            Thought VI
          </div>
          <div className="rounded-full border border-limeglow/30 bg-limeglow/10 px-3 py-1 text-xs font-semibold text-limeglow">
            준비 중
          </div>
        </header>
        <section className="flex flex-1 items-center justify-center">
          <div className="rounded-3xl border border-white/10 bg-panel/80 p-6 text-center shadow-glow">
            <Loader2 className="mx-auto animate-spin text-cyanline" size={28} />
            <p className="mt-4 text-sm font-bold text-mist">모바일 화면을 준비하고 있습니다.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
