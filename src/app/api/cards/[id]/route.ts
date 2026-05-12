import { NextResponse } from "next/server";
import { deleteCard, updateCardStatus } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const statusSchema = z.enum(["active", "mastered", "archived"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: unknown };
    const parsed = statusSchema.safeParse(body.status);

    if (!parsed.success) {
      return NextResponse.json({ error: "카드 상태 값이 올바르지 않습니다." }, { status: 400 });
    }

    const card = await updateCardStatus(id, parsed.data);
    if (!card) {
      return NextResponse.json({ error: "카드를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    return NextResponse.json(
      {
        error: "카드 상태 변경 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteCard(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "카드 삭제 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
