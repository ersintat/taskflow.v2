# PSNS Taskflow V2

AI-powered project management platform where an Orchestrator Captain (Claude Opus) manages projects through autonomous sub-agents.

## Architecture

```
User <-> Chat UI <-> SSE Stream <-> Agent SDK (Claude Opus) <-> MCP Server <-> Database
                                         |
                                    Sub-Agents (Claude Sonnet)
                                         |
                                    Scheduler (Cron Jobs)
```

### Core Stack
- **Frontend:** Next.js 14.2 (App Router) + Tailwind CSS + shadcn/ui
- **Backend:** Custom Node.js server (server.ts) with Socket.IO
- **AI:** Claude Agent SDK (subscription) — Captain: Opus, Sub-agents: Sonnet
- **Database:** SQLite (dev) / PostgreSQL (production) via Prisma ORM
- **MCP Server:** 21 orchestrator tools via stdio transport

### Key Features
- **Orchestrator Captain** — Central AI intelligence with 10-section dynamic system prompt, 3 behavioral modes (Discovery/Active Management/Strategic Oversight)
- **Sub-Agent Runtime** — Autonomous agents that execute tasks via Agent SDK, report results back to Captain
- **Scheduled Tasks** — Cron-based recurring jobs (DB-driven, 60s polling interval)
- **Agent Persona System** — Each agent has configurable Role/Persona, Behavior, and Rules
- **Real-time Chat** — SSE streaming with markdown rendering, tool call visualization
- **Background Execution** — Agent runs independently of browser connection
- **Knowledge Base** — Searchable project knowledge with typed entries
- **Notification System** — In-app notifications with bell icon + polling

### MCP Tools (21)
| # | Tool | Purpose |
|---|------|---------|
| 1 | create_task | Create tasks in project |
| 2 | update_task | Update status/priority/details |
| 3 | create_mission | Create agent missions (deprecated) |
| 4 | update_context | Save project context (versioned) |
| 5 | add_knowledge | Write to knowledge base |
| 6 | create_sub_agent | Create agents with persona/behavior/rules |
| 7 | list_tasks | Query tasks with filters |
| 8 | list_missions | Query missions |
| 9 | assign_task | Assign actors to tasks |
| 10 | create_subtask | Break tasks into subtasks |
| 11 | add_comment | Comment on tasks |
| 12 | approve_reject_task | Decision making on tasks |
| 13 | delete_task | Remove tasks |
| 14 | enqueue_task | Queue task + trigger sub-agent worker |
| 15 | search_knowledge | Search knowledge base |
| 16 | send_notification | In-app notifications |
| 17 | get_mission_result | Read mission results |
| 18 | list_agents | List all actors/agents |
| 19 | create_schedule | Create cron-based recurring tasks |
| 20 | list_schedules | List scheduled tasks |
| 21 | delete_schedule | Remove scheduled tasks |

## Project Structure

```
app/
  (app)/                    # Authenticated layout
    _components/            # App shell, sidebar, topbar
    projects/[id]/          # Project detail + orchestrator chat
    actors/[id]/            # Agent detail + persona editing
    queue/                  # Agent queue + scheduled tasks
    settings/logs/          # System logs viewer
  api/
    projects/[id]/agent/    # Captain SSE endpoint (background execution)
    internal/trigger-worker/ # Sub-agent worker trigger (internal)
    actors/[id]/avatar/     # Avatar upload
    schedules/              # Schedule CRUD
  login/ & signup/          # Auth pages

lib/
  orchestrator/
    system-prompt.ts        # Captain's 10-section dynamic prompt
    sub-agent-worker.ts     # Sub-agent execution via Agent SDK
    sub-agent-prompt.ts     # Sub-agent prompt builder (with persona)
    executor.ts             # Tool execution engine
    project-snapshot.ts     # DB snapshot for system prompt
  scheduler.ts              # Cron job engine (60s tick)
  auth.ts                   # NextAuth config
  db.ts                     # Prisma client

mcp-server/
  index.ts                  # 21 MCP tools via stdio

server.ts                   # Custom HTTP server + Socket.IO + Scheduler init
prisma/schema.prisma        # 24 models (SQLite/PostgreSQL)
```

## Setup

```bash
# Install dependencies
npm install
cd mcp-server && npm install && cd ..

# Setup database
cp .env.example .env
npx prisma db push
npx prisma db seed

# Run development
npm run dev
```

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
```

## Production Deploy

Target: VPS with PostgreSQL (Docker), Nginx reverse proxy, PM2 process manager.

```bash
# On VPS
git clone https://github.com/ersintat/taskflow.v2.git /opt/taskflow
cd /opt/taskflow
npm install --production
npx prisma migrate deploy
pm2 start server.ts --interpreter tsx --name taskflow
```

---

*The Project that Sun Never Sets* 🌞❤️
