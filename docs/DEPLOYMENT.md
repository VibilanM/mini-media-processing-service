# Deployment Guide — Mini Media Processing Service

This guide is written specifically for this project. It covers every component, what it does, how to deploy it, and what can go wrong.

---

## 1. Architecture Overview

```
                     Internet
                        │
                        ▼
                 React Frontend        (Vercel / Netlify / Nginx)
                        │
                        ▼
                   API Server          (Railway / Render / VPS)
                  /     |      \
                 /      |       \
                ▼       ▼        ▼
           MongoDB    Redis     MinIO/R2
           (Atlas)  (Upstash)  (Cloudflare R2)
                        │
                        ▼
                     Workers           (Railway / Render / VPS)
                        │
                      FFmpeg
                        │
                        ▼
                   Object Storage
                        │
                        ▼
                     Browser
                     (HLS Playback)
```

### Component Summary

| Component | What it does | Port |
|-----------|-------------|------|
| **API Server** | Express app — handles HTTP requests, auth, uploads | 4000 |
| **Worker** | BullMQ worker — processes videos with FFmpeg | N/A (no HTTP) |
| **MongoDB** | Stores users, video metadata, processing state | 27017 |
| **Redis** | BullMQ job queue — connects API to workers | 6379 |
| **MinIO / R2** | Stores video files, thumbnails, HLS segments | 9000 |
| **React Frontend** | Browser app — upload, watch, manage videos | 5173 (dev) / 80 (prod) |

---

## 2. Local Development Setup

### Prerequisites

