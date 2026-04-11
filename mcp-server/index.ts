#!/usr/bin/env node
/**
 * Taskflow MCP Server
 * 
 * Serves 18 orchestrator tools via MCP protocol (stdio transport).
 * Claude Code SDK connects to this server to manage tasks, missions,
 * knowledge base, agents, and notifications for a Taskflow project.
 * 
 * Environment variables:
 *   DATABASE_URL - Prisma database connection string
 *   PROJECT_ID   - Current project ID (passed per-session)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

// ─── Prisma Client ───
const prisma = new PrismaClient();
const PROJECT_ID = process.env.PROJECT_ID || "";

if (!PROJECT_ID) {
  console.error("WARNING: PROJECT_ID not set. Tools will fail without a valid project ID.");
}

// ─── System Log Helper ───
async function logEvent(projectId: string | null, category: string, title: string, details?: string, level = "info") {
  try {
    await prisma.systemLog.create({
      data: { projectId, category, title, details, level },
    });
  } catch { /* non-blocking */ }
}

// ─── Orchestrator Actor Helper ───
async function getOrCreateOrchestratorActor() {
  let actor = await prisma.actor.findFirst({ where: { name: "Orchestrator", type: "SYSTEM" } });
  if (!actor) {
    actor = await prisma.actor.create({
      data: { name: "Orchestrator", type: "SYSTEM", trustLevel: "full" },
    });
  }
  return actor;
}

// ─── Initialize MCP Server ───
const server = new McpServer({
  name: "taskflow-tools",
  version: "1.0.0",
});

