import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "cs_ep1_token";

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret());
    const role = String(payload.role);
    const canAi = Boolean(payload.canAi);
    const canSmt = Boolean(payload.canSmt);
    const canMi = Boolean(payload.canMi);

    if (pathname.startsWith("/admin") && role !== "ADMIN" && role !== "LEADER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/dashboard") && role !== "ADMIN" && role !== "LEADER") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/trx/ai") && !(canAi || role === "ADMIN" || role === "LEADER")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/trx/smt") && !(canSmt || role === "ADMIN" || role === "LEADER")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (pathname.startsWith("/trx/mi") && !(canMi || role === "ADMIN" || role === "LEADER")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
