import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getStockByPartNo } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const partNo = searchParams.get("partNo")?.trim();

    if (partNo) {
      const stock = await getStockByPartNo(partNo);
      if (!stock) return jsonError("Part No tidak ditemukan", 404);
      return jsonOk(stock);
    }

    const parts = await prisma.mstPart.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { partNo: { contains: q } },
                { partName: { contains: q } },
              ],
            }
          : {}),
      },
      include: { line: true },
      take: 30,
      orderBy: { partNo: "asc" },
    });
    return jsonOk(
      parts.map((p) => ({
        id: p.id,
        partNo: p.partNo,
        partName: p.partName,
        lineCode: p.line?.code ?? null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}
