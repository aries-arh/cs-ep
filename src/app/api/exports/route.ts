import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { endOfDay, startOfDay } from "@/lib/stock";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN" && user.role !== "LEADER") {
      return jsonError("Forbidden", 403);
    }
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "mi-out";
    const source = searchParams.get("source");
    const from = searchParams.get("from")
      ? startOfDay(new Date(searchParams.get("from")!))
      : startOfDay(new Date());
    const to = searchParams.get("to")
      ? endOfDay(new Date(searchParams.get("to")!))
      : endOfDay(new Date());

    if (type === "mi-in") {
      const rows = await prisma.trxMiIn.findMany({
        where: {
          isVoid: false,
          trxAt: { gte: from, lte: to },
          ...(source ? { source } : {}),
        },
        include: { part: true, picUser: true },
        orderBy: { trxAt: "asc" },
      });
      const header = "No Slip,Part No,Part Name,Slip Qty,To Location,PIC,Catatan,Timestamp\n";
      const body = rows
        .map((r) =>
          [
            r.noSlip,
            r.part.partNo,
            `"${r.part.partName.replace(/"/g, '""')}"`,
            r.qty,
            r.toLocation,
            r.picUser?.name || "",
            r.catatan || "",
            r.trxAt.toISOString(),
          ].join(",")
        )
        .join("\n");
      return new Response(header + body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Data-${source || "IN"}-export.csv"`,
        },
      });
    }

    const rows = await prisma.trxMiOut.findMany({
      where: { isVoid: false, trxAt: { gte: from, lte: to } },
      include: { part: true, picUser: true, line: true },
      orderBy: { trxAt: "asc" },
    });
    const header = "Timestamp,Part No,Part Name,Stok WIP,Qty Out,Line,PIC\n";
    const body = rows
      .map((r) =>
        [
          r.trxAt.toISOString(),
          r.part.partNo,
          `"${r.part.partName.replace(/"/g, '""')}"`,
          r.stockSnapshot ?? "",
          r.qty,
          r.line?.code || "",
          r.picUser?.name || "",
        ].join(",")
      )
      .join("\n");
    return new Response(header + body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Data-MI-export.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
