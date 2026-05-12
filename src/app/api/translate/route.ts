import { NextResponse } from "next/server";
import { translationSchema } from "@/lib/validation";

export const runtime = "nodejs";

const systemPrompt = `You convert Korean thoughts into natural Vietnamese learning cards.
Return ONLY valid JSON. No markdown. No commentary.

JSON shape:
{
  "korean": "original Korean sentence",
  "vietnamese": "natural Vietnamese sentence",
  "pronunciation": "Hangul-only Korean approximation of the Vietnamese pronunciation",
  "tag": "one short Korean situation tag",
  "emotion": "angry | funny | stressful | exciting | neutral",
  "tone_variants": [
    {
      "tone": "soft | boss | close | angry",
      "label_ko": "Korean label for this tone",
      "vietnamese": "Vietnamese sentence in this tone",
      "pronunciation": "Hangul-only Korean approximation",
      "nuance_ko": "Korean nuance explanation"
    }
  ],
  "word_breakdown": [
    {
      "word": "Vietnamese word or phrase",
      "meaning_ko": "Korean meaning",
      "grammar_role": "grammar role in Korean",
      "nuance_ko": "real usage nuance in Korean",
      "example_vi": "short Vietnamese example",
      "example_ko": "Korean translation of the example"
    }
  ]
}

Tags should usually be one of: 주방, 직원관리, 업체협상, 손님응대, 연애, 생활. Use another short Korean tag only if clearly better.
Emotion should capture the feeling behind the Korean thought, not just the topic.
Always return exactly 4 tone_variants:
- soft: 부드러운 버전
- boss: 사장님 버전
- close: 친한 버전
- angry: 화난 버전
Pronunciation rules:
- The pronunciation field MUST be written in Hangul, not Vietnamese romanization.
- Approximate Vietnamese tones for Korean speakers with natural readable Hangul.
- Example: "Anh yêu em" -> "아잉 이우 엠", not "Anh yêu em".
- Example: "Cảm ơn anh" -> "깜 언 아잉", not "Cảm ơn anh".
Speed rules:
- Keep word_breakdown to 3-5 important chunks only.
- Keep nuance_ko and examples short.
- Keep tone variant nuance_ko under 25 Korean characters.
Use contemporary, spoken, natural Vietnamese. Keep the translation useful for real life, not textbook literal.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { korean?: string };
    const korean = body.korean?.trim();
    if (!korean) {
      return NextResponse.json({ error: "한국어 문장을 입력해주세요." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        temperature: 0.25,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: korean }
        ]
      })
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "OpenAI 번역 요청에 실패했습니다.", detail },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "OpenAI 응답에서 JSON 내용을 찾지 못했습니다." },
        { status: 502 }
      );
    }

    const parsed = translationSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "OpenAI JSON 응답 형식이 올바르지 않습니다.", issues: parsed.error.flatten() },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed.data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "번역 시간이 너무 오래 걸렸습니다. 문장을 조금 짧게 입력하거나 다시 시도해주세요." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "번역 중 예기치 못한 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
