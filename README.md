# PaisaPOS

Next.js 16 + Supabase POS billing and inventory sync for beta store pilots.

## Getting Started

Install dependencies, configure `.env.local` from `.env.example`, then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Public Beta Release Gate

Before approving a public beta build, run:

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm audit --audit-level=high

supabase migration list --linked
supabase db push --dry-run
supabase db lint --linked --fail-on error
```

Some Supabase CLI versions require `SUPABASE_DB_PASSWORD` for linked database lint or dry-run checks. Keep that value local to the release operator; it is not a browser/runtime env var.

If the installed Supabase CLI supports advisors, also run:

```bash
supabase db advisors --linked
```

Acceptance criteria:

- All npm gates pass.
- E2E passes locally and against the deployed beta URL.
- No unexpected pending Supabase migrations.
- No Supabase lint/advisor error-level findings.
- `/api/health` returns `200` in the deployed environment.
- Security headers are present in the deployed environment.
- No tracked cookies, auth state, secrets, or generated logs.

## Deployed E2E

Run browser tests against a Vercel preview or beta deployment without starting a local dev server:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://your-preview-or-beta-url.example"
npm run test:e2e
```

## Supabase Beta Checklist

- Apply all committed migrations to the linked beta project.
- Confirm Supabase Auth redirect URLs include `${APP_URL}/auth/callback`.
- Confirm the beta onboarding policy intentionally allows or requires email confirmation.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Keep Upstash Redis configured for production rate limiting with `RATE_LIMIT_FAIL_CLOSED=true`.
