# Unfinished work

Things that are built but not reachable, or verified but deliberately left alone.
Each entry says what exists, what is missing, and what finishing it would take.

---

## Password reset — built on both ends, wired on neither

A café owner who forgets their password currently has no way to recover it. The
backend endpoints and the frontend screens both exist and are written to talk to
each other; nothing connects them to the app.

**What already works**

| Piece | Where |
| --- | --- |
| `POST /api/auth/forgot-password` | `src/main/java/com/cafeqr/auth/AuthController.java:59` |
| `POST /api/auth/reset-password` | `src/main/java/com/cafeqr/auth/AuthController.java:66` |
| Token issue / consume, session revoke | `src/main/java/com/cafeqr/auth/AuthService.java:153` and `:176` |
| `password_reset_tokens` table | `src/main/resources/db/migration/V12__password_reset_tokens.sql` |
| Both endpoints rate-limited | `src/main/java/com/cafeqr/common/ratelimit/RateLimitFilter.java:20` |
| Request screen (posts the email) | `frontend-react/src/features/auth/ForgotPassword.tsx:28` |
| Reset screen (reads `?token=`, posts the new password) | `frontend-react/src/features/auth/ResetPassword.tsx:14` and `:36` |

**What is missing — three gaps**

1. **No email is ever sent.** `AuthService.forgotPassword()` publishes
   `PasswordResetRequestedEvent` (`AuthService.java:169`) and nothing listens for it.
   Grep for `@EventListener`: the only two consumers in the codebase are
   `OrderStreamService` and `QrActivityBroadcaster`. So a token is written to the
   database and the person who asked for it never learns what it is.

2. **Neither screen has a route.** `frontend-react/src/App.tsx` does not mount
   `ForgotPassword` or `ResetPassword`, so nothing imports either file and `/*` falls
   through to `Navigate to="/"`. `ResetPassword` expects its token as a query
   parameter, so the route it needs is a plain path such as `/reset-password`, reached
   as `/reset-password?token=…`.

3. **No way in from the login screen.** `Login.tsx` is rendered by
   `DashboardApp.tsx:128` when nobody is signed in, and it carries no
   "Forgot password?" affordance.

**To finish it**

- Add a `@TransactionalEventListener(phase = AFTER_COMMIT)` for
  `PasswordResetRequestedEvent` that emails a link built from
  `app.public-base-url` (`src/main/resources/application.yml:84`) plus the route
  chosen in step 2. After-commit matters — `AuthService.java:168` already notes that
  a rollback must never send a live reset link.
- Add the two routes to `App.tsx`, alongside the existing public `/join/:token`.
- Link to the request screen from `Login.tsx`.

Both screens are bilingual and styled already; nothing about them needs rewriting.

> Noted 2026-09-11, while removing the stock feature. These files first looked like
> dead code because nothing imports them — they are not. Do not delete them without
> deciding to drop password recovery.

---

## Verified but not acted on

**~~Two integration tests cannot run on this machine.~~ They can — pass the API version.**
`CafeQrFlowIntegrationTest` and `StaffPermissionsIntegrationTest` fail with
`Could not find a valid Docker environment` under a plain `mvn test`, because
docker-java negotiates an API version below what Docker 29 accepts as its minimum.
That is environmental, and it does not need a Testcontainers bump — it needs the
flag `.github/workflows/ci.yml` already documents:

    mvn test -DargLine="-Dapi.version=1.44"

Verified 2026-09-11: all 225 tests pass that way locally, the 54 in
`StaffPermissionsIntegrationTest` included. Deliberately not pinned in the pom —
CI's runner has an older Docker that negotiates fine, and hardcoding 1.44 would
break anyone on a Docker too old to speak it.

**57 CSS classes have no literal reference in the source.**
They are *not* confirmed dead — each one's prefix does appear in source, so most are
built by concatenation (`` `st-${status}` ``, `` `rcpt-${style}` ``, `` `r-${shape}` ``,
and the `look-*` / `profile-*` families). Static analysis cannot separate the live
ones from the stale ones here, and there is no frontend test coverage to catch a
mistake. Anyone pruning these should check the rendered screens rather than trust a
grep. The 10 that *were* provably dead — no name and no prefix anywhere in source —
have already been removed.
