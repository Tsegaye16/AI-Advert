# AdVault

Provenance-driven AI advertising asset pipeline for the
[Backblaze Generative Media Hackathon](https://backblaze-generative-media.devpost.com/).

Generate brand-safe ad packs (image → video → voiceover → final MP4), store them
on **Backblaze B2**, and prove every asset with **Genblaze** manifests.

Built with patterns from the official starter:
[genblaze-gen-media-multi-provider-sample](https://github.com/backblaze-labs/genblaze-gen-media-multi-provider-sample).

---

## Stack

| Layer    | Tech                                                  |
| -------- | ----------------------------------------------------- |
| Backend  | Python 3.12, FastAPI, SQLAlchemy (SQLite), Genblaze   |
| Frontend | React, Vite, TypeScript, Ant Design                   |
| Storage  | Backblaze B2 via `ObjectStorageSink` + presigned URLs |
| Compose  | Local FFmpeg (`FFmpegCompositor`)                     |

---

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # or: cp .env.example .env
```

Edit `.env` (see **Environment variables** below), then:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: http://127.0.0.1:8000/health
- Docs: http://127.0.0.1:8000/docs
- Providers: http://127.0.0.1:8000/api/v1/providers/status

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173

### Docker

```bash
docker compose up --build
```

---

## Free providers (recommended)

GMI hackathon credits were limited to the first 270 form submitters. Replicate/OpenAI need paid balance. Use the **official sample free table**:

| Provider       | What you get free    | Card? | AdVault slots                     |
| -------------- | -------------------- | ----- | --------------------------------- |
| **NVIDIA NIM** | Free API, ~40 RPM    | No    | **image · video · TTS** (primary) |
| ElevenLabs     | ~10k credits/mo TTS  | No    | TTS only                          |
| LMNT           | ~15k free characters | No    | TTS only                          |

**Music** has no free NVIDIA path. Full Ad skips music when Replicate/GMI have no credits.

### Recommended `.env` for free generation

```env
# Required storage
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=advault-media
B2_REGION=us-east-005
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com

# Free generative path
NVIDIA_API_KEY=nvapi-...
IMAGE_VENDOR=nvidia
VIDEO_VENDOR=nvidia
TTS_VENDOR=nvidia

IMAGE_MODEL=black-forest-labs/flux.1-schnell
VIDEO_MODEL=nvidia/cosmos-2.0-diffusion-video2world
VOICE_MODEL=nvidia/magpie-tts-multilingual

DEMO_MODE=false
```

Get a NVIDIA key: [https://build.nvidia.com/](https://build.nvidia.com/)

Optional free TTS:

```env
ELEVENLABS_API_KEY=...
# or
LMNT_API_KEY=...
TTS_VENDOR=elevenlabs   # or lmnt
```

---

## Environment variables

### App

| Variable       | Description                                                         |
| -------------- | ------------------------------------------------------------------- |
| `DEMO_MODE`    | `true` = fake assets (no provider keys). Use `false` for live runs. |
| `CORS_ORIGINS` | Comma-separated frontend origins                                    |
| `DATABASE_URL` | Default SQLite async URL                                            |

### Backblaze B2 (required for durable storage)

| Variable             | Description                                   |
| -------------------- | --------------------------------------------- |
| `B2_KEY_ID`          | Application key ID (**not** master key)       |
| `B2_APPLICATION_KEY` | Application key secret                        |
| `B2_BUCKET_NAME`     | Bucket name                                   |
| `B2_REGION`          | e.g. `us-east-005` (from bucket endpoint)     |
| `B2_ENDPOINT`        | e.g. `https://s3.us-east-005.backblazeb2.com` |
| `B2_PREFIX`          | Object prefix (default `advault`)             |

### Providers

| Variable              | Service                                       | Notes                           |
| --------------------- | --------------------------------------------- | ------------------------------- |
| `NVIDIA_API_KEY`      | [build.nvidia.com](https://build.nvidia.com/) | **Preferred free path**         |
| `ELEVENLABS_API_KEY`  | ElevenLabs                                    | Free TTS tier                   |
| `LMNT_API_KEY`        | LMNT                                          | Free TTS characters             |
| `OPENAI_API_KEY`      | OpenAI                                        | Paid / trial — image, Sora, TTS |
| `REPLICATE_API_TOKEN` | Replicate                                     | Needs billing credit            |
| `GMI_API_KEY`         | GMI Cloud                                     | Only if you have credits        |

### Vendor pins

Empty = auto-pick (free-first: NVIDIA → …).

| Variable       | Example                          |
| -------------- | -------------------------------- |
| `IMAGE_VENDOR` | `nvidia`                         |
| `VIDEO_VENDOR` | `nvidia`                         |
| `TTS_VENDOR`   | `nvidia` / `elevenlabs` / `lmnt` |
| `MUSIC_VENDOR` | `replicate` (optional)           |

---

## How AdVault uses Genblaze

- **Quick mode:** one image step → B2 + provenance manifest
- **Full Ad mode:** image → video → voiceover → optional music → FFmpeg mux
- Provider switchboard mirrors the official sample catalog
- Every run produces a Genblaze manifest; `/assets/{id}/verify` checks integrity
- Remix sets `parent_run_id` for lineage

---

## How AdVault uses Backblaze B2

- `ObjectStorageSink(S3StorageBackend.for_backblaze(..., key_id=, app_key=))`
- Hierarchical keys under `advault/campaigns/{id}/runs/{run_id}/…`
- Sidecar `manifest.json` (+ best-effort Object Lock if bucket supports it)
- Presigned download URLs from the API
- Approve copies finals into `…/approved/`

---

## API surface

| Method | Path                              | Purpose                             |
| ------ | --------------------------------- | ----------------------------------- |
| GET    | `/health`                         | Health + B2 / demo flags            |
| GET    | `/api/v1/providers/status`        | Keys + auto-selected vendors/models |
| POST   | `/api/v1/campaigns`               | Create campaign                     |
| GET    | `/api/v1/campaigns`               | List campaigns                      |
| POST   | `/api/v1/campaigns/{id}/generate` | Start Quick/Full run                |
| GET    | `/api/v1/runs/{id}`               | Poll run status                     |
| POST   | `/api/v1/runs/{id}/remix`         | Remix with lineage                  |
| GET    | `/api/v1/campaigns/{id}/assets`   | Gallery                             |
| GET    | `/api/v1/assets/{id}/url`         | Presigned URL                       |
| GET    | `/api/v1/assets/{id}/provenance`  | Manifest summary                    |
| POST   | `/api/v1/assets/{id}/verify`      | Tamper-evident verify               |

---

## End-to-end test

1. Confirm providers:

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8000/api/v1/providers/status
   ```

   Expect `selected.image.vendor` = `nvidia` (not replicate/gmicloud).

2. **Quick mode** in the UI — product brief → Generate.  
   Expect image in gallery + objects in the B2 bucket.

3. **Full Ad** — same brief, Full mode.  
   Expect image → video → voice → compose (music optional).

4. Open **Provenance → Verify integrity**.

---

## Troubleshooting

| Symptom                                   | Fix                                           |
| ----------------------------------------- | --------------------------------------------- |
| `402 Insufficient credit` (Replicate/GMI) | Pin `IMAGE_VENDOR=nvidia` or clear that token |
| `No API key found. Set GMI_API_KEY`       | Use `NVIDIA_API_KEY`; GMI is optional         |
| `b2_configured: false`                    | Fill `B2_*` and restart uvicorn               |
| Object Lock warning                       | Harmless if bucket has no Object Lock         |
| Compose step fails                        | Install ffmpeg; set `FFMPEG_PATH` if needed   |
| Still Demo mode                           | `DEMO_MODE=false` + restart                   |

---

## Security

- Never commit `.env` (gitignored).
- Use a **restricted B2 application key**, not the master key.
- If keys were pasted into chat or a public repo, **rotate them**.

---

## License

MIT — hackathon submission. See [DEVPOST.md](DEVPOST.md) for judge-facing submission copy (pitch, B2/Genblaze narrative, demo script).
