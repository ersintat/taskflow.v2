# PSNS Taskflow V2

AI-powered project management platform. Orchestrator Captain (Claude Opus) manages projects through autonomous sub-agents (Claude Sonnet).

## Tech Stack

- **Frontend:** Next.js 14.2 App Router + Tailwind CSS + shadcn/ui
- **Backend:** Custom server (server.ts) with Socket.IO + Scheduler
- **AI:** Claude Agent SDK (subscription) — Captain: Opus/max, Sub-agents: Sonnet/high
- **Database:** PostgreSQL 16 (Docker) via Prisma ORM (24 models)
- **MCP Server:** 21 orchestrator tools via stdio transport
- **Production:** VPS 72.60.107.129, PM2, Nginx, SSL (taskflow.psnsglobal.com)

## Project Structure

```
app/(app)/                  # Authenticated pages (dashboard, projects, team, queue, logs)
app/api/                    # API routes (actors, projects, schedules, internal)
lib/orchestrator/           # Captain system prompt, sub-agent worker, executor, tools
lib/scheduler.ts            # Cron job engine (60s tick)
mcp-server/index.ts         # 21 MCP tools
server.ts                   # Custom HTTP server + Socket.IO + Scheduler init
prisma/schema.prisma        # PostgreSQL schema (24 models)
```

## Critical Rules

### Database
- **NEVER** run `prisma db push --force-reset` or `prisma migrate reset` — destroys all data
- Nullable fields don't need reset — `prisma db push` handles them
- Always backup before schema changes: `cp prisma/dev.db prisma/dev.db.bak-$(date +%Y%m%d-%H%M)`
- Production backups: `/opt/taskflow/backup.sh` (auto daily at 03:00)

### Agent System
- Agents are identified by **ID and type**, never by name — names are aliases
- `getOrCreateOrchestratorActor()` searches by `type: 'SYSTEM'`, not name
- Agent config fields (persona, behavior, rules, capabilities) must be in **English**
- UI language is **English**, conversation language follows user

### Code Quality
- Verify every change: build, grep for stale references, DB state check
- No silent error handling — every catch must `console.error` with context tag
- Don't claim "done" without evidence

### Deploy
- Production deploy: `ssh root@72.60.107.129 '/opt/taskflow/deploy.sh'`
- Page routes: `/team` (not /actors) — API routes stay at `/api/actors`
- Static files (avatars, logo) served by Nginx directly, not Next.js
- `.next` on Google Drive: xattr nosync flags set in npm dev script

## Key Files

| File | Purpose |
|------|---------|
| `app/api/projects/[id]/agent/route.ts` | Captain SSE endpoint (background execution) |
| `lib/orchestrator/system-prompt.ts` | Captain's 10-section dynamic prompt |
| `lib/orchestrator/sub-agent-worker.ts` | Sub-agent execution via Agent SDK |
| `lib/scheduler.ts` | Cron job engine |
| `mcp-server/index.ts` | 21 MCP tools |
| `middleware.ts` | Auth middleware (excludes logo.svg, avatars/) |
| `server.ts` | HTTP server, Socket.IO, scheduler init |

## Environment Variables

```
DATABASE_URL          # PostgreSQL connection string
NEXTAUTH_SECRET       # Auth secret (random)
NEXTAUTH_URL          # App URL (https://taskflow.psnsglobal.com)
INTERNAL_SECRET       # Internal API auth between MCP server and Next.js
PORT                  # Server port (default 3000)
```
