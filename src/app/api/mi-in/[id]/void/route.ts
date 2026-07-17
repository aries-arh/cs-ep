import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSession();
    if (user.role === "OPERATOR") {
      // operator boleh void milik sendiri / last — tetap izinkan seperti Excel undo
    }
    const { id } = await ctx.params;
    const rowId = Number(id);
    const row = await prisma.trxMiIn.findUnique({ where: { id: rowId } });
    if (!row || row.isVoid) return jsonError("Data tidak ditemukan", 404);

    const updated = await prisma.trxMiIn.update({
      where: { id: rowId },
      data: { isVoid: true },
    });
    return jsonOk(updated);
  } catch (e) {
    return handleApiError(e);
  }
}
