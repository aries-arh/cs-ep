import { prisma } from "./prisma";

export type StockRow = {
  partId: number;
  partNo: string;
  partName: string;
  lineCode: string | null;
  lineId: number | null;
  qtyStocktaking: number;
  sumIn: number;
  sumOut: number;
  totalStock: number;
};

/** Total_Stock = stocktaking + SUM(IN) - SUM(OUT) — setara vw_stock_mi */
export async function getStockByPartNo(partNo: string): Promise<StockRow | null> {
  const part = await prisma.mstPart.findUnique({
    where: { partNo: partNo.trim() },
    include: { line: true },
  });
  if (!part || !part.isActive) return null;

  const latestSt = await prisma.trxStocktakingBal.findFirst({
    where: { partId: part.id },
    orderBy: { stockDate: "desc" },
  });

  const inAgg = await prisma.trxMiIn.aggregate({
    where: { partId: part.id, isVoid: false },
    _sum: { qty: true },
  });
  const outAgg = await prisma.trxMiOut.aggregate({
    where: { partId: part.id, isVoid: false },
    _sum: { qty: true },
  });

  const qtyStocktaking = latestSt?.qty ?? 0;
  const sumIn = inAgg._sum.qty ?? 0;
  const sumOut = outAgg._sum.qty ?? 0;

  return {
    partId: part.id,
    partNo: part.partNo,
    partName: part.partName,
    lineCode: part.line?.code ?? null,
    lineId: part.lineId,
    qtyStocktaking,
    sumIn,
    sumOut,
    totalStock: qtyStocktaking + sumIn - sumOut,
  };
}

export async function listStock(opts?: {
  lineCode?: string | null;
  threshold?: number;
}): Promise<StockRow[]> {
  const parts = await prisma.mstPart.findMany({
    where: {
      isActive: true,
      ...(opts?.lineCode
        ? { line: { code: opts.lineCode } }
        : {}),
    },
    include: { line: true },
    orderBy: { partNo: "asc" },
  });

  const rows: StockRow[] = [];
  for (const part of parts) {
    const stock = await getStockByPartNo(part.partNo);
    if (stock) rows.push(stock);
  }
  return rows;
}

export function stockStatus(total: number, threshold: number) {
  if (total < 0) return "NEGATIVE" as const;
  if (total <= threshold) return "LOW" as const;
  return "OK" as const;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
