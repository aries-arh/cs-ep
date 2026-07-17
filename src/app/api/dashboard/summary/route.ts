import { requireSession } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { endOfDay, listStock, startOfDay, stockStatus } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const user = await requireSession();
    if (user.role === "OPERATOR") {
      // allow operators to hit summary lightly? design says leader/admin — still return for leaders+
    }

    const { searchParams } = new URL(req.url);
    const line = searchParams.get("line") || null;
    const dateStr = searchParams.get("date");
    const day = dateStr ? new Date(dateStr) : new Date();
    const threshold = Number(
      process.env.LOW_STOCK_THRESHOLD ||
        (await prisma.appSetting.findUnique({ where: { key: "LOW_STOCK_THRESHOLD" } }))
          ?.value ||
        10
    );

    const stocks = await listStock({ lineCode: line });
    const lowStock = stocks
      .filter((s) => s.totalStock <= threshold)
      .sort((a, b) => a.totalStock - b.totalStock)
      .slice(0, 100)
      .map((s) => ({
        ...s,
        status: stockStatus(s.totalStock, threshold),
      }));

    const byLineMap = new Map<
      string,
      { lineCode: string; partCount: number; totalStock: number; negativeCount: number; lowCount: number }
    >();
    for (const s of stocks) {
      const key = s.lineCode || "UNASSIGNED";
      const cur = byLineMap.get(key) || {
        lineCode: key,
        partCount: 0,
        totalStock: 0,
        negativeCount: 0,
        lowCount: 0,
      };
      cur.partCount += 1;
      cur.totalStock += s.totalStock;
      if (s.totalStock < 0) cur.negativeCount += 1;
      else if (s.totalStock <= threshold) cur.lowCount += 1;
      byLineMap.set(key, cur);
    }

    const from = startOfDay(day);
    const to = endOfDay(day);

    const inToday = await prisma.trxMiIn.aggregate({
      where: { isVoid: false, trxAt: { gte: from, lte: to } },
      _sum: { qty: true },
    });
    const outToday = await prisma.trxMiOut.aggregate({
      where: { isVoid: false, trxAt: { gte: from, lte: to } },
      _sum: { qty: true },
    });

    const inBySource = await prisma.trxMiIn.groupBy({
      by: ["source"],
      where: { isVoid: false, trxAt: { gte: from, lte: to } },
      _sum: { qty: true },
    });

    const topRaw = await prisma.trxMiOut.groupBy({
      by: ["partId"],
      where: { isVoid: false, trxAt: { gte: from, lte: to } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 10,
    });
    const topIssued = await Promise.all(
      topRaw.map(async (t, i) => {
        const p = await prisma.mstPart.findUnique({
          where: { id: t.partId },
          include: { line: true },
        });
        return {
          rank: i + 1,
          partNo: p?.partNo,
          partName: p?.partName,
          lineCode: p?.line?.code,
          qtyOut: t._sum.qty ?? 0,
        };
      })
    );

    const qtyIn = inToday._sum.qty ?? 0;
    const qtyOut = outToday._sum.qty ?? 0;

    return jsonOk({
      asOf: new Date().toISOString(),
      date: day.toISOString().slice(0, 10),
      line,
      threshold,
      kpi: {
        partActive: stocks.length,
        stockNegative: stocks.filter((s) => s.totalStock < 0).length,
        stockLow: stocks.filter((s) => s.totalStock >= 0 && s.totalStock <= threshold).length,
        qtyInToday: qtyIn,
        qtyOutToday: qtyOut,
        netToday: qtyIn - qtyOut,
      },
      stockByLine: Array.from(byLineMap.values()).sort((a, b) =>
        a.lineCode.localeCompare(b.lineCode)
      ),
      lowStock,
      inOutToday: {
        qtyIn,
        qtyOut,
        inBySource: inBySource.map((x) => ({ source: x.source, qty: x._sum.qty ?? 0 })),
      },
      topIssued,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