// ════════════════════════════════════════════════════════
// 1. create_task
// ════════════════════════════════════════════════════════
server.tool(
  "create_task",
  "Create a new task in the current project. Use when the user asks to add a task or when you identify work that needs to be done.",
  {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    priority: z.enum(["urgent", "high", "medium", "low"]).optional().describe("Task priority"),
    platform: z.string().optional().describe("Platform tag (gmc, google_ads, meta, ga4, gsc, klaviyo, shopify)"),
    taskType: z.enum(["feature", "bug", "improvement", "research", "maintenance"]).optional().describe("Task type"),
  },
  async (args) => {
    try {
      const category = await prisma.taskCategory.findFirst({
        where: { projectId: PROJECT_ID, name: "Backlog" },
      });

      const task = await prisma.task.create({
        data: {
          projectId: PROJECT_ID,
          categoryId: category?.id || undefined,
          title: args.title,
          description: args.description || "",
          priority: args.priority || "medium",
          taskType: args.taskType || "feature",
          platform: args.platform || null,
          status: "todo",
        },
      });

      await prisma.taskActivity.create({
        data: { taskId: task.id, eventType: "task_created", description: `Created by Orchestrator: ${args.title}` },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Task created: ${args.title}`, JSON.stringify(task), "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          message: `Task "${task.title}" created successfully (ID: ${task.id})`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 2. update_task
// ════════════════════════════════════════════════════════
server.tool(
  "update_task",
  "Update an existing task status, priority, or details.",
  {
    taskId: z.string().describe("The task ID to update"),
    status: z.enum(["todo", "in_progress", "done", "blocked", "pending_review", "cancelled"]).optional().describe("New status"),
    priority: z.enum(["urgent", "high", "medium", "low"]).optional().describe("New priority"),
    title: z.string().optional().describe("Updated title"),
    description: z.string().optional().describe("Updated description"),
  },
  async (args) => {
    try {
      const updateData: any = {};
      if (args.status) updateData.status = args.status;
      if (args.priority) updateData.priority = args.priority;
      if (args.title) updateData.title = args.title;
      if (args.description) updateData.description = args.description;

      const task = await prisma.task.update({ where: { id: args.taskId }, data: updateData });

      if (args.status) {
        await prisma.taskActivity.create({
          data: { taskId: task.id, eventType: "status_changed", description: `Orchestrator changed status to ${args.status}` },
        });
      }

      await logEvent(PROJECT_ID, "orchestrator", `Task updated: ${task.title}`, JSON.stringify({ args }), "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, taskId: task.id, title: task.title, status: task.status, priority: task.priority,
          message: `Task "${task.title}" updated successfully`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 3. create_mission
// ════════════════════════════════════════════════════════
server.tool(
  "create_mission",
  "Create a mission for automated execution via Claude CLI. Use for tasks that require local file access, API calls, or executing code.",
  {
    title: z.string().describe("Mission title"),
    prompt: z.string().describe("Detailed prompt/instructions for Claude CLI to execute"),
    targetService: z.enum(["shopify", "gmc", "google_ads", "meta", "ga4", "gsc", "klaviyo", "general"]).optional().describe("Target service"),
    missionType: z.enum(["data_pull", "analysis", "action", "report"]).optional().describe("Type of mission"),
    priority: z.number().optional().describe("Priority (0=normal, higher=more urgent)"),
  },
  async (args) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id: PROJECT_ID },
        select: { claudeWorkDir: true, name: true },
      });

      let fullPrompt = args.prompt;
      if (project?.claudeWorkDir) {
        fullPrompt = `# Working Directory: ${project.claudeWorkDir}\nPlease execute from this directory.\n\n${args.prompt}`;
      }

      const mission = await prisma.agentMission.create({
        data: {
          projectId: PROJECT_ID,
          title: args.title,
          prompt: fullPrompt,
          targetService: args.targetService || "general",
          missionType: args.missionType || "data_pull",
          priority: args.priority || 0,
          status: "pending",
        },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Mission created: ${args.title}`, JSON.stringify(mission), "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, missionId: mission.id, title: mission.title, status: "pending",
          message: `Mission "${mission.title}" created and queued.`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 4. update_context
// ════════════════════════════════════════════════════════
server.tool(
  "update_context",
  "Save or update a key-value entry in the project context. Use for storing important decisions, summaries, learnings.",
  {
    key: z.string().describe('Context key (e.g. "project-brief", "tech-stack")'),
    value: z.string().describe("Context value (markdown supported)"),
  },
  async (args) => {
    try {
      const existing = await prisma.projectContext.findFirst({
        where: { projectId: PROJECT_ID, key: args.key },
        orderBy: { version: "desc" },
      });

      const ctx = await prisma.projectContext.create({
        data: {
          projectId: PROJECT_ID,
          key: args.key,
          value: args.value,
          version: (existing?.version || 0) + 1,
          createdBy: "orchestrator",
        },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Context updated: ${args.key}`, `v${ctx.version}`, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, key: ctx.key, version: ctx.version,
          message: `Context "${args.key}" saved (v${ctx.version})`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 5. add_knowledge
// ════════════════════════════════════════════════════════
server.tool(
  "add_knowledge",
  "Add an entry to the project knowledge base. Use for documenting lessons learned, decisions, technical notes, processes.",
  {
    title: z.string().describe("Knowledge entry title"),
    content: z.string().describe("Knowledge content (markdown)"),
    type: z.enum(["lesson_learned", "decision_rationale", "technical_note", "process_note", "reference", "faq"]).describe("Entry type"),
    tags: z.string().optional().describe("Comma-separated tags"),
  },
  async (args) => {
    try {
      const tagArray = args.tags ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
      const kb = await prisma.knowledgeBase.create({
        data: {
          projectId: PROJECT_ID,
          title: args.title,
          content: args.content,
          type: args.type,
          tags: JSON.stringify(tagArray),
          createdBy: "orchestrator",
        },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Knowledge added: ${args.title}`, kb.type, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, id: kb.id, title: kb.title,
          message: `Knowledge entry "${args.title}" added to the knowledge base`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 6. create_sub_agent
// ════════════════════════════════════════════════════════
server.tool(
  "create_sub_agent",
  "Create a new sub-agent (Actor) with specific skills, persona, behavior, and rules. Sub-agents can be assigned tasks and run autonomously.",
  {
    name: z.string().describe('Agent name (e.g. "SEO Specialist", "Content Analyst")'),
    capabilities: z.array(z.string()).describe("List of capabilities/skills"),
    trustLevel: z.enum(["full", "high", "medium", "low", "probation"]).optional().describe("Trust level"),
    persona: z.string().optional().describe('Role/persona: who the agent acts as (e.g. "You are a senior SEO expert with 10 years of experience")'),
    behavior: z.string().optional().describe('Behavioral guidelines: how the agent works (e.g. "Always analyze before acting, never guess, provide data-backed answers")'),
    rules: z.string().optional().describe('Constraints/policies: what the agent must/must not do (e.g. "Never modify live listings without explicit approval, always cite sources")'),
  },
  async (args) => {
    try {
      const actor = await prisma.actor.create({
        data: {
          name: args.name,
          type: "AGENT",
          trustLevel: args.trustLevel || "medium",
          persona: args.persona || null,
          behavior: args.behavior || null,
          rules: args.rules || null,
        },
      });

      if (args.capabilities?.length) {
        await prisma.actorCapability.createMany({
          data: args.capabilities.map((cap: string) => ({
            actorId: actor.id,
            capabilityName: cap,
          })),
        });
      }

      await logEvent(PROJECT_ID, "orchestrator", `Sub-agent created: ${args.name}`, JSON.stringify({ capabilities: args.capabilities, persona: !!args.persona, behavior: !!args.behavior, rules: !!args.rules }), "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, actorId: actor.id, name: actor.name, capabilities: args.capabilities,
          hasPersona: !!args.persona, hasBehavior: !!args.behavior, hasRules: !!args.rules,
          message: `Sub-agent "${args.name}" created with capabilities: ${args.capabilities?.join(", ")}${args.persona ? ' | persona set' : ''}${args.behavior ? ' | behavior set' : ''}${args.rules ? ' | rules set' : ''}`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 7. list_tasks
// ════════════════════════════════════════════════════════
server.tool(
  "list_tasks",
  "Get the current list of tasks with their details. Use to check project status or find specific tasks.",
  {
    status: z.enum(["todo", "in_progress", "done", "blocked", "pending_review", "all"]).optional().describe("Filter by status (default: all)"),
    platform: z.string().optional().describe("Filter by platform tag"),
  },
  async (args) => {
    try {
      const where: any = { projectId: PROJECT_ID };
      if (args.status && args.status !== "all") where.status = args.status;
      if (args.platform) where.platform = args.platform;

      const tasks = await prisma.task.findMany({
        where,
        select: {
          id: true, title: true, status: true, priority: true,
          platform: true, taskType: true, description: true,
          assignments: { include: { actor: { select: { name: true, type: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: tasks.map((t: any) => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            platform: t.platform, type: t.taskType,
            description: t.description?.substring(0, 200),
            assignees: t.assignments?.map((a: any) => a.actor?.name).filter(Boolean),
          })),
          message: `Found ${tasks.length} task(s)`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 8. list_missions
// ════════════════════════════════════════════════════════
server.tool(
  "list_missions",
  "Get the current list of missions and their statuses.",
  {
    status: z.enum(["pending", "claimed", "running", "completed", "failed", "all"]).optional().describe("Filter by status (default: all)"),
  },
  async (args) => {
    try {
      const where: any = { projectId: PROJECT_ID };
      if (args.status && args.status !== "all") where.status = args.status;

      const missions = await prisma.agentMission.findMany({
        where,
        select: {
          id: true, title: true, status: true, targetService: true,
          missionType: true, result: true, errorMessage: true,
          createdAt: true, completedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: missions.map((m: any) => ({
            id: m.id, title: m.title, status: m.status,
            service: m.targetService, type: m.missionType,
            result: m.result?.substring(0, 500),
            error: m.errorMessage,
            created: m.createdAt, completed: m.completedAt,
          })),
          message: `Found ${missions.length} mission(s)`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 9. assign_task
// ════════════════════════════════════════════════════════
server.tool(
  "assign_task",
  "Assign an actor (human or sub-agent) to a task.",
  {
    taskId: z.string().describe("The task ID to assign"),
    actorId: z.string().describe("The actor ID to assign"),
    role: z.enum(["ASSIGNEE", "REVIEWER"]).optional().describe("Assignment role (default: ASSIGNEE)"),
  },
  async (args) => {
    try {
      const role = args.role || "ASSIGNEE";
      const assignment = await prisma.taskAssignment.upsert({
        where: { taskId_actorId_role: { taskId: args.taskId, actorId: args.actorId, role } },
        create: { taskId: args.taskId, actorId: args.actorId, role },
        update: {},
      });

      const actor = await prisma.actor.findUnique({ where: { id: args.actorId }, select: { name: true } });
      const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });

      await prisma.taskActivity.create({
        data: { taskId: args.taskId, eventType: "assigned", description: `Orchestrator assigned ${actor?.name || "actor"} to task` },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Task assigned: ${task?.title} → ${actor?.name}`, undefined, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, assignmentId: assignment.id,
          message: `"${actor?.name || "Actor"}" assigned to "${task?.title || "task"}" as ${role}`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 10. create_subtask
// ════════════════════════════════════════════════════════
server.tool(
  "create_subtask",
  "Create a subtask (checklist item) under a task. Use to break work into smaller steps.",
  {
    taskId: z.string().describe("The parent task ID"),
    title: z.string().describe("Subtask title"),
  },
  async (args) => {
    try {
      const maxOrder = await prisma.subtask.aggregate({ where: { taskId: args.taskId }, _max: { order: true } });
      const subtask = await prisma.subtask.create({
        data: { taskId: args.taskId, title: args.title, order: (maxOrder._max.order || 0) + 1 },
      });

      const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
      await logEvent(PROJECT_ID, "orchestrator", `Subtask created: ${args.title} (under ${task?.title})`, undefined, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, subtaskId: subtask.id, title: subtask.title,
          message: `Subtask "${subtask.title}" created under "${task?.title || "task"}"`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 11. add_comment
// ════════════════════════════════════════════════════════
server.tool(
  "add_comment",
  "Add a comment to a task. Use for notes, updates, or instructions.",
  {
    taskId: z.string().describe("The task ID to comment on"),
    content: z.string().describe("Comment content"),
  },
  async (args) => {
    try {
      const actor = await getOrCreateOrchestratorActor();
      const comment = await prisma.comment.create({
        data: { taskId: args.taskId, actorId: actor.id, content: args.content },
      });

      const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
      await logEvent(PROJECT_ID, "orchestrator", `Comment added on: ${task?.title}`, args.content.substring(0, 200), "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, commentId: comment.id,
          message: `Comment added to "${task?.title || "task"}"`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 12. approve_reject_task
// ════════════════════════════════════════════════════════
server.tool(
  "approve_reject_task",
  "Approve or reject a task that is pending review. Also used for making project decisions.",
  {
    taskId: z.string().describe("The task ID"),
    decisionType: z.enum(["APPROVAL", "REJECTION", "REDIRECT"]).describe("Decision type"),
    title: z.string().describe("Decision title"),
    decision: z.string().describe("Decision explanation"),
    rationale: z.string().optional().describe("Rationale for the decision"),
  },
  async (args) => {
    try {
      const actor = await getOrCreateOrchestratorActor();
      const decision = await prisma.decision.create({
        data: {
          taskId: args.taskId, actorId: actor.id,
          decisionType: args.decisionType, title: args.title,
          decision: args.decision, rationale: args.rationale || null,
        },
      });

      const statusMap: Record<string, string> = { APPROVAL: "done", REJECTION: "todo", REDIRECT: "in_progress" };
      const newStatus = statusMap[args.decisionType] || "todo";
      const task = await prisma.task.update({ where: { id: args.taskId }, data: { status: newStatus } });

      await prisma.taskActivity.create({
        data: { taskId: args.taskId, eventType: "decision_made", description: `Orchestrator ${args.decisionType.toLowerCase()}: ${args.title}` },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Decision: ${args.decisionType} on ${task.title}`, args.decision, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, decisionId: decision.id, newStatus,
          message: `${args.decisionType} recorded for "${task.title}". Status → ${newStatus}`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 13. delete_task
// ════════════════════════════════════════════════════════
server.tool(
  "delete_task",
  "Delete a task from the project. Use only when explicitly asked or when a task is clearly unnecessary.",
  {
    taskId: z.string().describe("The task ID to delete"),
  },
  async (args) => {
    try {
      const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
      if (!task) return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "Task not found" }) }] };

      await prisma.task.delete({ where: { id: args.taskId } });
      await logEvent(PROJECT_ID, "orchestrator", `Task deleted: ${task.title}`, undefined, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, message: `Task "${task.title}" deleted`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 14. enqueue_task
// ════════════════════════════════════════════════════════
server.tool(
  "enqueue_task",
  "Send a task to the Agent Queue for automated processing by a sub-agent. This triggers the sub-agent worker automatically.",
  {
    taskId: z.string().describe("The task ID to enqueue"),
    priority: z.number().optional().describe("Queue priority (0=normal, higher=more urgent)"),
  },
  async (args) => {
    try {
      const queueItem = await prisma.agentQueue.create({
        data: { taskId: args.taskId, priority: args.priority || 0, status: "WAITING" },
      });

      const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });

      await prisma.taskActivity.create({
        data: { taskId: args.taskId, eventType: "queued", description: "Orchestrator enqueued task for agent processing" },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Task enqueued: ${task?.title}`, undefined, "action");

      // SYNCHRONOUS: Trigger sub-agent worker and WAIT for result
      // Captain MUST see the real outcome to report to user
      const baseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || "http://localhost:3000";
      const internalSecret = process.env.INTERNAL_SECRET || "taskflow-internal-2026";

      try {
        const workerRes = await fetch(`${baseUrl}/api/internal/trigger-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret,
          },
          body: JSON.stringify({ queueItemId: queueItem.id, waitForResult: true }),
        });

        const workerData = await workerRes.json();

        if (workerData.success) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              success: true,
              queueItemId: queueItem.id,
              status: "COMPLETED",
              message: `SUB-AGENT COMPLETED — Task: "${task?.title}"\n\n--- AGENT REPORT ---\n${workerData.summary}\n--- END REPORT ---\n\nYou MUST present this report to the user. Evaluate the work quality and decide: approve_reject_task with APPROVAL or REJECTION.`,
            }) }],
          };
        } else {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              success: false,
              queueItemId: queueItem.id,
              status: workerData.status || "FAILED",
              message: `SUB-AGENT FAILED — Task: "${task?.title}"\nError: ${workerData.error}\n\nTell the user what went wrong. Suggest a fix.`,
            }) }],
          };
        }
      } catch (fetchErr: any) {
        // Worker trigger failed — report but don't crash
        console.error("Worker call failed:", fetchErr.message);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            success: true,
            queueItemId: queueItem.id,
            status: "QUEUED",
            message: `Task "${task?.title}" queued but worker response timed out. Sub-agent may still be running in background. Check task status later.`,
          }) }],
        };
      }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 15. search_knowledge
// ════════════════════════════════════════════════════════
server.tool(
  "search_knowledge",
  "Search the project knowledge base for relevant information by keyword or type.",
  {
    query: z.string().optional().describe("Search keyword"),
    type: z.enum(["lesson_learned", "decision_rationale", "technical_note", "process_note", "reference", "faq", "all"]).optional().describe("Filter by type"),
  },
  async (args) => {
    try {
      const where: any = { projectId: PROJECT_ID };
      if (args.type && args.type !== "all") where.type = args.type;

      let entries = await prisma.knowledgeBase.findMany({
        where,
        select: { id: true, title: true, content: true, type: true, tags: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      if (args.query) {
        const q = args.query.toLowerCase();
        entries = entries.filter((e: any) =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q)
        );
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: entries.map((e: any) => ({
            id: e.id, title: e.title, type: e.type, tags: e.tags,
            content: e.content.substring(0, 500),
          })),
          message: `Found ${entries.length} knowledge entry(s)`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 16. send_notification
// ════════════════════════════════════════════════════════
server.tool(
  "send_notification",
  "Send an in-app notification to the project owner. Use for important updates, alerts, or action items.",
  {
    title: z.string().describe("Notification title"),
    message: z.string().describe("Notification message"),
    type: z.enum(["info", "success", "warning", "error"]).optional().describe("Notification type"),
    link: z.string().optional().describe("Optional link to navigate to when clicked"),
  },
  async (args) => {
    try {
      const project = await prisma.project.findUnique({ where: { id: PROJECT_ID }, select: { ownerId: true } });
      if (!project) return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "Project not found" }) }] };

      const notif = await prisma.notification.create({
        data: {
          userId: project.ownerId,
          title: args.title,
          message: args.message,
          type: args.type || "info",
          link: args.link || `/projects/${PROJECT_ID}`,
        },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Notification sent: ${args.title}`, args.message, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true, notificationId: notif.id,
          message: `Notification "${args.title}" sent to project owner`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 17. get_mission_result
// ════════════════════════════════════════════════════════
server.tool(
  "get_mission_result",
  "Get the full result/output of a completed mission.",
  {
    missionId: z.string().describe("The mission ID"),
  },
  async (args) => {
    try {
      const mission = await prisma.agentMission.findUnique({
        where: { id: args.missionId },
        select: {
          id: true, title: true, status: true, result: true, logs: true,
          errorMessage: true, targetService: true, missionType: true,
          createdAt: true, completedAt: true,
        },
      });

      if (!mission) return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "Mission not found" }) }] };

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: {
            id: mission.id, title: mission.title, status: mission.status,
            service: mission.targetService, type: mission.missionType,
            result: mission.result, logs: mission.logs,
            error: mission.errorMessage,
            created: mission.createdAt, completed: mission.completedAt,
          },
          message: `Mission "${mission.title}" — ${mission.status}`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 18. list_agents
// ════════════════════════════════════════════════════════
server.tool(
  "list_agents",
  "List all actors (humans, agents, systems) with their capabilities. Use to find who to assign tasks to.",
  {
    type: z.enum(["HUMAN", "AGENT", "SYSTEM", "all"]).optional().describe("Filter by actor type (default: all)"),
  },
  async (args) => {
    try {
      const where: any = { isActive: true };
      if (args.type && args.type !== "all") where.type = args.type;

      const actors = await prisma.actor.findMany({
        where,
        select: {
          id: true, name: true, type: true, email: true, trustLevel: true,
          capabilities: { select: { capabilityName: true, proficiencyLevel: true } },
        },
        orderBy: { name: "asc" },
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: actors.map((a: any) => ({
            id: a.id, name: a.name, type: a.type, email: a.email, trustLevel: a.trustLevel,
            capabilities: a.capabilities.map((c: any) => `${c.capabilityName} (${c.proficiencyLevel}/5)`),
          })),
          message: `Found ${actors.length} actor(s)`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 19. create_schedule
// ════════════════════════════════════════════════════════

// Simple cron validation (matches node-cron format)
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

// Calculate next run time from cron expression
function calcNextRunAt(cronExpr: string): Date {
  const now = new Date();
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return new Date(now.getTime() + 60 * 60 * 1000);

  const check = new Date(now.getTime() + 60_000);
  check.setSeconds(0, 0);

  for (let i = 0; i < 2880; i++) {
    const candidate = new Date(check.getTime() + i * 60_000);
    if (cronMatchesDate(parts, candidate)) return candidate;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function cronMatchesDate(parts: string[], date: Date): boolean {
  const vals = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  for (let i = 0; i < 5; i++) {
    if (!cronFieldMatches(parts[i], vals[i])) return false;
  }
  return true;
}

function cronFieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2));
    return step > 0 && value % step === 0;
  }
  for (const v of field.split(",")) {
    if (v.includes("-")) {
      const [s, e] = v.split("-").map(Number);
      if (value >= s && value <= e) return true;
    } else {
      if (parseInt(v) === value) return true;
    }
  }
  return false;
}

server.tool(
  "create_schedule",
  "Create a scheduled/recurring task. The scheduler runs automatically — tasks will be created or agents triggered at the specified cron schedule.",
  {
    name: z.string().describe("Schedule name (e.g. 'Daily SEO Report')"),
    cron: z.string().describe("Cron expression (e.g. '0 9 * * *' = daily at 09:00, '*/30 * * * *' = every 30 min)"),
    action: z.enum(["create_task", "enqueue_task", "run_agent"]).describe("Action: create_task (new task), enqueue_task (queue existing), run_agent (create+assign+queue)"),
    payload: z.string().describe('JSON payload. For create_task/run_agent: {"title":"...","description":"...","priority":"medium"}. For enqueue_task: {"taskId":"..."}'),
    agentId: z.string().optional().describe("Agent ID (required for run_agent action)"),
    description: z.string().optional().describe("Schedule description"),
    timezone: z.string().optional().describe("Timezone (default: Europe/Istanbul)"),
  },
  async (args) => {
    try {
      if (!isValidCron(args.cron)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `Invalid cron expression: "${args.cron}". Use 5-field format: minute hour day month weekday` }) }] };
      }

      // Validate payload is valid JSON
      try { JSON.parse(args.payload); } catch {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "Invalid JSON in payload" }) }] };
      }

      if (args.action === "run_agent" && !args.agentId) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "run_agent action requires agentId" }) }] };
      }

      const nextRunAt = calcNextRunAt(args.cron);

      const schedule = await prisma.schedule.create({
        data: {
          projectId: PROJECT_ID,
          name: args.name,
          description: args.description || null,
          cron: args.cron,
          timezone: args.timezone || "Europe/Istanbul",
          action: args.action,
          payload: args.payload,
          agentId: args.agentId || null,
          isActive: true,
          nextRunAt,
        },
      });

      await logEvent(PROJECT_ID, "orchestrator", `Schedule created: ${args.name}`, `cron: ${args.cron}, action: ${args.action}, next: ${nextRunAt.toISOString()}`, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          scheduleId: schedule.id,
          name: schedule.name,
          cron: schedule.cron,
          action: schedule.action,
          nextRunAt: nextRunAt.toISOString(),
          message: `Schedule "${args.name}" created. Next run: ${nextRunAt.toISOString()}. Cron: ${args.cron}`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 20. list_schedules
// ════════════════════════════════════════════════════════
server.tool(
  "list_schedules",
  "List all scheduled tasks for the current project.",
  {
    status: z.enum(["active", "inactive", "all"]).optional().describe("Filter by status (default: all)"),
  },
  async (args) => {
    try {
      const where: any = { projectId: PROJECT_ID };
      if (args.status === "active") where.isActive = true;
      else if (args.status === "inactive") where.isActive = false;

      const schedules = await prisma.schedule.findMany({
        where,
        select: {
          id: true, name: true, description: true, cron: true, timezone: true,
          action: true, agentId: true, isActive: true,
          lastRunAt: true, nextRunAt: true, runCount: true, lastError: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          data: schedules.map((s: any) => ({
            id: s.id, name: s.name, description: s.description,
            cron: s.cron, timezone: s.timezone, action: s.action,
            agentId: s.agentId, isActive: s.isActive,
            lastRunAt: s.lastRunAt, nextRunAt: s.nextRunAt,
            runCount: s.runCount, lastError: s.lastError,
          })),
          message: `Found ${schedules.length} schedule(s)`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// 21. delete_schedule
// ════════════════════════════════════════════════════════
server.tool(
  "delete_schedule",
  "Delete a scheduled task by ID. Use to stop a recurring schedule.",
  {
    scheduleId: z.string().describe("The schedule ID to delete"),
  },
  async (args) => {
    try {
      const schedule = await prisma.schedule.findUnique({ where: { id: args.scheduleId }, select: { name: true } });
      if (!schedule) return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "Schedule not found" }) }] };

      await prisma.schedule.delete({ where: { id: args.scheduleId } });
      await logEvent(PROJECT_ID, "orchestrator", `Schedule deleted: ${schedule.name}`, undefined, "action");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: true,
          message: `Schedule "${schedule.name}" deleted`,
        }) }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

// ════════════════════════════════════════════════════════
// Start Server
// ════════════════════════════════════════════════════════
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`✅ Taskflow MCP Server running (project: ${PROJECT_ID || "NOT SET"})`);
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
