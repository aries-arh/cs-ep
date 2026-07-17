import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { endOfDay, getStockByPartNo, startOfDay } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const partNo = searchParams.get("partNo")?.trim();
    const last = searchParams.get("last");

    if (last) {
      const row = await prisma.trxMiOut.findFirst({
        where: { isVoid: false },
        orderBy: { id: "desc" },
        include: { part: true, picUser: true, line: true },
      });
      return jsonOk(row);
    }

    const where: Record<string, unknown> = { isVoid: false };
    if (date) {
      const d = new Date(date);
      where.trxAt = { gte: startOfDay(d), lte: endOfDay(d) };
    }
    if (partNo) where.part = { partNo: { contains: partNo } };

    const rows = await prisma.trxMiOut.findMany({
      where,
      include: { part: true, picUser: true, line: true },
      orderBy: { trxAt: "desc" },
      take: 200,
    });
    return jsonOk(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    if (!user.canMi && user.role === "OPERATOR") {
      return jsonError("Tidak punya akses MI", 403);
    }

    const body = await req.json();
    const partNo = String(body.partNo || "").trim();
    const qty = Number(body.qty);
    const picNik = body.picNik ? String(body.picNik).trim() : user.nik;

    if (!partNo) return jsonError("Part No wajib diisi");
    if (!Number.isFinite(qty) || qty <= 0) return jsonError("Qty Out harus angka > 0");

    const stock = await getStockByPartNo(partNo);
    if (!stock) return jsonError("Part No tidak ditemukan / Part Name kosong", 404);
    if (qty > stock.totalStock) {
      return jsonError(
        `Qty melebihi stok! Stok: ${stock.totalStock}, Input: ${qty}`,
        409
      );
    }

    const pic = await prisma.mstUser.findUnique({ where: { nik: picNik } });

    const row = await prisma.$transaction(async (tx) => {
      // re-check stock inside transaction
      const inAgg = await tx.trxMiIn.aggregate({
        where: { partId: stock.partId, isVoid: false },
        _sum: { qty: true },
      });
      const outAgg = await tx.trxMiOut.aggregate({
        where: { partId: stock.partId, isVoid: false },
        _sum: { qty: true },
      });
      const latestSt = await tx.trxStocktakingBal.findFirst({
        where: { partId: stock.partId },
        orderBy: { stockDate: "desc" },
      });
      const current =
        (latestSt?.qty ?? 0) + (inAgg._sum.qty ?? 0) - (outAgg._sum.qty ?? 0);
      if (qty > current) {
        throw new Error(`Qty melebihi stok! Stok: ${current}, Input: ${qty}`);
      }

      return tx.trxMiOut.create({
        data: {
          partId: stock.partId,
          trxAt: new Date(),
          qty,
          stockSnapshot: current,
          lineId: stock.lineId,
          picUserId: pic?.id ?? user.id,
          createdBy: user.id,
        },
        include: { part: true, picUser: true, line: true },
      });
    });

    const newStock = await getStockByPartNo(partNo);
    return jsonOk({ row, stock: newStock }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
