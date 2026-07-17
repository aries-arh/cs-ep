import { prisma } from "@/lib/prisma";
import {
  createToken,
  homeFor,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  verifyPassword,
} from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const nik = String(body.nik || "").trim();
    const password = String(body.password || "");
    if (!nik || !password) return jsonError("NIK dan password wajib");

    const user = await prisma.mstUser.findUnique({ where: { nik } });
    if (!user || !user.isActive) return jsonError("NIK atau password salah", 401);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return jsonError("NIK atau password salah", 401);

    const session = {
      id: user.id,
      nik: user.nik,
      name: user.name,
      role: user.role as "OPERATOR" | "LEADER" | "ADMIN",
      canAi: user.canAi,
      canSmt: user.canSmt,
      canMi: user.canMi,
    };
    const token = await createToken(session);
    await setSessionCookie(token);
    return jsonOk({ user: session, home: homeFor(session) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE() {
  try {
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return jsonError("Unauthorized", 401);
    return jsonOk({ user, home: homeFor(user) });
  } catch (e) {
    return handleApiError(e);
  }
}
