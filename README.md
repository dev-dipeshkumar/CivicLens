# CivicLens AI

> **Report less. Understand more. Resolve faster.**
>
> A civic-tech prototype that turns citizen photos of city problems into
> AI-detected, severity-scored, deduplicated, auto-routed municipal tasks.

---

## Project layout

```
civiclens/
├── backend/           # FastAPI + SQLAlchemy + SQLite
│   ├── app/
│   │   ├── main.py            # app entry, CORS, logging, error handlers
│   │   ├── config.py          # pydantic-settings
│   │   ├── database.py        # SQLAlchemy engine/session
│   │   ├── models.py          # ORM Report model
│   │   ├── schemas.py         # Pydantic v2 schemas
│   │   ├── routers/
│   │   │   ├── reports.py     # create/list/detail/patch
│   │   │   └── analytics.py   # summary + heatmap
│   │   ├── services/
│   │   │   ├── detection.py   # roboflow → local YOLO → mock (fallback chain)
│   │   │   ├── severity.py    # deterministic explainable severity
│   │   │   ├── dedupe.py      # perceptual-hash + haversine
│   │   │   └── geo.py         # haversine helpers
│   │   ├── security/
│   │   │   ├── upload.py      # magic-byte sniff, EXIF strip, UUID filenames
│   │   │   └── apikey.py      # X-API-Key middleware
│   │   └── seed.py            # 24 deterministic demo reports + 3 hotspots
│   ├── requirements.txt
│   └── .env.example
└── frontend/          # React 18 + Vite + TS + Tailwind + framer-motion
    ├── src/
    │   ├── pages/
    │   │   ├── Landing.tsx       # gradient hero + 3-step "how it works"
    │   │   ├── Report.tsx        # 3-step wizard (upload → pin → AI)
    │   │   └── Dashboard.tsx     # dark command-center + map + queue + analytics
    │   ├── components/           # SeverityBadge, StatusPill, HeatLayer, ...
    │   └── lib/
    │       ├── api.ts            # typed API client
    │       └── tokens.ts         # design tokens
    └── package.json
└── training/          # OPTIONAL — fine-tune your own detectors on Roboflow
    ├── _common.py                # shared download → train → deploy pipeline
    ├── requirements.txt          # heavy deps isolated from backend
    ├── streetlight/              # fine-tune streetlight (no strong public model)
    │   ├── fine_tune.py
    │   ├── deploy.py
    │   ├── .env.example
    │   └── README.md
    └── road_damage/              # fine-tune road-damage (optional, public model exists)
        ├── fine_tune.py
        ├── deploy.py
        ├── .env.example
        └── README.md
```

---

## Quick start

### 1. Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env             # tweak DEMO_CENTER_LAT / _LNG for your demo city
python -m app.seed               # seed 24 deterministic reports (3 hotspots)
uvicorn app.main:app --reload    # http://localhost:8000  ·  /docs for OpenAPI
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

The Vite dev server proxies `/api/*` and `/uploads/*` to FastAPI, so no CORS
wrangling is needed during development.

---

## Environment variables (`backend/.env`)

| Key                  | Default                         | Purpose |
| -------------------- | ------------------------------- | ------- |
| `FRONTEND_ORIGIN`    | `http://localhost:5173`         | Exact origin allowed by CORS |
| `API_KEY`            | `civiclens-demo-key`            | Required in `X-API-Key` header for dashboard/analytics routes |
| `AI_MODE`            | `mock`                          | `roboflow` \| `local` \| `mock` — with automatic fallback |
| `ROBOFLOW_API_KEY`   | *(empty)*                       | Only used when `AI_MODE=roboflow` |
| `ROBOFLOW_MODEL_URL` | *(empty)*                       | e.g. `https://detect.roboflow.com/pothole-detection-xxxxx/1` |
| `DEMO_CENTER_LAT`    | `26.9124`                       | Seed script scatters reports around this point |
| `DEMO_CENTER_LNG`    | `75.7873`                       | " |
| `DB_PATH`            | `./civiclens.db`                | SQLite file |

The demo API key is embedded in the frontend for local development; swap for
real auth before production.

---

## Detection fallback chain

