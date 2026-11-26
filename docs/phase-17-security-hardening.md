# Phase 17 — Security Hardening & Limitations

## Implemented Hardening
- **HTTP Security Headers ([next.config.ts](file:///home/ppsd-021/watch-store/next.config.ts))**: `poweredByHeader: false`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Strict-Transport-Security` (`NODE_ENV === "production"` only).
- **Rate Limiter Limitation ([rate-limit.ts](file:///home/ppsd-021/watch-store/src/lib/rate-limit.ts))**: Uses an in-memory sliding-window `Map`. On serverless Vercel deployments, each function isolate has its own memory, so this provides per-isolate burst protection rather than globally consistent rate limiting across concurrent isolates.
- **Dependency Audit (`npm audit --omit=dev`)**: 4 high-severity advisories (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect <=3.22.0` ReDoS) originate solely from the `prisma@6.19.3` CLI `devDependency` (not `@prisma/client` runtime) and require a breaking major upgrade to `prisma@7.10.1`. Zero runtime exposure in Next.js serverless routes.
