# OOTD Studio

**Tomorrow, dress like yourself.**

OOTD Studio is a mobile-first personal AI stylist. It first learns your body measurements and your real wardrobe, then composes several outfits for tomorrow's occasion, weather, and any must-wear item — using only the clothes you actually own — and generates a try-on image of you with Google Gemini. Swipe left and right to pick a look, mark any piece as "unavailable" or "wear next time" at any moment, and regenerate.

This is not a shopping feed and not a random outfit collage. The core constraint of OOTD Studio is: **start from your wardrobe only**. When the wardrobe cannot support the occasion, the app says so explicitly and gives concrete shopping suggestions.

---

## Features

| Capability | Implementation |
| --- | --- |
| Accounts | Email sign-up / sign-in, Argon2 password hashing, JWT, login rate limiting, password change, permanent account deletion |
| Body profile | Height, weight, chest / waist / hips, inseam, shoe size, body shape, skin tone tendency, fit preference, style preferences, colors to avoid |
| Base photo | A full-body photo is required after sign-up as the AI try-on reference; access requires authentication |
| Personal wardrobe | Photograph items, category, color, material, formality, warmth, season, style tags, favorites, notes |
| AI wardrobe assistant | Automatically recognizes category, color, material, formality, warmth, and style tags from an item photo |
| Weather | Tomorrow's forecast from Open-Meteo; by city or browser location, also manually adjustable |
| Multiple looks | 3 clearly distinct complete outfits per generation; each with title, rationale, styling notes, fit score, and per-item breakdown |
| Must-wear items | Set from the wardrobe or results page; forced into subsequent recommendations, with a notice when they conflict |
| Availability toggle | Flip any item between "wearable / unavailable" on the results page, then re-recommend; covers laundry, lending, and season changes |
| AI try-on | Gemini multi-image composition: preserves your face, body, and skin tone and dresses your real items on you |
| Background choice | Clean studio, or a custom-prompt scene; after generation you can also change the background for a single look |
| Swipe | Native scroll-snap gestures for smooth switching between looks on mobile |
| Suitability warnings | Extreme weather, outdoor thunderstorms, high heat at formal events, must-wear conflicts, wardrobe gaps, all surfaced clearly with a one-tap regenerate |
| Shopping suggestions | When the wardrobe lacks a key category or enough formality, gives the specific gap, reason, priority, and a shopping search link |
| History | Every occasion, weather, and look is kept; browse back and delete |
| PWA | Installable to the home screen, offline shell caching, full-screen mobile experience |

---

## Tech stack

- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2, SQLite, Pydantic v2, PyJWT, Argon2, Pillow, `google-genai`
- **Frontend**: React 19, TypeScript, Vite 8, React Router 7, TanStack Query 5, Lucide, in-house **OUL UI**
- **AI**: Google Gemini
  - Text planning: `gemini-3.8-flash`
  - Image composition: `gemini-3.1-flash-image`
- **Weather**: Open-Meteo (free, no API key)

> **About `oul-ui`**: at delivery time there is no installable `oul-ui` package on npm, PyPI, or GitHub (npm returns 404). This repository therefore implements OUL UI as a standalone workspace package: `frontend/packages/oul-ui`, with the package name `oul-ui`, consumed by the app via `import { Button } from 'oul-ui'` and `import 'oul-ui/oul.css'`. It is not a disguised third-party library — it is a mobile design system with its own `package.json` and README that can be built and published independently. If you meant a private `oul-ui` package, just replace `file:./packages/oul-ui` in `package.json` with that package.

---

