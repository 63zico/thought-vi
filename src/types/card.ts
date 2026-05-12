export type Difficulty = "easy" | "normal" | "hard";
export type Emotion = "angry" | "funny" | "stressful" | "exciting" | "neutral";
export type CardStatus = "active" | "mastered" | "archived";

export type WordBreakdown = {
  word: string;
  meaning_ko: string;
  grammar_role: string;
  nuance_ko: string;
  example_vi: string;
  example_ko: string;
};

export type ToneVariant = {
  tone: "soft" | "boss" | "close" | "angry";
  label_ko: string;
  vietnamese: string;
  pronunciation: string;
  nuance_ko: string;
};

export type ThoughtCard = {
  id: string;
  korean: string;
  vietnamese: string;
  pronunciation: string;
  tag: string;
  emotion: Emotion;
  tone_variants: ToneVariant[];
  word_breakdown: WordBreakdown[];
  difficulty: Difficulty;
  review_count: number;
  hard_count: number;
  used_count: number;
  status: CardStatus;
  last_reviewed: string;
  last_used_at: string;
  mastered_at: string;
  archived_at: string;
  next_review: string;
  created_at: string;
};

export type TranslationResult = Pick<
  ThoughtCard,
  "korean" | "vietnamese" | "pronunciation" | "tag" | "emotion" | "tone_variants" | "word_breakdown"
>;
