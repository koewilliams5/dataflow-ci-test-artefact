import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Instance Auth.js "edge-safe" dédiée au middleware — voir auth.config.ts pour
// pourquoi elle n'inclut pas le provider Credentials (bcrypt/Prisma).
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sources/:path*",
    "/ingestions/:path*",
    "/api/sources/:path*",
    "/api/ingestions/:path*",
  ],
};