## Project structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/          # auth / users / wardrobe / recommendations / weather / media
│   │   │   └── serializers.py   # signed media URLs and response assembly
│   │   ├── core/                # config, JWT, passwords, dependencies
│   │   ├── db/                  # SQLAlchemy models and session
│   │   ├── schemas/             # Pydantic contracts
│   │   ├── services/
│   │   │   ├── gemini.py        # Gemini text planning / item recognition / multi-image try-on
│   │   │   ├── stylist.py       # deterministic styling planner (fallback when Gemini is unavailable)
│   │   │   ├── recommendation_service.py
│   │   │   ├── renderer.py      # AI try-on + local scene preview
│   │   │   ├── local_scene.py   # prompt-driven background composition
│   │   │   ├── storage.py       # image validation, compression, private media, thumbnails
│   │   │   └── weather.py       # Open-Meteo
│   │   ├── prompts/             # styling system prompts
│   │   ├── assets/
│   │   │   └── fonts/           # preview board fonts and OFL license
│   │   └── main.py              # FastAPI entry, CORS, security headers, SPA hosting
│   ├── tests/                   # 20 API / styling / AI path tests
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── packages/oul-ui/         # standalone workspace UI package (package name oul-ui)
│   │   ├── src/                 # Button / Field / Sheet / Switch / CSS
│   │   ├── package.json
│   │   └── README.md
│   ├── public/                  # PWA manifest, icons, service worker
│   ├── src/
│   │   ├── app/                 # providers and routing
│   │   ├── components/          # brand, bottom nav, image upload, weather, etc.
│   │   ├── pages/               # welcome / auth / onboarding / home / wardrobe / looks / results / profile
│   │   ├── lib/                 # API client, React Query hooks, types, utilities
│   │   └── styles/              # design tokens and product styles
│   ├── package.json
│   └── vite.config.ts
├── Makefile
├── pyproject.toml
└── .env.example
```

---

## Getting started

### 1. Requirements

- Python 3.13+
- Node.js 22+
- Optional: a Gemini API key from Google AI Studio

### 2. Install

```bash
make install
cp .env.example .env

# generate a local SECRET_KEY
python - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
# put the output into SECRET_KEY in .env

# optional: enable full AI styling and try-on
# GEMINI_API_KEY=your-google-ai-studio-key
```

### 3. Development mode

Terminal one:

```bash
make dev-backend
# http://127.0.0.1:8000
# API docs: http://127.0.0.1:8000/api/docs
```

Terminal two:

```bash
make dev-frontend
# http://localhost:5173
```

Vite proxies `/api` to `127.0.0.1:8000`.

### 4. Single-process production preview

```bash
make build
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Open `http://127.0.0.1:8000`. FastAPI serves the built frontend directly.

---

## Gemini configuration and fallback

`.env`:

```dotenv
GEMINI_API_KEY=...
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
ENABLE_AI_IMAGES=true
```

**The app remains fully usable without an API key**:

- Styling is handled by the deterministic "Atelier" planner in `services/stylist.py`. It accounts for weather, formality, warmth, season, color, body proportions, must-wear items, and unavailable items.
- "AI try-on" degrades to a lookboard preview: your base photo is framed into a scene synthesized on the fly from the background prompt; for a "clean studio" background, a real blank studio is produced. Real items and editorial type are then layered on top. The UI labels it "look preview" and never pretends it is an AI try-on.
- With a key configured, the same flow calls Gemini for richer item selection copy and generates a real try-on image; if the Gemini call fails it still falls back automatically and never blocks the product.

The try-on prompt explicitly requires: preserve the user's face, hair color, skin tone, and body proportions without changing identity; show the full look head to toe; add no text, watermarks, or other people. Custom backgrounds are passed to the image model together with the person-preservation instructions.

> A real Google call requires a valid `GEMINI_API_KEY`. The current delivery environment has no such credential, so real Gemini output cannot be produced here; the request path is covered by SDK + HTTP mock tests and goes live once a key is supplied. Without a key, background prompts are still honored: local scene composition genuinely applies them.

---

## Data and privacy

- Accounts, wardrobes, recommendations, and looks are stored in local SQLite: `data/oul.db`
- Images are stored under `data/uploads/<user-id>/...`, isolated per user
- All garments, full-body photos, and generated images are accessed through `/api/media/...?token=...` and require a signed-in JWT; cross-user reads return `403`
- Uploads are validated for MIME type, size (12 MB default), and pixel count, stripped of EXIF, then compressed; JPEG / PNG / WebP / HEIC are supported
- The login endpoint has a failure cap within a 10-minute window
- Users can permanently delete their account, wardrobe, recommendations, all photos, and upload directory from "Profile → Account & privacy → Delete account" after entering their password
- In production you must:
  - Use HTTPS
  - Replace `SECRET_KEY`
  - Restrict `ALLOWED_ORIGINS`
  - Add CSP, rate limiting, and backups at the reverse proxy

The terms of service and privacy notice are sample product copy and need legal review before a real launch.

---

## Main API

