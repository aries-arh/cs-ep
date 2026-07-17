import { requireSession } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN" && user.role !== "LEADER") {
      return jsonError("Forbidden", 403);
    }
    const [parts, lines, locations, users, partCount] = await Promise.all([
      prisma.mstPart.findMany({
        include: { line: true },
        orderBy: { partNo: "asc" },
        take: 500,
      }),
      prisma.mstLine.findMany({ orderBy: { code: "asc" } }),
      prisma.mstLocation.findMany({ orderBy: { code: "asc" } }),
      user.role === "ADMIN"
        ? prisma.mstUser.findMany({ orderBy: { nik: "asc" } })
        : Promise.resolve([]),
      prisma.mstPart.count({ where: { isActive: true } }),
    ]);
    return jsonOk({ parts, lines, locations, users, partCount });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    if (user.role !== "ADMIN") return jsonError("Forbidden", 403);
    const body = await req.json();
    const action = body.action as string;

    if (action === "upsertPart") {
      const partNo = String(body.partNo || "").trim();
      const partName = String(body.partName || "").trim();
      const lineCode = body.lineCode ? String(body.lineCode) : null;
      if (!partNo || !partName) return jsonError("Part No & Name wajib");
      let lineId: number | null = null;
      if (lineCode) {
        const line = await prisma.mstLine.findUnique({ where: { code: lineCode } });
        lineId = line?.id ?? null;
      }
      const part = await prisma.mstPart.upsert({
        where: { partNo },
        update: { partName, lineId, isActive: true },
        create: { partNo, partName, lineId },
      });
      return jsonOk(part);
    }

    if (action === "upsertUser") {
      const nik = String(body.nik || "").trim();
      const name = String(body.name || "").trim();
      const role = String(body.role || "OPERATOR");
      const password = body.password ? String(body.password).trim() : "";
      if (!nik || !name) return jsonError("NIK & Nama wajib");
      if (!["OPERATOR", "LEADER", "ADMIN"].includes(role)) {
        return jsonError("Role tidak valid");
      }

      const existing = await prisma.mstUser.findUnique({ where: { nik } });
      if (!existing && !password) {
        return jsonError("Password wajib untuk user baru");
      }

      const data = {
        name,
        role,
        canAi: Boolean(body.canAi),
        canSmt: Boolean(body.canSmt),
        canMi: Boolean(body.canMi),
        isActive: body.isActive !== false,
      };

      const row = existing
        ? await prisma.mstUser.update({
            where: { nik },
            data: {
              ...data,
              ...(password ? { passwordHash: await hashPassword(password) } : {}),
            },
          })
        : await prisma.mstUser.create({
            data: {
              nik,
              ...data,
              passwordHash: await hashPassword(password),
            },
          });

      return jsonOk({
        id: row.id,
        nik: row.nik,
        name: row.name,
        role: row.role,
        canAi: row.canAi,
        canSmt: row.canSmt,
        canMi: row.canMi,
        isActive: row.isActive,
      });
    }

    if (action === "deleteUser") {
      const nik = String(body.nik || "").trim();
      if (!nik) return jsonError("NIK wajib");
      if (nik === user.nik) return jsonError("Tidak bisa menonaktifkan akun sendiri");
      const row = await prisma.mstUser.update({
        where: { nik },
        data: { isActive: false },
      });
      return jsonOk({ nik: row.nik, isActive: row.isActive });
    }

    if (action === "activateUser") {
      const nik = String(body.nik || "").trim();
      if (!nik) return jsonError("NIK wajib");
      const row = await prisma.mstUser.update({
        where: { nik },
        data: { isActive: true },
      });
      return jsonOk({ nik: row.nik, isActive: row.isActive });
    }

    if (action === "setStocktaking") {
      const partNo = String(body.partNo || "").trim();
      const qty = Number(body.qty);
      const part = await prisma.mstPart.findUnique({ where: { partNo } });
      if (!part) return jsonError("Part tidak ditemukan", 404);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const row = await prisma.trxStocktakingBal.upsert({
        where: { uk_part_date: { partId: part.id, stockDate: today } },
        update: { qty },
        create: { partId: part.id, stockDate: today, qty, sourceFile: "admin-ui" },
      });
      return jsonOk(row);
    }

    return jsonError("Unknown action");
  } catch (e) {
    return handleApiError(e);
  }
}
