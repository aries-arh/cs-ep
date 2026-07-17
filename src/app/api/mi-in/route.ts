import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { endOfDay, getStockByPartNo, startOfDay } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") || undefined;
    const date = searchParams.get("date");
    const partNo = searchParams.get("partNo")?.trim();
    const last = searchParams.get("last");

    if (last && source) {
      const row = await prisma.trxMiIn.findFirst({
        where: { source, isVoid: false },
        orderBy: { id: "desc" },
        include: { part: true, picUser: true },
      });
      return jsonOk(row);
    }

    const where: Record<string, unknown> = { isVoid: false };
    if (source) where.source = source;
    if (date) {
      const d = new Date(date);
      where.trxAt = { gte: startOfDay(d), lte: endOfDay(d) };
    }
    if (partNo) where.part = { partNo: { contains: partNo } };

    const rows = await prisma.trxMiIn.findMany({
      where,
      include: { part: true, picUser: true },
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
    const body = await req.json();
    const source = String(body.source || "").toUpperCase();
    if (source !== "AI" && source !== "SMT") return jsonError("source harus AI atau SMT");

    if (source === "AI" && !user.canAi && user.role === "OPERATOR") {
      return jsonError("Tidak punya akses AI", 403);
    }
    if (source === "SMT" && !user.canSmt && user.role === "OPERATOR") {
      return jsonError("Tidak punya akses SMT", 403);
    }

    const noSlip = String(body.noSlip || "").trim();
    const partNo = String(body.partNo || "").trim();
    const qty = Number(body.qty);
    const toLocation = String(body.toLocation || "WC02").trim() || "WC02";
    const catatan = body.catatan ? String(body.catatan) : null;
    const picNik = body.picNik ? String(body.picNik).trim() : user.nik;

    if (!noSlip) return jsonError("No Slip wajib diisi");
    if (!partNo) return jsonError("Part No wajib diisi");
    if (!Number.isFinite(qty) || qty <= 0) return jsonError("Qty SLIP harus angka > 0");
    if (!toLocation) return jsonError("To Loc wajib dipilih");

    const dup = await prisma.trxMiIn.findUnique({
      where: { uk_source_slip: { source, noSlip } },
    });
    if (dup && !dup.isVoid) return jsonError(`No Slip sudah pernah diinput: ${noSlip}`, 409);

    const part = await prisma.mstPart.findUnique({ where: { partNo } });
    if (!part || !part.isActive) return jsonError("Part No tidak terdaftar", 404);

    const pic = await prisma.mstUser.findUnique({ where: { nik: picNik } });

    const row = await prisma.trxMiIn.create({
      data: {
        source,
        noSlip,
        partId: part.id,
        trxAt: new Date(),
        qty,
        toLocation,
        catatan,
        picUserId: pic?.id ?? user.id,
        createdBy: user.id,
      },
      include: { part: true, picUser: true },
    });

    const stock = await getStockByPartNo(partNo);
    return jsonOk({ row, stock }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