```
AI_MODE=roboflow   →   Roboflow inference   →   (on any error) local YOLOv8   →   (on any error) mock
AI_MODE=local      →                             local YOLOv8                 →   (on any error) mock
AI_MODE=mock       →                                                              mock
```

The **mock** is deterministic (seeded from the image's SHA-256), so the same
photo always yields the same result — perfect for a live demo. Every fallback
is logged with a clear tag (`MOCK / LOCAL / ROBOFLOW`).

### Multi-model Roboflow inference

Public Roboflow Universe models are typically single-class. The backend calls
several in parallel and keeps the best hit:

```env
ROBOFLOW_MODELS=pothole:pothole-detection-yolov8/1,garbage:garbage_detection-wvzwv/9,streetlight:civiclens-streetlight/1
```

- `pothole`, `garbage`, `road_damage` — ready-made public models, just set the API key.
- `streetlight` — no strong public model exists, so we ship a **fine-tuning
  pipeline** in [`training/streetlight/`](./training/streetlight/README.md).
  Fork a labeled dataset (Working/Nonworking/Flicker), run one script (or
  a Colab cell), get a `slug/version`, paste it into `ROBOFLOW_MODELS`.
- Want your own **road-damage** model tuned to your city's roads?
  [`training/road_damage/`](./training/road_damage/README.md) has the same
  pipeline. Otherwise the default public model works out of the box.

---

## Severity engine (explainable)

```
score = base[category] + area_tier(bbox_area_pct) + confidence_bonus
```

- **base**: pothole 3, streetlight 3, road_damage 3, garbage 2
- **area**: <6% → 0, 6–12% → 1, 12–18% → 2, >18% → 3
- **confidence bonus**: `+1` if > 0.85

Score buckets: `0–3 Low · 4–5 Medium · 6–7 High · 8+ Critical`.
Every response also returns a human-readable `severity_reason` string so the UI
can explain *why* a level was chosen.

---

## Duplicate detection

A new report is treated as a **corroboration** of an existing one when *both*:

- `imagehash.phash` Hamming distance ≤ **8** (visually similar), and
- Haversine distance < **120 m** (physically close).

The parent's `confirmations` counter is incremented; the child row is still
persisted with `duplicate_of` pointing at the parent for audit trails.

---

## API surface

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET`    | `/health`                           | public | Liveness + AI mode |
| `POST`   | `/api/reports`                      | public (10/min/IP) | Upload photo + GPS → full analysis |
| `GET`    | `/api/reports`                      | X-API-Key | Filter/paginate reports |
| `GET`    | `/api/reports/{id}`                 | X-API-Key | Single report |
| `PATCH`  | `/api/reports/{id}/status`          | X-API-Key | Update workflow status |
| `GET`    | `/api/analytics/summary`            | X-API-Key | Counts + 14-day trend |
| `GET`    | `/api/analytics/heatmap`            | X-API-Key | Aggregated `[lat,lng,weight]` |

Interactive OpenAPI docs: <http://localhost:8000/docs>

---

## Security checklist (implemented)

- Magic-byte sniff for JPEG/PNG/WebP (never trust file extension)
- 8 MB max upload; images re-encoded via Pillow (strips EXIF/GPS, kills known image exploits)
- UUID filenames on disk
- `slowapi` rate limit: 10 uploads / minute / IP
- CORS locked to `FRONTEND_ORIGIN`
- Full Pydantic v2 validation (lat ∈ [-90, 90], lng ∈ [-180, 180], etc.)
- ORM-only DB access (no raw SQL)
- `X-API-Key` guard on all authority/analytics routes
- Global exception handler — clean JSON errors, no stack traces leak
- Structured logging with per-request IDs (returned in `X-Request-ID`)

---

## Reseeding

```bash
cd backend
source .venv/bin/activate
python -m app.seed   # idempotent — wipes existing reports and regenerates
```

The seed generates 24 reports around `DEMO_CENTER_*`, spread across 14 days,
mixing pothole (45%) / garbage (30%) / streetlight (15%) / road_damage (10%),
with **3 tight spatial clusters** so the heatmap shows obvious hotspots on
first load.

---

**Team CivicLens AI**
