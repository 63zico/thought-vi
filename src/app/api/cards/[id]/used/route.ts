import { NextResponse } from "next/server";
import { markUsed } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const card = await markUsed(id);

    if (!card) {
      return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      {
        error: "사용 횟수 저장 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
