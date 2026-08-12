import type { NextAuthConfig } from "next-auth";
import { isProtectedPath } from "./lib/auth/protectedPaths";

/**
 * Config Auth.js "edge-safe" : pas de provider (donc pas de bcrypt/Prisma) ici,
 * pour pouvoir être importée par le middleware, qui tourne dans le runtime Edge
 * et ne supporte pas les APIs Node utilisées par la couche base de données.
 * auth.ts complète cette config avec le provider Credentials pour les Route
 * Handlers (qui, eux, tournent en runtime Node).
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      if (!isProtectedPath(request.nextUrl.pathname)) {
        return true;
      }
      return Boolean(auth?.user);
    },
  },
  providers: [],
} satisfies NextAuthConfig;
