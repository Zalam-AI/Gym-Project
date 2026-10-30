# Mobile App Architecture & Standalone Export

The GymOS Mobile App (`mobile-app/frontend`) is an independent client application for **gym members** and **trainers**. It contains zero code imports or workspace dependencies on `admin-staff-app` and communicates strictly over HTTPS REST endpoints using signed `mobile.` HMAC session tokens (`X-GymOS-Session`) and/or `HttpOnly` cookies.

## Standalone Export (Capacitor / Native WebView / Static Hosting)

1. Configure `NEXT_PUBLIC_API_BASE_URL` pointing to your deployed GymOS API server (no trailing slash):
   ```bash
   NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com npm run build:export
   ```
2. This produces a self-contained static bundle in `mobile-app/frontend/out/` that can be packaged directly with Capacitor (iOS / Android), Cordova, or deployed to any static CDN independently of the Staff Website.
3. Add your mobile app origin(s) (for example `https://m.yourdomain.com,capacitor://localhost,https://localhost`) to `GYMOS_MEMBER_APP_ORIGINS` on the API server.

## Mobile API Surface

- `POST /api/auth/member/login` — Member & trainer sign-in
- `POST /api/auth/member/register` — Member registration, front-desk profile claiming, & trainer invite-code activation
- `POST /api/auth/member/logout` — Mobile session sign-out
- `GET  /api/auth/trainer-code` — Trainer invite code verification
- `GET  /api/member-portal` — Authenticated member pass, coach, workout plan, & visit history
- `GET|POST /api/member-subscriptions` — QR gym discovery & plan subscription request workflow
- `GET|POST /api/trainer-portal` — Authenticated trainer roster, workout builder, sessions, & availability
- `POST /api/attendance` — Reception QR check-in validation for members & trainers
