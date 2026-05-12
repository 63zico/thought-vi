# Thought VI

모바일용 ADHD 베트남어 학습 웹앱입니다. 한국어로 떠오른 생각을 입력하면 OpenAI API가 자연스러운 베트남어, 한글 발음, 단어별 breakdown, 감정 태그, 말투 변형을 JSON으로 생성하고 카드로 저장합니다.

## 로컬 실행

```bash
npm install
copy .env.example .env
npm run dev
```

로컬에서는 `DATABASE_PATH`의 SQLite 파일을 사용합니다.

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
DATABASE_PATH=./data/cards.db
```

## 매일 폰에서 쓰는 배포 구조

폰에서 마이크까지 안정적으로 쓰려면 HTTPS 배포가 필요합니다. Vercel + Supabase 조합을 권장합니다.

1. Supabase 프로젝트를 만듭니다.
2. Supabase SQL Editor에서 `supabase-schema.sql` 내용을 실행합니다.
3. Vercel 프로젝트 환경변수에 아래 값을 넣습니다.

```env
OPENAI_API_KEY=sk-your-new-key
OPENAI_MODEL=gpt-4.1-mini
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 있으면 앱은 자동으로 Supabase를 사용합니다. 없으면 로컬 SQLite를 사용합니다.

## 주요 기능

- 한국어 생각 입력 및 음성 입력
- OpenAI API JSON 응답 파싱
- 자연스러운 베트남어 번역, 한글 발음, 단어별 설명
- 감정 태그와 AI 말투 교정
- 카드 저장, 태그/집착/마스터/보관 필터
- 오늘의 뇌 통계와 현실 미션
- 한→베, 베→뜻, 빈칸 복습 퀴즈
- 쉬움/보통/어려움에 따른 `next_review` 자동 계산
- 실제 사용 기록, 마스터, 보관, 삭제
- 브라우저 TTS로 베트남어 읽기

## API

- `POST /api/translate`
- `GET /api/cards`
- `GET /api/cards?due=true`
- `POST /api/cards`
- `PATCH /api/cards/:id`
- `DELETE /api/cards/:id`
- `PATCH /api/cards/:id/review`
- `PATCH /api/cards/:id/used`
