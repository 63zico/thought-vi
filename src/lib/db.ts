import initSqlJs, { type Database, type QueryExecResult } from "sql.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CardStatus,
  Difficulty,
  Emotion,
  ThoughtCard,
  ToneVariant,
  WordBreakdown
} from "@/types/card";
import { addMinutes, calculateNextReview } from "@/lib/review";

const rawSupabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s+/g, "");
const supabaseUrl = rawSupabaseUrl
  ?.replace(/\s+/g, "")
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "");
const useSupabase = Boolean(supabaseUrl && supabaseKey);

const dbPath = process.env.DATABASE_PATH ?? "./data/cards.db";
const absoluteDbPath = path.isAbsolute(dbPath)
  ? dbPath
  : path.join(process.cwd(), dbPath);
const sqlWasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");

if (!useSupabase) {
  mkdirSync(path.dirname(absoluteDbPath), { recursive: true });
}

let dbPromise: Promise<Database> | null = null;

type CardRow = Omit<ThoughtCard, "word_breakdown" | "tone_variants"> & {
  word_breakdown: string | WordBreakdown[];
  tone_variants: string | ToneVariant[];
};

type NewCardInput = {
  korean: string;
  vietnamese: string;
  pronunciation: string;
  tag: string;
  emotion?: Emotion;
  tone_variants?: ToneVariant[];
  word_breakdown: WordBreakdown[];
  difficulty?: Difficulty;
};