All business endpoints live under `/api`; everything except register / login / weather requires `Authorization: Bearer <token>`.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Current session |
| GET/PATCH | `/users/me` | Read / update body profile |
| POST | `/users/me/base-photo` | Upload the full-body base photo |
| POST | `/users/me/complete-onboarding` | Validate and finish onboarding |
| POST | `/users/me/password` | Change password |
| DELETE | `/users/me` | Permanently delete account and photos |
| GET/POST | `/wardrobe` | Wardrobe list / upload an item |
| GET/PATCH/DELETE | `/wardrobe/{id}` | Item detail / edit / delete |
| POST | `/wardrobe/analyze` | AI recognition of an item photo |
| PATCH | `/wardrobe/{id}/availability` | Wearable / unavailable |
| PATCH | `/wardrobe/{id}/force` | Wear next time |
| PATCH | `/wardrobe/{id}/favorite` | Favorite |
| GET | `/weather/tomorrow` | Tomorrow's weather |
| GET | `/weather/geocode` | City search |
| POST | `/recommendations` | Generate multiple looks |
| GET | `/recommendations/{id}` | Poll look and image status |
| POST | `/recommendations/{id}/reroll` | Re-recommend after wardrobe changes |
| GET | `/media/{path}` | Private image (token required) |

`POST /recommendations` immediately returns a record with `status: "planning"`: item selection and image generation run in an in-process background thread and are not bound to the HTTP request lifecycle. You can therefore jump to the wardrobe or home page right after generating; generation continues, and the frontend notifies you on any page when it finishes. The frontend polls every 2.2 seconds (and keeps polling when you leave the page), and startup recovery re-queues unfinished jobs after a process restart.

---

## Tests and checks

```bash
make test
make typecheck
```

Test coverage:

- Registration / login / onboarding validation
- Wardrobe CRUD, favorites, must-wear, availability
- Full recommendation flow, forced items, re-recommendation
- Private media auth and cross-user isolation
- Background image generation, background re-render
- Gap shopping suggestions, occasion / weather warnings
- Gemini happy path and failure fallback
- **The real HTTP request/response path of the Gemini SDK** (httpx MockTransport, no live key needed): multi-image inlineData, 3:4 imageConfig, inline image parsing in responses
- Local person-scene composition: different background prompts produce visibly different results, and lookboard rendering also changes with the prompt
- Account deletion and media cleanup
- Deterministic styling planner: completeness, warmth, rain, conflicts, and diversity

Current result: **20 passed**.

---

## Design notes

OUL UI uses the visual language of an editorial fashion archive: warm parchment ground, charcoal ink, acid lime as the action color, tomato orange as the emotional accent; Instrument Serif for English editorial typography, with Manrope and system Chinese fonts carrying information density. Mobile width is capped at 520px, and desktop is presented in a standalone app frame.

Main screens:

- Welcome / register / sign in
- Four-step onboarding: body basics → proportions → style → full-body photo and weather
- Home: weather, tomorrow's look entry, wardrobe at a glance, recent looks
- Wardrobe: search, category filters, favorites, must-wear, availability
- Item editor: photo, AI recognition, formality / warmth, season / style tags
- Look form: occasion description, day type, weather, background, must-wear list
- Results: swipe, try-on image, background change, item status, warnings, shopping suggestions, re-recommend
- Profile: body profile, wardrobe status, privacy, password, sign out and delete account

---

## Production boundaries

This implementation is a runnable, complete product, but deploying it to a real, multi-user, high-concurrency environment still needs:

1. **Database**: SQLite suits single-node and local deployment. To move to PostgreSQL, change `DATABASE_URL` and introduce Alembic for migrations.
2. **Task queue**: image generation currently uses in-process daemon threads (single process, unfinished jobs recovered at startup). For multi-replica deployment, switch to Celery / RQ / Cloud Tasks and store images in object storage (S3 / R2) with a CDN.
3. **Auth**: currently a 7-day JWT in localStorage. For higher security, move to an HttpOnly refresh cookie plus a short-lived access token.
4. **Image privacy**: media URLs carry the access token in the query string (only for `<img>`). For stricter auditing, switch to short-lived signed URLs or a cookie-based media session.
5. **Observability**: add Sentry / OpenTelemetry, structured logs, and metrics.
6. **Content safety**: add stricter image and text moderation on top of Gemini, plus retries, quotas, and cost monitoring.

---

## License

The project code is provided by this implementation. The font files (Manrope, Instrument Serif) are under the SIL Open Font License; the license is at `backend/app/assets/fonts/OFL.txt`. Sample QA images are not included in the repository.
