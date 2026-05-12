create table if not exists public.cards (
  id text primary key,
  korean text not null,
  vietnamese text not null,
  pronunciation text not null,
  tag text not null,
  emotion text not null default 'neutral',
  tone_variants jsonb not null default '[]'::jsonb,
  word_breakdown jsonb not null default '[]'::jsonb,
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  review_count integer not null default 0,
  hard_count integer not null default 0,
  used_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'mastered', 'archived')),
  last_reviewed text not null default '',
  last_used_at text not null default '',
  mastered_at text not null default '',
  archived_at text not null default '',
  next_review text not null,
  created_at text not null
);

create index if not exists idx_cards_next_review on public.cards(next_review);
create index if not exists idx_cards_tag on public.cards(tag);
create index if not exists idx_cards_status on public.cards(status);
