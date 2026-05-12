import { NextResponse } from "next/server";
import { updateReview } from "@/lib/db";
import { difficultySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { difficulty?: unknown };
    const parsed = difficultySchema.safeParse(body.difficulty);

    if (!parsed.success) {
      return NextResponse.json({ error: "난이도 값이 올바르지 않습니다." }, { status: 400 });
    }

    const card = await updateReview(id, parsed.data);
    if (!card) {
      return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      {
        error: "복습 정보 업데이트 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
