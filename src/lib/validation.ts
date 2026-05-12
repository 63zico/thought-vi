import { z } from "zod";

export const wordBreakdownSchema = z.object({
  word: z.string().min(1),
  meaning_ko: z.string().min(1),
  grammar_role: z.string().min(1),
  nuance_ko: z.string().min(1),
  example_vi: z.string().min(1),
  example_ko: z.string().min(1)
});

export const emotionSchema = z.enum(["angry", "funny", "stressful", "exciting", "neutral"]);

export const toneVariantSchema = z.object({
  tone: z.enum(["basic_male", "romantic_male", "rapper_male"]),
  label_ko: z.string().min(1),
  vietnamese: z.string().min(1),
  pronunciation: z.string().min(1),
  nuance_ko: z.string().min(1)
});

export const translationSchema = z.object({
  korean: z.string().min(1),
  vietnamese: z.string().min(1),
  pronunciation: z.string().min(1),
  tag: z.string().min(1),
  emotion: emotionSchema.default("neutral"),
  tone_variants: z.array(toneVariantSchema).default([]),
  word_breakdown: z.array(wordBreakdownSchema).min(1)
});

export const difficultySchema = z.enum(["easy", "normal", "hard"]);

export const cardSchema = translationSchema.extend({
  difficulty: difficultySchema.default("normal")
});
