# AdVault

Provenance-driven AI advertising asset pipeline for the [Backblaze Generative AI Media Hackathon](https://backblaze-generative-media.devpost.com/).

Generate brand-safe ad packs (image, video, voiceover, final MP4), store them on **Backblaze B2**, and verify every asset with **Genblaze** manifests.

Reference implementation: [genblaze-gen-media-multi-provider-sample](https://github.com/backblaze-labs/genblaze-gen-media-multi-provider-sample).

---

## Overview

AdVault turns a product brief into campaign assets through Genblaze-orchestrated pipelines. Each run persists media and metadata to B2, records provenance (prompts, providers, models, SHA-256 hashes, remix lineage), and supports integrity verification before assets are approved into a dedicated B2 prefix.

---

## Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Backend  | Python 3.12, FastAPI, SQLAlchemy (SQLite), Genblaze SDK |
| Frontend | React, Vite, TypeScript, Ant Design                     |
| Storage  | Backblaze B2 via `ObjectStorageSink` + presigned URLs   |
| Compose  | FFmpeg (`FFmpegCompositor` / local mux provider)        |
| Deploy   | Docker Compose (backend + nginx frontend)               |

---

## Features

| Mode         | Pipeline                                                      | Output                    |
| ------------ | ------------------------------------------------------------- | ------------------------- |
| **Quick**    | Image generation → B2 + manifest                              | Hero image                |
| **Full Ad**  | Image → video → voiceover → [music] → FFmpeg compose          | Final MP4                 |
| **Storyboard** | Multi-scene image plan → edit/regenerate → finalize to video | Scene gallery + final MP4 |
| **Remix**    | Re-run with `parent_run_id` lineage                           | New assets linked to prior run |

- Brand logo upload to B2 with Genblaze `external_inputs`
- Asset gallery with presigned preview, download, approve, delete
- Provenance viewer with SHA-256 integrity verify
- Live run step polling in the UI
- Demo mode (`DEMO_MODE=true`) — synthetic assets without provider API calls

---

## AI providers & models

| Slot     | Vendors (auto-pick order)                              | Example models                                      |
| -------- | ------------------------------------------------------ | --------------------------------------------------- |
| Image    | NVIDIA NIM, Decart, Replicate                          | `black-forest-labs/flux.1-schnell`, `lucy-image-2`  |
| Video    | Local (Ken Burns), Decart, NVIDIA, Replicate, GMI Cloud | `kenburns`, `nvidia/cosmos-2.0-diffusion-video2world` |
| TTS      | Edge TTS, ElevenLabs, LMNT, NVIDIA                     | `en-US-JennyNeural`, `eleven_multilingual_v2`       |
| Music    | Replicate, GMI Cloud (optional)                        | `meta/musicgen`                                     |
| Compose  | Local FFmpeg mux                                       | Muxes video + voice (+ optional music)              |

Vendor pins: `IMAGE_VENDOR`, `VIDEO_VENDOR`, `TTS_VENDOR`, `MUSIC_VENDOR`. Empty values use free-first auto-selection.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React Router SPA · Vite · TypeScript · Ant Design 6         │
│  Overview · Campaigns · Runs · Assets · Verify · Settings    │
└────────────────────────────┬─────────────────────────────────┘
                             │ REST /api/v1
┌────────────────────────────▼─────────────────────────────────┐
│  FastAPI + asyncio job runner                                │
│  request IDs · JSON logs · rate limiting · concurrency caps  │
│  campaigns · runs · assets · provenance · formats · status   │
└──────────┬─────────────────────────────┬─────────────────────┘
           │                             │
  ┌────────▼────────┐          ┌────────▼────────────────────┐
  │ SQLite + Alembic│          │ Genblaze Pipeline.run()       │
  │ campaigns/runs  │          │ + multi-provider switchboard  │
  └─────────────────┘          └────────┬──────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
           ┌────────▼────────┐  ┌───────▼───────┐  ┌───────▼───────┐
           │ ObjectStorage   │  │ Providers     │  │ B2Service     │
           │ Sink → B2       │  │ NVIDIA, Decart│  │ presign, lock │
           │ (genblaze-s3)   │  │ Edge TTS, etc.│  │ approve copy  │
           └────────▲────────┘  └───────────────┘  └───────▲───────┘
                    └──────────── Backblaze B2 ─────────────┘
```

### B2 object layout

```
advault/
├── campaigns/{campaign_id}/
│   ├── brand/logo.{png|jpg|webp|gif}
│   ├── approved/{asset_id}.{ext}
│   └── runs/{run_id}/
│       ├── manifest.json
│       └── …
└── inbox/{step_id}.mp4
```

---

## Quick start

### Prerequisites

- Python 3.12+
- Node.js 20+
- ffmpeg on PATH (Full Ad / Storyboard)
- Backblaze B2 bucket + application key
- At least one generative provider API key

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows — or: cp .env.example .env
```

Edit `backend/.env`, then:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: http://127.0.0.1:8000/health
- OpenAPI: http://127.0.0.1:8000/docs
- Providers: http://127.0.0.1:8000/api/v1/providers/status

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://127.0.0.1:5173

### End-to-end test

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/api/v1/providers/status
```

1. Create a campaign with a product brief
2. Run **Quick** mode — image appears in gallery and objects are stored in B2
3. Run **Full Ad** — image → video → voice → compose steps complete
4. Open **Provenance → Verify integrity** on a generated asset

---

## Docker deployment

```bash
docker compose build frontend --build-arg VITE_API_BASE_URL=/api/v1
docker compose up --build -d
```

| Service          | URL                              |
| ---------------- | -------------------------------- |
| Frontend         | http://localhost:5173            |
| Backend          | http://localhost:8000            |
| Health (nginx)   | http://localhost:5173/health     |

Requires `backend/.env` at repo root (not committed).

Production `.env` values:

```env
APP_ENV=production
CORS_ORIGINS=https://your-domain.com
DATABASE_URL=sqlite+aiosqlite:////app/data/advault.db
DEMO_MODE=false
```

The frontend defaults to a relative `/api/v1` base, so it works behind the bundled
nginx reverse proxy and the Vite dev proxy with no extra configuration. Set
`VITE_API_BASE_URL` only for split-origin deployments.

### Split deploy

When frontend and backend are on different hosts:

**Backend** — deploy the backend Docker image (includes ffmpeg). Set `CORS_ORIGINS` to the frontend URL.

**Frontend** — build with the backend API URL:

```bash
cd frontend
VITE_API_BASE_URL=https://api.your-domain.com/api/v1 npm run build
```

Serve `dist/` from a static host. The frontend calls the API origin directly (no nginx proxy).

### Backend only

```bash
cd backend
docker build -t advault-backend .
docker run -p 8000:8000 --env-file .env advault-backend
```

API docs: http://localhost:8000/docs

---

## Environment variables

Copy `backend/.env.example` → `backend/.env`.

### Application

| Variable       | Default                              | Description                              |
| -------------- | ------------------------------------ | ---------------------------------------- |
| `APP_NAME`     | `AdVault`                            | Display name                             |
| `APP_ENV`      | `development`                        | Environment label                        |
| `DEMO_MODE`    | `false`                              | `true` = synthetic assets, no API calls  |
| `CORS_ORIGINS` | `localhost:5173`                     | Comma-separated allowed frontend origins |
| `DATABASE_URL` | `sqlite+aiosqlite:///./advault.db`   | SQLite connection string                 |
| `OUTPUT_DIR`   | `./data/output`                      | Local temp output                        |
| `FFMPEG_PATH`  | `ffmpeg`                             | Path to ffmpeg binary                    |

### Observability & limits

| Variable                           | Default | Description                                             |
| ---------------------------------- | ------- | ------------------------------------------------------- |
| `LOG_LEVEL`                        | `INFO`  | Root log level                                           |
| `LOG_JSON`                         | `true`  | Structured JSON logs with a `request_id` field           |
| `RATE_LIMIT_ENABLED`               | `true`  | In-process limiter (use Redis before scaling replicas)   |
| `RATE_LIMIT_REQUESTS`              | `120`   | Requests per IP per window                               |
| `RATE_LIMIT_WRITE_REQUESTS`        | `20`    | Writes per IP per window                                 |
| `RATE_LIMIT_WINDOW_SECONDS`        | `60`    | Window length                                            |
| `MAX_CONCURRENT_RUNS_PER_CAMPAIGN` | `2`     | Rejects further `/generate` calls with `429`             |

Every response carries an `X-Request-ID` header. Supply your own to correlate a
client trace with the server logs.

### Database migrations

Schema is owned by Alembic. The backend container runs `alembic upgrade head`
before starting uvicorn; `Base.metadata.create_all` only runs outside production.

```bash
cd backend
alembic upgrade head          # apply
alembic revision --autogenerate -m "describe change"
alembic check                 # fail if models drift from migrations
```

### Backblaze B2

| Variable                 | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `B2_KEY_ID`              | Application key ID                                       |
| `B2_APPLICATION_KEY`     | Application key secret                                   |
| `B2_BUCKET_NAME`         | Bucket name                                              |
| `B2_REGION`              | Bucket region (e.g. `us-east-005`)                       |
| `B2_ENDPOINT`            | S3 endpoint (e.g. `https://s3.us-east-005.backblazeb2.com`) |
| `B2_PREFIX`              | Object prefix (default `advault`)                        |
| `B2_PUBLIC_URL_BASE`     | Optional public URL base for Genblaze                    |
| `B2_PRESIGN_TTL_SECONDS` | Presigned URL lifetime (default `900`)                   |
| `B2_OBJECT_LOCK_DAYS`    | Object Lock retention in days (default `30`)              |

### Provider API keys

| Variable              | Service                                              |
| --------------------- | ---------------------------------------------------- |
| `NVIDIA_API_KEY`      | [build.nvidia.com](https://build.nvidia.com/)        |
| `DECART_API_KEY`      | Decart                                               |
| `ELEVENLABS_API_KEY`  | ElevenLabs                                           |
| `LMNT_API_KEY`        | LMNT                                                 |
| `REPLICATE_API_TOKEN` | Replicate                                            |
| `GMI_API_KEY`         | GMI Cloud                                            |
| `OPENAI_API_KEY`      | OpenAI (package installed; not wired in catalog)     |

### Vendor & model pins

| Variable        | Example                              |
| --------------- | ------------------------------------ |
| `IMAGE_VENDOR`  | `nvidia`, `decart`, `replicate`      |
| `VIDEO_VENDOR`  | `local`, `nvidia`, `decart`          |
| `TTS_VENDOR`    | `edge`, `nvidia`, `elevenlabs`, `lmnt` |
| `MUSIC_VENDOR`  | `replicate`                          |
| `IMAGE_MODEL`   | `black-forest-labs/flux.1-schnell`   |
| `VIDEO_MODEL`   | `kenburns`                           |
| `VOICE_MODEL`   | `en-US-JennyNeural`                  |
| `MUSIC_MODEL`   | `meta/musicgen`                      |
| `INCLUDE_MUSIC` | `false`                              |

### Frontend (build-time)

| Variable            | Same-origin deploy (default) | Split-origin deploy                    |
| ------------------- | ---------------------------- | -------------------------------------- |
| `VITE_API_BASE_URL` | unset (uses `/api/v1`)       | `https://api.your-domain.com/api/v1`   |

### Example configurations

**Decart + local video + Edge TTS** (default `.env.example`):

```env
DECART_API_KEY=...
IMAGE_VENDOR=decart
VIDEO_VENDOR=local
TTS_VENDOR=edge
INCLUDE_MUSIC=false
DEMO_MODE=false
```

**NVIDIA NIM**:

```env
NVIDIA_API_KEY=nvapi-...
IMAGE_VENDOR=nvidia
VIDEO_VENDOR=nvidia
TTS_VENDOR=edge
IMAGE_MODEL=black-forest-labs/flux.1-schnell
DEMO_MODE=false
```

**Demo mode** (no provider keys):

```env
DEMO_MODE=true
```

Check active providers:

```bash
curl http://localhost:8000/api/v1/providers/status
```

---

## How AdVault uses Genblaze

- `genblaze_core.Pipeline` chains image → video → audio → compose steps
- `ObjectStorageSink(S3StorageBackend.for_backblaze(...))` with `KeyStrategy.HIERARCHICAL`
- Every run produces a Genblaze manifest; sidecar `manifest.json` written to B2
- `/assets/{id}/verify` re-fetches from B2 and compares SHA-256; optional MP4 manifest embed via `Mp4Handler`
- Remix runs set `parent_run_id` in DB and manifest metadata
- Brand logos passed as Genblaze `Asset` references from B2

SDK: [Genblaze on GitHub](https://github.com/backblaze-labs/genblaze)

---

## How AdVault uses Backblaze B2

- Pipeline outputs stored via Genblaze `ObjectStorageSink` under `advault/campaigns/{id}/runs/{run_id}/…`
- Provenance sidecar at `…/runs/{run_id}/manifest.json` with Object Lock when supported
- Brand logos at `advault/campaigns/{id}/brand/logo.{ext}`
- Approved finals copied to `advault/campaigns/{id}/approved/{asset_id}.{ext}`
- Presigned GET URLs at `/assets/{id}/url`; streaming download at `/assets/{id}/download`
- Verify endpoint re-downloads object bytes and checks hash against manifest

---

## API reference

| Method | Path                                          | Purpose                          |
| ------ | --------------------------------------------- | -------------------------------- |
| GET    | `/health`                                     | B2, ffmpeg, providers, demo flag |
| GET    | `/api/v1/providers/status`                    | Keys + selected vendors/models   |
| POST   | `/api/v1/campaigns`                           | Create campaign                  |
| GET    | `/api/v1/campaigns`                           | List campaigns                   |
| GET    | `/api/v1/campaigns/{id}`                      | Get campaign                     |
| PATCH  | `/api/v1/campaigns/{id}`                      | Update campaign                  |
| POST   | `/api/v1/campaigns/{id}/logo`                 | Upload brand logo to B2          |
| DELETE | `/api/v1/campaigns/{id}/logo`                 | Remove logo                      |
| POST   | `/api/v1/campaigns/{id}/generate`             | Start Quick / Full / Storyboard  |
| GET    | `/api/v1/runs/{id}`                           | Poll run status + steps          |
| POST   | `/api/v1/runs/{id}/remix`                     | Remix with lineage               |
| GET    | `/api/v1/runs/{id}/storyboard`                | Storyboard state                 |
| PATCH  | `/api/v1/runs/{id}/storyboard/scenes/{i}`     | Edit scene prompt                |
| POST   | `/api/v1/runs/{id}/storyboard/scenes/{i}/regenerate` | Regenerate scene image      |
| POST   | `/api/v1/runs/{id}/storyboard/finalize`        | Produce final video              |
| GET    | `/api/v1/assets`                              | Paginated asset list             |
| GET    | `/api/v1/campaigns/{id}/assets`               | Campaign gallery                 |
| GET    | `/api/v1/assets/{id}/url`                     | Presigned view URL               |
| GET    | `/api/v1/assets/{id}/download`                | Download asset                   |
| POST   | `/api/v1/assets/{id}/approve`                 | Copy to B2 `approved/` prefix    |
| DELETE | `/api/v1/assets/{id}`                         | Delete asset + B2 objects        |
| GET    | `/api/v1/assets/{id}/provenance`              | Manifest summary                 |
| POST   | `/api/v1/assets/{id}/verify`                  | Integrity check                  |

Interactive docs: `/docs`

---

## Troubleshooting

| Symptom                                      | Fix                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| API calls fail from deployed frontend        | Rebuild with `VITE_API_BASE_URL=/api/v1` or public API URL   |
| CORS error in browser                        | Add frontend origin to `CORS_ORIGINS`; restart backend       |
| `402 Insufficient credit` (Replicate/GMI)    | Set `IMAGE_VENDOR=nvidia` or `decart`                        |
| `No API key found. Set GMI_API_KEY`          | GMI is optional; configure NVIDIA or Decart                  |
| `b2_configured: false` / `b2_connected: false` | Fill `B2_*` vars; match region/endpoint to bucket          |
| Object Lock warning in logs                  | Bucket does not have Object Lock enabled                     |
| Compose step fails                           | Install ffmpeg; included in backend Docker image             |
| Still in Demo mode                           | Set `DEMO_MODE=false` and restart                            |
| Decart image fails                           | Set `DECART_API_KEY` when `IMAGE_VENDOR=decart`              |
| Runs lost after container restart            | Set `DATABASE_URL=sqlite+aiosqlite:////app/data/advault.db`  |

Run tests:

```bash
cd backend
pytest
```

---

## Security

- `.env` is gitignored — do not commit API keys
- Use a B2 application key scoped to one bucket

---

## License

MIT
