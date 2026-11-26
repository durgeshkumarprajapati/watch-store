import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { getServerEnv, hasDatabaseUrl } from "@/config/env";
import { getPrisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/validations/auth";
import { linkVerifiedUserToCustomerInTx } from "./customer-link-service";
import { verifyPassword } from "./password-service";

const env = getServerEnv();

const providers = [
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: false,
        }),
      ]
    : []),
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      if (!hasDatabaseUrl()) return null;
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;
      const limit = checkRateLimit(`login:${email}`, 10, 15 * 60 * 1000);
      if (!limit.allowed) return null;

      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash || !user.emailVerified) {
        return null;
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        sessionVersion: user.sessionVersion,
      };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  ...(hasDatabaseUrl() ? { adapter: PrismaAdapter(getPrisma()) } : {}),
  secret: env.AUTH_SECRET ?? (process.env.NODE_ENV !== "production" ? "dev-insecure-auth-secret-change-me" : undefined),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const googleEmailVerified =
          typeof profile?.email_verified === "boolean" ? profile.email_verified : false;
        if (!googleEmailVerified || !user.email) {
          return false;
        }
        const prisma = getPrisma();
        const normalizedEmail = user.email.trim().toLowerCase();
        const existingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { accounts: true },
        });

        // Do not link an unverified existing password account solely by email.
        if (
          existingUser &&
          !existingUser.emailVerified &&
          !existingUser.accounts.some((a) => a.provider === "google")
        ) {
          return false;
        }

        if (existingUser) {
          await prisma.$transaction((tx) =>
            linkVerifiedUserToCustomerInTx(tx, {
              userId: existingUser.id,
              verifiedEmail: normalizedEmail,
              fullName: existingUser.name ?? user.name,
            }),
          );
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.sessionVersion =
          "sessionVersion" in user && typeof user.sessionVersion === "number"
            ? user.sessionVersion
            : 1;
      }

      // Validate sessionVersion against DB so password resets invalidate active sessions.
      if (typeof token.userId === "string" && hasDatabaseUrl()) {
        const dbUser = await getPrisma().user.findUnique({
          where: { id: token.userId },
          select: { sessionVersion: true, emailVerified: true },
        });
        if (!dbUser || !dbUser.emailVerified || dbUser.sessionVersion !== token.sessionVersion) {
          return { ...token, invalidated: true };
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalidated || typeof token.userId !== "string") {
        return { ...session, user: undefined as unknown as typeof session.user };
      }
      if (session.user) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id && user.email && hasDatabaseUrl()) {
        await getPrisma().$transaction((tx) =>
          linkVerifiedUserToCustomerInTx(tx, {
            userId: user.id!,
            verifiedEmail: user.email!,
            fullName: user.name,
          }),
        );
      }
    },
  },
});
