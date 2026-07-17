import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type SessionUser = {
  id: number;
  nik: string;
  name: string;
  role: "OPERATOR" | "LEADER" | "ADMIN";
  canAi: boolean;
  canSmt: boolean;
  canMi: boolean;
};

const COOKIE = "cs_ep1_token";

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createToken(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: Number(payload.id),
      nik: String(payload.nik),
      name: String(payload.name),
      role: payload.role as SessionUser["role"],
      canAi: Boolean(payload.canAi),
      canSmt: Boolean(payload.canSmt),
      canMi: Boolean(payload.canMi),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError("Unauthorized", 401);
  const dbUser = await prisma.mstUser.findUnique({ where: { id: user.id } });
  if (!dbUser || !dbUser.isActive) throw new AuthError("Akun tidak aktif", 401);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function homeFor(user: SessionUser): string {
  if (user.role === "ADMIN") return "/admin";
  if (user.role === "LEADER") return "/dashboard";
  if (user.canMi) return "/trx/mi";
  if (user.canAi) return "/trx/ai";
  if (user.canSmt) return "/trx/smt";
  return "/login";
}

export function canOpen(path: string, user: SessionUser): boolean {
  if (path.startsWith("/admin")) {
    if (user.role === "ADMIN") return true;
    if (user.role === "LEADER" && path.startsWith("/admin/export")) return true;
    return false;
  }
  if (path.startsWith("/dashboard")) {
    return user.role === "LEADER" || user.role === "ADMIN";
  }
  if (path.startsWith("/trx/ai")) return user.canAi || user.role === "ADMIN" || user.role === "LEADER";
  if (path.startsWith("/trx/smt")) return user.canSmt || user.role === "ADMIN" || user.role === "LEADER";
  if (path.startsWith("/trx/mi")) return user.canMi || user.role === "ADMIN" || user.role === "LEADER";
  return true;
}
