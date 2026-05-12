import { NextResponse } from "next/server";
import { createCard, listCards, listDueCards } from "@/lib/db";
import { cardSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const due = searchParams.get("due") === "true";
  const tag = searchParams.get("tag") ?? undefined;

  return NextResponse.json(due ? await listDueCards() : await listCards(tag));
}

export async function POST(request: Request) {
  try {
    const parsed = cardSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "카드 데이터 형식이 올바르지 않습니다.", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const card = await createCard(parsed.data);
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "카드 저장 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
