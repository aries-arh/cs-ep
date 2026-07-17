import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    const rowId = Number(id);
    const row = await prisma.trxMiOut.findUnique({ where: { id: rowId } });
    if (!row || row.isVoid) return jsonError("Data tidak ditemukan", 404);

    const updated = await prisma.trxMiOut.update({
      where: { id: rowId },
      data: { isVoid: true },
    });
    return jsonOk(updated);
  } catch (e) {
    return handleApiError(e);
  }
}