- **Node.js 20+**: [nodejs.org](https://nodejs.org)
- **FFmpeg**: Must be in your PATH
  - Windows: `winget install ffmpeg` or download from [ffmpeg.org](https://ffmpeg.org/download.html)
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`
- **Redis**: Running on localhost:6379
  - Windows: Use [Memurai](https://www.memurai.com/) or Docker: `docker run -d -p 6379:6379 redis:7-alpine`
  - macOS: `brew install redis && brew services start redis`
  - Linux: `sudo apt install redis-server`
- **MinIO**: Running on localhost:9000
  - All platforms via Docker: `docker run -d -p 9000:9000 -p 9001:9001 --name minio minio/minio server /data --console-address ":9001"`
  - Or download binary from [min.io](https://min.io/download)
- **MongoDB**: Atlas (cloud) or local
  - Already configured via `MONGODB_URI` in `.env`

### Step-by-Step

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd mini-media-processing-service

# 2. Copy the env file and fill in your values
cp .env.example .env
# Edit .env — at minimum set MONGODB_URI, JWT_SECRET, RESEND_API_KEY

# 3. Install backend dependencies
npm install

# 4. Install frontend dependencies
cd client
npm install
cd ..

# 5. Create the uploads directory
mkdir -p uploads temp

# 6. Start Redis (if not already running)
# docker run -d -p 6379:6379 redis:7-alpine

# 7. Start MinIO (if not already running)
# docker run -d -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"

# 8. Start the API server (Terminal 1)
npm run dev

# 9. Start the worker (Terminal 2)
npm run worker:dev

# 10. Start the frontend (Terminal 3)
cd client
npm run dev
```

You now have:
- API at `http://localhost:4000`
- Frontend at `http://localhost:5173`
- MinIO console at `http://localhost:9001` (login: minioadmin / minioadmin)

---

## 3. Environment Variables

### Server-Only (Private — never expose to frontend)

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `MINIO_ENDPOINT` | MinIO/S3 hostname | `localhost` |
| `MINIO_PORT` | MinIO/S3 port | `9000` |
| `MINIO_ACCESS_KEY` | MinIO/S3 access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO/S3 secret key | `minioadmin` |
| `MINIO_BUCKET` | Bucket name | `media` |
| `MINIO_USE_SSL` | Use HTTPS for MinIO | `false` |
| `JWT_SECRET` | Secret for signing JWTs | (random string) |
| `JWT_EXPIRES_IN` | JWT expiry duration | `7d` |
| `RESEND_API_KEY` | Resend email API key | `re_xxxxxxxxxxxx` |
| `EMAIL_FROM` | Sender email address | `Service <onboarding@resend.dev>` |
| `CHAOS_ENABLED` | Enable chaos testing | `false` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `104857600` (100MB) |

### Frontend-Safe (Public)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | API base URL (in `client/.env`) | `http://localhost:4000` |

### Shared

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `CLIENT_URL` | Frontend URL (for email links) | `http://localhost:5173` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |

---

## 4. MongoDB Setup

### Development (Atlas Free Tier)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster
3. Create a database user
4. Allow your IP in Network Access (or `0.0.0.0/0` for development)
5. Get the connection string → set as `MONGODB_URI`

### Indexes

The application creates indexes automatically via Mongoose. Key indexes:
- `users.email` — unique
- `users.username` — unique
- `videos.status + visibility + createdAt` — compound index for dashboard queries

### Migration

Existing videos without an `uploader` field will display "Unknown" as the uploader name. No manual migration needed.

---

## 5. Redis Setup

### Local Development

Docker: `docker run -d -p 6379:6379 redis:7-alpine`

### Production (Upstash — Free Tier)

1. Go to [upstash.com](https://upstash.com)
2. Create a Redis database (free tier: 10,000 commands/day)
3. Get the host and port
4. Set `REDIS_HOST` and `REDIS_PORT` in your env

> **Important**: Upstash requires TLS. You may need to adjust the Redis connection to use TLS. BullMQ supports this via the `connection` options.

### What happens when Redis restarts?

- **In-progress jobs**: The worker may lose them. BullMQ's stalled job detection will re-queue them after 30 seconds.
- **Queued jobs**: Persist in Redis. They survive restarts because Redis saves to disk periodically.
- **Completed jobs**: BullMQ auto-cleans them.

---

## 6. MinIO / Storage Setup

### Local Development (MinIO)

```bash
docker run -d \
  -p 9000:9000 -p 9001:9001 \
  --name minio \
  -v minio-data:/data \
  minio/minio server /data --console-address ":9001"
```

Console: `http://localhost:9001` (minioadmin / minioadmin)

The API automatically creates the `media` bucket on startup.

### Production (Cloudflare R2 — Free Tier)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Create a bucket (e.g., `media`)
3. Create an API token with read/write access
4. R2 is S3-compatible. Configure:

```env
MINIO_ENDPOINT=<account-id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2-access-key>
MINIO_SECRET_KEY=<r2-secret-key>
MINIO_BUCKET=media
```

### Object Key Structure

```
media/                          ← bucket
├── originals/                  ← raw uploaded files
│   └── 1234567890-video.mp4
├── thumbnails/                 ← generated thumbnails
│   └── <videoId>-thumb.jpg
└── videos/                     ← processed outputs
    ├── <videoId>-1080p.mp4
    ├── <videoId>-720p.mp4
    ├── <videoId>-480p.mp4
    └── <videoId>/
        └── hls/                ← HLS segments
            ├── playlist.m3u8
            ├── segment000.ts
            ├── segment001.ts
            └── ...
```

### HLS Content Types

The stream proxy sets these automatically:
- `.m3u8` → `application/vnd.apple.mpegurl`
- `.ts` → `video/mp2t`

---

## 7. API Deployment

### Option A: Railway (Free Trial)

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set root directory to `/` (project root)
4. Set start command: `node src/server.js`
5. Add all environment variables from `.env.example`
6. Railway auto-detects Node.js and deploys

### Option B: Render (Free Tier)

1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `node src/server.js`
5. Add environment variables
6. Free tier sleeps after 15 min of inactivity

### Health Checks

- **Liveness**: `GET /health` — returns `{"status":"ok"}`. Use this for uptime monitoring.
- **Readiness**: `GET /health/ready` — checks MongoDB, Redis, MinIO. Returns 503 if any dependency is down.

---

## 8. Worker Deployment

Workers are **separate processes**. They do NOT listen on HTTP. They connect to Redis and process jobs.

### Option A: Railway

1. Create a second service in the same Railway project
2. Same repo, same root directory
3. Set start command: `node src/workers/videoWorker.js`
4. Same environment variables as the API
5. **Important**: Worker needs FFmpeg. Use the Dockerfile: set Dockerfile path to `Dockerfile.worker`

### Option B: Render Background Worker

1. New → Background Worker
2. Same setup as API but start command: `node src/workers/videoWorker.js`

### Scaling Workers

To process more videos simultaneously:
- Run multiple worker instances (each picks jobs from the same Redis queue)
- Or increase `concurrency` in `videoWorker.js` (currently 1)

---

## 9. FFmpeg Installation

FFmpeg must be available on the machine where workers run.

- **Docker**: The Dockerfiles install FFmpeg via `apk add ffmpeg`
- **Windows**: `winget install ffmpeg` or add to PATH manually
- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt install ffmpeg`
- **Railway/Render**: Use the Dockerfile which includes FFmpeg

---

## 10. Frontend Deployment

### Option A: Vercel (Recommended — Free)

1. Go to [vercel.com](https://vercel.com) → Import Git Repository
2. Select the `client/` directory as root
3. Framework: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variable: `VITE_API_URL=https://your-api.railway.app`
7. Deploy

### Option B: Netlify (Free)

1. Go to [netlify.com](https://netlify.com) → Import from Git
2. Base directory: `client`
3. Build command: `npm run build`
4. Publish directory: `client/dist`
5. Add `_redirects` file in `client/public/`:
   ```
   /*    /index.html   200
   ```

---

## 11. CORS Configuration

Set `CORS_ORIGIN` to your frontend URL:
- Development: `http://localhost:5173`
- Production: `https://your-app.vercel.app`

The API restricts cross-origin requests to this origin only.

---

## 12. Authentication & Email

### JWT Flow

1. User registers/logs in → API returns a JWT
2. Frontend stores JWT in localStorage
3. Every authenticated request includes `Authorization: Bearer <token>`
4. JWT expires after 7 days (configurable via `JWT_EXPIRES_IN`)

### Email (Resend)

1. Go to [resend.com](https://resend.com) → Create account
2. Get API key → set as `RESEND_API_KEY`
3. On the free tier, you can only send to your own email address
4. To send to any email: verify a domain in Resend dashboard

---

## 13. HLS Configuration

HLS playback uses the **proxy approach**: the frontend requests segments through the Express API, which fetches them from MinIO and pipes them to the browser.

```
Browser → GET /api/stream/:id/playlist.m3u8 → Express → MinIO → Browser
Browser → GET /api/stream/:id/segment000.ts → Express → MinIO → Browser
```

No CDN needed for development. For production with many viewers, consider:
1. Making the MinIO/R2 bucket public
2. Using Cloudflare CDN in front of it
3. Generating presigned URLs (already supported via `GET /api/stream/:id/url`)

---

## 14. Logging

All services log to stdout. In Docker:
```bash
docker compose logs -f api
docker compose logs -f worker
```

On Railway/Render: logs are visible in the dashboard.

---

## 15. Backups & Persistence

| Data | Where | Backup Strategy |
|------|-------|----------------|
| User accounts & video metadata | MongoDB Atlas | Atlas auto-backups (free tier: daily) |
| Job queue state | Redis/Upstash | Auto-persisted, but not critical — jobs can be re-queued |
| Video files & segments | MinIO/R2 | R2 has built-in durability. MinIO needs manual backup |

---

## 16. Troubleshooting

### "ECONNREFUSED" when starting

Redis or MinIO is not running. Start them first.

### Upload works but processing never starts

Worker is not running. Start it: `npm run worker`

### HLS playback fails

1. Check the video status: `GET /api/uploads/video/:id/status`
2. If status is `completed` but HLS doesn't play, check MinIO for the HLS files
3. Check browser console for CORS errors

### "Invalid or expired token"

JWT has expired (7 days). Log in again.

### Worker crashes during FFmpeg

FFmpeg is not installed or not in PATH. Check: `ffmpeg -version`

---

## 17. Common Failure Scenarios

| Scenario | What Happens | Recovery |
|----------|-------------|---------|
| API crashes | Frontend shows errors. Redis queue preserves jobs. | Restart API |
| Worker crashes mid-processing | Job is marked as stalled. BullMQ retries automatically (up to 4 attempts). | Restart worker |
| Redis crashes | API can't enqueue. Worker can't dequeue. | Restart Redis. Queued jobs persist. |
| MongoDB crashes | API returns 500s. Processing continues but can't save progress. | Restart MongoDB |
| MinIO crashes | Uploads fail. Streaming fails. Processing fails at download step. | Restart MinIO |