async function getDb() {
  if (!dbPromise) {
    dbPromise = initSqlJs({
      locateFile: () => sqlWasmPath
    }).then((SQL) => {
      const db = existsSync(absoluteDbPath)
        ? new SQL.Database(readFileSync(absoluteDbPath))
        : new SQL.Database();

      db.run(`
        CREATE TABLE IF NOT EXISTS cards (
          id TEXT PRIMARY KEY,
          korean TEXT NOT NULL,
          vietnamese TEXT NOT NULL,
          pronunciation TEXT NOT NULL,
          tag TEXT NOT NULL,
          emotion TEXT NOT NULL DEFAULT 'neutral',
          tone_variants TEXT NOT NULL DEFAULT '[]',
          word_breakdown TEXT NOT NULL,
          difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
          review_count INTEGER NOT NULL DEFAULT 0,
          hard_count INTEGER NOT NULL DEFAULT 0,
          used_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          last_reviewed TEXT NOT NULL,
          last_used_at TEXT NOT NULL,
          mastered_at TEXT NOT NULL DEFAULT '',
          archived_at TEXT NOT NULL DEFAULT '',
          next_review TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
        CREATE INDEX IF NOT EXISTS idx_cards_tag ON cards(tag);
      `);
      ensureColumn(db, "hard_count", "INTEGER NOT NULL DEFAULT 0");
      ensureColumn(db, "used_count", "INTEGER NOT NULL DEFAULT 0");
      ensureColumn(db, "last_used_at", "TEXT NOT NULL DEFAULT ''");
      ensureColumn(db, "emotion", "TEXT NOT NULL DEFAULT 'neutral'");
      ensureColumn(db, "tone_variants", "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, "status", "TEXT NOT NULL DEFAULT 'active'");
      ensureColumn(db, "mastered_at", "TEXT NOT NULL DEFAULT ''");
      ensureColumn(db, "archived_at", "TEXT NOT NULL DEFAULT ''");

      persist(db);
      return db;
    });
  }

  return dbPromise;
}

function persist(db: Database) {
  writeFileSync(absoluteDbPath, Buffer.from(db.export()));
}

function ensureColumn(db: Database, column: string, definition: string) {
  const table = db.exec("PRAGMA table_info(cards)")[0];
  const columns = table?.values.map((value) => String(value[1])) ?? [];
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE cards ADD COLUMN ${column} ${definition}`);
  }
}

function parseJsonField<T>(value: string | T[], fallback: T[]): T[] {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as T[];
  } catch {
    return fallback;
  }
}

function toCard(row: CardRow): ThoughtCard {
  return {
    ...row,
    hard_count: Number(row.hard_count ?? 0),
    used_count: Number(row.used_count ?? 0),
    review_count: Number(row.review_count ?? 0),
    status: (row.status ?? "active") as CardStatus,
    emotion: (row.emotion ?? "neutral") as Emotion,
    tone_variants: parseJsonField<ToneVariant>(row.tone_variants, []),
    word_breakdown: parseJsonField<WordBreakdown>(row.word_breakdown, [])
  };
}

function rowsFromResult(result: QueryExecResult[]): CardRow[] {
  const table = result[0];
  if (!table) return [];

  return table.values.map((values) => {
    const row = Object.fromEntries(
      table.columns.map((column, index) => [column, values[index]])
    );
    return row as CardRow;
  });
}

function buildCard(input: NewCardInput): ThoughtCard {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    korean: input.korean,
    vietnamese: input.vietnamese,
    pronunciation: input.pronunciation,
    tag: input.tag,
    emotion: input.emotion ?? "neutral",
    tone_variants: input.tone_variants ?? [],
    word_breakdown: input.word_breakdown,
    difficulty: input.difficulty ?? "normal",
    review_count: 0,
    hard_count: 0,
    used_count: 0,
    status: "active",
    last_reviewed: "",
    last_used_at: "",
    mastered_at: "",
    archived_at: "",
    next_review: now,
    created_at: now
  };
}

async function supabaseRequest<T>(pathAndQuery: string, init: RequestInit = {}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase 환경변수가 설정되어 있지 않습니다.");
  }

  if (!supabaseUrl.startsWith("https://") || supabaseUrl.includes("/rest/v1")) {
    throw new Error(
      "SUPABASE_URL 형식이 올바르지 않습니다. 예: https://xxxxx.supabase.co"
    );
  }

  const url = `${supabaseUrl}/rest/v1/${pathAndQuery}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export async function listCards(tag?: string) {
  if (useSupabase) {
    const filter = tag ? `&tag=eq.${encodeURIComponent(tag)}` : "";
    const rows = await supabaseRequest<CardRow[]>(
      `cards?select=*&order=created_at.desc${filter}`,
      { method: "GET" }
    );
    return rows.map(toCard);
  }

  const db = await getDb();
  if (tag) {
    return rowsFromResult(
      db.exec("SELECT * FROM cards WHERE tag = ? ORDER BY created_at DESC", [tag])
    ).map(toCard);
  }

  return rowsFromResult(db.exec("SELECT * FROM cards ORDER BY created_at DESC")).map(toCard);
}

export async function listDueCards() {
  const now = new Date().toISOString();

  if (useSupabase) {
    const rows = await supabaseRequest<CardRow[]>(
      `cards?select=*&status=eq.active&or=(next_review.lte.${encodeURIComponent(
        now
      )},hard_count.gte.3)&order=hard_count.desc,next_review.asc`,
      { method: "GET" }
    );
    return rows.map(toCard);
  }

  const db = await getDb();
  return rowsFromResult(
    db.exec(
      `SELECT * FROM cards
       WHERE status = 'active' AND (next_review <= ? OR hard_count >= 3)
       ORDER BY
         CASE WHEN hard_count >= 3 THEN 0 ELSE 1 END,
         next_review ASC`,
      [now]
    )
  ).map(toCard);
}

export async function createCard(input: NewCardInput) {
  const card = buildCard(input);

  if (useSupabase) {
    const [created] = await supabaseRequest<CardRow[]>("cards", {
      method: "POST",
      body: JSON.stringify(card)
    });
    return toCard(created);
  }

  const db = await getDb();
  db.run(
    `INSERT INTO cards (
        id, korean, vietnamese, pronunciation, tag, emotion, tone_variants, word_breakdown, difficulty,
        review_count, hard_count, used_count, status, last_reviewed, last_used_at,
        mastered_at, archived_at, next_review, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    [
      card.id,
      card.korean,
      card.vietnamese,
      card.pronunciation,
      card.tag,
      card.emotion,
      JSON.stringify(card.tone_variants),
      JSON.stringify(card.word_breakdown),
      card.difficulty,
      card.review_count,
      card.hard_count,
      card.used_count,
      card.status,
      card.last_reviewed,
      card.last_used_at,
      card.mastered_at,
      card.archived_at,
      card.next_review,
      card.created_at
    ]
  );
  persist(db);

  return card;
}

export async function updateCardStatus(id: string, status: CardStatus) {
  const current = await getCard(id);
  if (!current) return null;

  const now = new Date().toISOString();
  const patch = {
    status,
    mastered_at: status === "mastered" ? now : current.mastered_at,
    archived_at: status === "archived" ? now : current.archived_at
  };

  if (useSupabase) {
    const [updated] = await supabaseRequest<CardRow[]>(`cards?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    return toCard(updated);
  }

  const db = await getDb();
  db.run("UPDATE cards SET status = ?, mastered_at = ?, archived_at = ? WHERE id = ?", [
    patch.status,
    patch.mastered_at,
    patch.archived_at,
    id
  ]);
  persist(db);

  return { ...current, ...patch };
}

export async function deleteCard(id: string) {
  if (useSupabase) {
    await supabaseRequest<null>(`cards?id=eq.${id}`, { method: "DELETE" });
    return;
  }

  const db = await getDb();
  db.run("DELETE FROM cards WHERE id = ?", [id]);
  persist(db);
}

export async function updateReview(id: string, difficulty: Difficulty) {
  const current = await getCard(id);
  if (!current) return null;

  const reviewCount = current.review_count + 1;
  const hardCount = difficulty === "hard" ? current.hard_count + 1 : current.hard_count;
  const patch = {
    difficulty,
    review_count: reviewCount,
    hard_count: hardCount,
    last_reviewed: new Date().toISOString(),
    next_review: calculateNextReview(difficulty, reviewCount)
  };

  if (useSupabase) {
    const [updated] = await supabaseRequest<CardRow[]>(`cards?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    return toCard(updated);
  }

  const db = await getDb();
  db.run(
    `UPDATE cards
       SET difficulty = ?, review_count = ?, hard_count = ?, last_reviewed = ?, next_review = ?
       WHERE id = ?`,
    [
      patch.difficulty,
      patch.review_count,
      patch.hard_count,
      patch.last_reviewed,
      patch.next_review,
      id
    ]
  );
  persist(db);

  return { ...current, ...patch };
}

export async function markUsed(id: string) {
  const current = await getCard(id);
  if (!current) return null;

  const usedCount = current.used_count + 1;
  const patch = {
    used_count: usedCount,
    last_used_at: new Date().toISOString(),
    next_review: addMinutes(new Date(), usedCount === 1 ? 4320 : 10080)
  };

  if (useSupabase) {
    const [updated] = await supabaseRequest<CardRow[]>(`cards?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    return toCard(updated);
  }

  const db = await getDb();
  db.run("UPDATE cards SET used_count = ?, last_used_at = ?, next_review = ? WHERE id = ?", [
    patch.used_count,
    patch.last_used_at,
    patch.next_review,
    id
  ]);
  persist(db);

  return { ...current, ...patch };
}

async function getCard(id: string) {
  if (useSupabase) {
    const rows = await supabaseRequest<CardRow[]>(`cards?select=*&id=eq.${id}&limit=1`, {
      method: "GET"
    });
    return rows[0] ? toCard(rows[0]) : null;
  }

  const db = await getDb();
  const row = rowsFromResult(db.exec("SELECT * FROM cards WHERE id = ?", [id]))[0];
  return row ? toCard(row) : null;
}
