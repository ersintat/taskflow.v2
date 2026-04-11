// Orchestrator Tool Executor — executes tool calls and returns results
import { prisma } from '@/lib/db';
import { syncTaskCategory } from '@/lib/task-utils';
import { triggerSubAgentWorker } from './sub-agent-worker';

interface ToolCallResult {
  success: boolean;
  data: any;
  message: string;
}

// ─── System Log Helper ───
async function logEvent(projectId: string | null, category: string, title: string, details?: string, level = 'info') {
  try {
    await prisma.systemLog.create({
      data: { projectId, category, title, details, level },
    });
  } catch { /* non-blocking */ }
}

// ─── Tool Executors ───

async function executeCreateTask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // DUPLICATE CHECK: If task with same title exists in this project, return it
    const existing = await prisma.task.findFirst({
      where: { projectId, title: args.title },
    });
    if (existing) {
      return {
        success: true,
        data: { taskId: existing.id, title: existing.title, status: existing.status },
        message: `Task "${args.title}" already exists (ID: ${existing.id}, status: ${existing.status}). No duplicate created.`,
      };
    }

    // Get default category (Backlog)
    const category = await prisma.taskCategory.findFirst({
      where: { projectId, name: 'Backlog' },
    });

    const task = await prisma.task.create({
      data: {
        projectId,
        categoryId: category?.id || undefined,
        title: args.title,
        description: args.description || '',
        priority: args.priority || 'medium',
        taskType: args.taskType || 'feature',
        platform: args.platform || null,
        status: 'todo',
      },
    });

    // Log activity
    await prisma.taskActivity.create({
      data: { taskId: task.id, eventType: 'task_created', description: `Created by Orchestrator: ${args.title}` },
    });

    await logEvent(projectId, 'orchestrator', `Task created: ${args.title}`, JSON.stringify(task), 'action');

    return {
      success: true,
      data: { taskId: task.id, title: task.title, status: task.status },
      message: `Task "${task.title}" created successfully (ID: ${task.id})`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to create task: ${e.message}` };
  }
}

async function executeUpdateTask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const updateData: any = {};
    if (args.status) updateData.status = args.status;
    if (args.priority) updateData.priority = args.priority;
    if (args.title) updateData.title = args.title;
    if (args.description) updateData.description = args.description;

    const task = await prisma.task.update({
      where: { id: args.taskId },
      data: updateData,
    });

    // Auto-move category on status change
    if (args.status) {
      await syncTaskCategory(args.taskId, args.status);
    }

    if (args.status) {
      await prisma.taskActivity.create({
        data: { taskId: task.id, eventType: 'status_changed', description: `Orchestrator changed status to ${args.status}` },
      });
    }

    await logEvent(projectId, 'orchestrator', `Task updated: ${task.title}`, JSON.stringify({ args, result: task }), 'action');

    return {
      success: true,
      data: { taskId: task.id, title: task.title, status: task.status, priority: task.priority },
      message: `Task "${task.title}" updated successfully`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to update task: ${e.message}` };
  }
}

async function executeCreateMission(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // Get project config for working directory
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { claudeWorkDir: true, name: true },
    });

    // Inject working directory into prompt if available
    let fullPrompt = args.prompt;
    if (project?.claudeWorkDir) {
      fullPrompt = `# Working Directory: ${project.claudeWorkDir}\nPlease execute from this directory.\n\n${args.prompt}`;
    }

    const mission = await prisma.agentMission.create({
      data: {
        projectId,
        title: args.title,
        prompt: fullPrompt,
        targetService: args.targetService || 'general',
        missionType: args.missionType || 'data_pull',
        priority: args.priority || 0,
        status: 'pending',
      },
    });

    await logEvent(projectId, 'orchestrator', `Mission created: ${args.title}`, JSON.stringify(mission), 'action');

    return {
      success: true,
      data: { missionId: mission.id, title: mission.title, status: 'pending' },
      message: `Mission "${mission.title}" created and queued for bridge agent. It will be picked up on the next poll cycle.`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to create mission: ${e.message}` };
  }
}

async function executeUpdateContext(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // Get latest version
    const existing = await prisma.projectContext.findFirst({
      where: { projectId, key: args.key },
      orderBy: { version: 'desc' },
    });

    const ctx = await prisma.projectContext.create({
      data: {
        projectId,
        key: args.key,
        value: args.value,
        version: (existing?.version || 0) + 1,
        createdBy: 'orchestrator',
      },
    });

    await logEvent(projectId, 'orchestrator', `Context updated: ${args.key}`, `v${ctx.version}`, 'action');

    return {
      success: true,
      data: { key: ctx.key, version: ctx.version },
      message: `Context "${args.key}" saved (v${ctx.version})`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to update context: ${e.message}` };
  }
}

async function executeAddKnowledge(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const tagArray = args.tags
      ? (Array.isArray(args.tags) ? args.tags : args.tags.split(',').map((t: string) => t.trim())).filter(Boolean)
      : [];
    const kb = await prisma.knowledgeBase.create({
      data: {
        projectId,
        title: args.title,
        content: args.content,
        type: args.type,
        tags: JSON.stringify(tagArray),
        createdBy: 'orchestrator',
      },
    });

    await logEvent(projectId, 'orchestrator', `Knowledge added: ${args.title}`, kb.type, 'action');

    return {
      success: true,
      data: { id: kb.id, title: kb.title },
      message: `Knowledge entry "${args.title}" added to the knowledge base`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to add knowledge: ${e.message}` };
  }
}

async function executeCreateSubAgent(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // DUPLICATE CHECK: If agent with same name exists, return existing one
    const existing = await prisma.actor.findFirst({
      where: { name: args.name, type: 'AGENT' },
      include: { capabilities: true },
    });

    if (existing) {
      // If existing agent has no capabilities but new request has them, add them
      if (args.capabilities?.length && existing.capabilities.length === 0) {
        await prisma.actorCapability.createMany({
          data: args.capabilities.map((cap: string) => ({
            actorId: existing.id,
            capabilityName: cap,
            proficiencyLevel: 4,
          })),
        });
        await logEvent(projectId, 'orchestrator', `Capabilities added to existing agent: ${args.name}`, JSON.stringify({ capabilities: args.capabilities }), 'action');
        return {
          success: true,
          data: { actorId: existing.id, name: existing.name, capabilities: args.capabilities },
          message: `Agent "${args.name}" already exists — added ${args.capabilities.length} capabilities to it.`,
        };
      }

      return {
        success: true,
        data: { actorId: existing.id, name: existing.name, capabilities: existing.capabilities.map((c: any) => c.capabilityName) },
        message: `Agent "${args.name}" already exists (id: ${existing.id}). Using existing agent — no duplicate created.`,
      };
    }

    const actor = await prisma.actor.create({
      data: {
        name: args.name,
        type: 'AGENT',
        trustLevel: args.trustLevel || 'supervised',
        model: args.model || null,
      },
    });

    // Create capabilities
    if (args.capabilities?.length) {
      await prisma.actorCapability.createMany({
        data: args.capabilities.map((cap: string) => ({
          actorId: actor.id,
          capabilityName: cap,
          proficiencyLevel: 4,
        })),
      });
    }

    await logEvent(projectId, 'orchestrator', `Sub-agent created: ${args.name}`, JSON.stringify({ capabilities: args.capabilities }), 'action');

    return {
      success: true,
      data: { actorId: actor.id, name: actor.name, capabilities: args.capabilities },
      message: `Sub-agent "${args.name}" created with capabilities: ${args.capabilities?.join(', ') || 'none'}`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to create sub-agent: ${e.message}` };
  }
}

async function executeListTasks(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const where: any = { projectId };
    if (args.status && args.status !== 'all') where.status = args.status;
    if (args.platform) where.platform = args.platform;

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true, title: true, status: true, priority: true,
        platform: true, taskType: true, description: true,
        assignments: { include: { actor: { select: { name: true, type: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      success: true,
      data: tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        platform: t.platform,
        type: t.taskType,
        description: t.description?.substring(0, 200),
        assignees: t.assignments?.map((a: any) => a.actor?.name).filter(Boolean),
      })),
      message: `Found ${tasks.length} task(s)`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to list tasks: ${e.message}` };
  }
}

async function executeListMissions(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const where: any = { projectId };
    if (args.status && args.status !== 'all') where.status = args.status;

    const missions = await prisma.agentMission.findMany({
      where,
      select: {
        id: true, title: true, status: true, targetService: true,
        missionType: true, result: true, errorMessage: true,
        createdAt: true, completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      data: missions.map((m: any) => ({
        id: m.id,
        title: m.title,
        status: m.status,
        service: m.targetService,
        type: m.missionType,
        result: m.result?.substring(0, 500),
        error: m.errorMessage,
        created: m.createdAt,
        completed: m.completedAt,
      })),
      message: `Found ${missions.length} mission(s)`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to list missions: ${e.message}` };
  }
}

// ─── Assign Task ───
async function executeAssignTask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // Normalize: Gemini sometimes sends assigneeId instead of actorId
    const actorId = args.actorId || args.assigneeId || args.agentId;
    if (!actorId) {
      return { success: false, data: null, message: 'actorId is required to assign a task' };
    }

    const assignment = await prisma.taskAssignment.upsert({
      where: { taskId_actorId_role: { taskId: args.taskId, actorId, role: args.role || 'ASSIGNEE' } },
      create: { taskId: args.taskId, actorId, role: args.role || 'ASSIGNEE' },
      update: {},
    });

    const actor = await prisma.actor.findUnique({ where: { id: actorId }, select: { name: true } });
    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });

    await prisma.taskActivity.create({
      data: { taskId: args.taskId, eventType: 'assigned', description: `Orchestrator assigned ${actor?.name || 'actor'} to task` },
    });

    await logEvent(projectId, 'orchestrator', `Task assigned: ${task?.title} → ${actor?.name}`, undefined, 'action');

    return {
      success: true,
      data: { assignmentId: assignment.id },
      message: `"${actor?.name || 'Actor'}" assigned to "${task?.title || 'task'}" as ${args.role || 'ASSIGNEE'}`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to assign task: ${e.message}` };
  }
}

// ─── Create Subtask ───
async function executeCreateSubtask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const maxOrder = await prisma.subtask.aggregate({ where: { taskId: args.taskId }, _max: { order: true } });
    const subtask = await prisma.subtask.create({
      data: { taskId: args.taskId, title: args.title, order: (maxOrder._max.order || 0) + 1 },
    });

    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
    await logEvent(projectId, 'orchestrator', `Subtask created: ${args.title} (under ${task?.title})`, undefined, 'action');

    return {
      success: true,
      data: { subtaskId: subtask.id, title: subtask.title },
      message: `Subtask "${subtask.title}" created under "${task?.title || 'task'}"`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to create subtask: ${e.message}` };
  }
}

// ─── Add Comment ───
async function executeAddComment(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    // Find or create a system actor for Orchestrator comments
    let orchestratorActor = await prisma.actor.findFirst({ where: { name: 'Orchestrator', type: 'SYSTEM' } });
    if (!orchestratorActor) {
      orchestratorActor = await prisma.actor.create({
        data: { name: 'Orchestrator', type: 'SYSTEM', trustLevel: 'full' },
      });
    }

    const comment = await prisma.comment.create({
      data: { taskId: args.taskId, actorId: orchestratorActor.id, content: args.content },
    });

    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
    await logEvent(projectId, 'orchestrator', `Comment added on: ${task?.title}`, args.content.substring(0, 200), 'action');

    return {
      success: true,
      data: { commentId: comment.id },
      message: `Comment added to "${task?.title || 'task'}"`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to add comment: ${e.message}` };
  }
}

// ─── Approve/Reject Task ───
async function executeApproveReject(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    let orchestratorActor = await prisma.actor.findFirst({ where: { name: 'Orchestrator', type: 'SYSTEM' } });
    if (!orchestratorActor) {
      orchestratorActor = await prisma.actor.create({
        data: { name: 'Orchestrator', type: 'SYSTEM', trustLevel: 'full' },
      });
    }

    const decision = await prisma.decision.create({
      data: {
        taskId: args.taskId,
        actorId: orchestratorActor.id,
        decisionType: args.decisionType,
        title: args.title,
        decision: args.decision,
        rationale: args.rationale || null,
      },
    });

    // Update task status based on decision
    const statusMap: Record<string, string> = { APPROVAL: 'done', REJECTION: 'todo', REDIRECT: 'in_progress' };
    const newStatus = statusMap[args.decisionType] || 'todo';
    const task = await prisma.task.update({ where: { id: args.taskId }, data: { status: newStatus } });

    await prisma.taskActivity.create({
      data: { taskId: args.taskId, eventType: 'decision_made', description: `Orchestrator ${args.decisionType.toLowerCase()}: ${args.title}` },
    });

    await logEvent(projectId, 'orchestrator', `Decision: ${args.decisionType} on ${task.title}`, args.decision, 'action');

    return {
      success: true,
      data: { decisionId: decision.id, newStatus },
      message: `${args.decisionType} recorded for "${task.title}". Status → ${newStatus}`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to record decision: ${e.message}` };
  }
}

// ─── Delete Task ───
async function executeDeleteTask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });
    if (!task) return { success: false, data: null, message: 'Task not found' };

    await prisma.task.delete({ where: { id: args.taskId } });
    await logEvent(projectId, 'orchestrator', `Task deleted: ${task.title}`, undefined, 'action');

    return { success: true, data: null, message: `Task "${task.title}" deleted` };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to delete task: ${e.message}` };
  }
}

// ─── Enqueue Task ───
async function executeEnqueueTask(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const queueItem = await prisma.agentQueue.create({
      data: { taskId: args.taskId, priority: args.priority || 0, status: 'WAITING' },
    });

    const task = await prisma.task.findUnique({ where: { id: args.taskId }, select: { title: true } });

    await prisma.taskActivity.create({
      data: { taskId: args.taskId, eventType: 'queued', description: 'Orchestrator enqueued task for agent processing' },
    });

    await logEvent(projectId, 'orchestrator', `Task enqueued: ${task?.title}`, undefined, 'action');

    // SYNCHRONOUS: Run sub-agent and wait for result — Captain MUST see the real outcome
    try {
      await triggerSubAgentWorker(queueItem.id);

      // Reload queue item to get the result
      const completed = await prisma.agentQueue.findUnique({
        where: { id: queueItem.id },
        select: { status: true, result: true },
      });

      if (completed?.status === 'COMPLETED') {
        const resultData = completed.result ? JSON.parse(completed.result) : {};
        const report = resultData.summary || 'No summary provided.';
        return {
          success: true,
          data: { queueItemId: queueItem.id },
          message: `SUB-AGENT REPORT — YOU MUST relay this to the user:\n\nTask: "${task?.title}"\nStatus: COMPLETED\nSteps: ${resultData.steps || '?'}\n\n--- AGENT FINDINGS ---\n${report}\n--- END REPORT ---\n\nIMPORTANT: Present this report to the user in your own words. Evaluate whether the work was successful or if there were issues. Then decide: approve_reject_task with APPROVAL or REJECTION.`,
        };
      } else {
        const resultData = completed?.result ? JSON.parse(completed.result) : {};
        return {
          success: false,
          data: { queueItemId: queueItem.id, status: completed?.status },
          message: `SUB-AGENT FAILED — YOU MUST tell the user:\n\nTask: "${task?.title}"\nStatus: FAILED\nError: ${resultData.error || 'Unknown'}\n\nTell the user what went wrong. Suggest a fix. Call approve_reject_task with REJECTION.`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        data: { queueItemId: queueItem.id },
        message: `SUB-AGENT CRASHED — Tell the user: Task "${task?.title}" failed with error: ${err.message}. The task is blocked.`,
      };
    }
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to enqueue task: ${e.message}` };
  }
}

// ─── Search Knowledge ───
async function executeSearchKnowledge(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const where: any = { projectId };
    if (args.type && args.type !== 'all') where.type = args.type;

    let entries = await prisma.knowledgeBase.findMany({
      where,
      select: { id: true, title: true, content: true, type: true, tags: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Filter by query keyword if provided
    if (args.query) {
      const q = args.query.toLowerCase();
      entries = entries.filter((e: any) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t: string) => t.toLowerCase().includes(q))
      );
    }

    return {
      success: true,
      data: entries.map((e: any) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        tags: e.tags,
        content: e.content.substring(0, 500),
      })),
      message: `Found ${entries.length} knowledge entry(s)`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to search knowledge: ${e.message}` };
  }
}

// ─── Send Notification ───
async function executeSendNotification(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
    if (!project) return { success: false, data: null, message: 'Project not found' };

    const notif = await prisma.notification.create({
      data: {
        userId: project.ownerId,
        title: args.title,
        message: args.message,
        type: args.type || 'info',
        link: args.link || `/projects/${projectId}`,
      },
    });

    await logEvent(projectId, 'orchestrator', `Notification sent: ${args.title}`, args.message, 'action');

    return {
      success: true,
      data: { notificationId: notif.id },
      message: `Notification "${args.title}" sent to project owner`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to send notification: ${e.message}` };
  }
}

// ─── Get Mission Result ───
async function executeGetMissionResult(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const mission = await prisma.agentMission.findUnique({
      where: { id: args.missionId },
      select: { id: true, title: true, status: true, result: true, logs: true, errorMessage: true, targetService: true, missionType: true, createdAt: true, completedAt: true },
    });

    if (!mission) return { success: false, data: null, message: 'Mission not found' };

    return {
      success: true,
      data: {
        id: mission.id,
        title: mission.title,
        status: mission.status,
        service: mission.targetService,
        type: mission.missionType,
        result: mission.result,
        logs: mission.logs,
        error: mission.errorMessage,
        created: mission.createdAt,
        completed: mission.completedAt,
      },
      message: `Mission "${mission.title}" — ${mission.status}`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to get mission: ${e.message}` };
  }
}

// ─── List Agents ───
async function executeListAgents(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const where: any = { isActive: true };
    if (args.type && args.type !== 'all') where.type = args.type;

    const actors = await prisma.actor.findMany({
      where,
      select: {
        id: true, name: true, type: true, email: true, trustLevel: true,
        capabilities: { select: { capabilityName: true, proficiencyLevel: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: actors.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        email: a.email,
        trustLevel: a.trustLevel,
        capabilities: a.capabilities.map((c: any) => `${c.capabilityName} (${c.proficiencyLevel}/5)`),
      })),
      message: `Found ${actors.length} actor(s)`,
    };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to list agents: ${e.message}` };
  }
}

// ─── Delete Knowledge ───
async function executeDeleteKnowledge(projectId: string, args: any): Promise<ToolCallResult> {
  try {
    const entry = await prisma.knowledgeBase.findUnique({ where: { id: args.knowledgeId } });
    if (!entry) return { success: false, data: null, message: 'Knowledge entry not found' };
    if (entry.projectId !== projectId) return { success: false, data: null, message: 'Entry belongs to a different project' };
    await prisma.knowledgeBase.delete({ where: { id: args.knowledgeId } });
    await logEvent(projectId, 'orchestrator', `Knowledge deleted: ${entry.title}`, undefined, 'action');
    return { success: true, data: null, message: `Knowledge entry "${entry.title}" deleted` };
  } catch (e: any) {
    return { success: false, data: null, message: `Failed to delete knowledge: ${e.message}` };
  }
}

// ─── Main Executor ───
export async function executeToolCall(
  projectId: string,
  toolName: string,
  args: any
): Promise<ToolCallResult> {
  switch (toolName) {
    case 'create_task': return executeCreateTask(projectId, args);
    case 'update_task': return executeUpdateTask(projectId, args);
    case 'create_mission': return executeCreateMission(projectId, args);
    case 'update_context': return executeUpdateContext(projectId, args);
    case 'add_knowledge': return executeAddKnowledge(projectId, args);
    case 'create_sub_agent': return executeCreateSubAgent(projectId, args);
    case 'list_tasks': return executeListTasks(projectId, args);
    case 'list_missions': return executeListMissions(projectId, args);
    case 'assign_task': return executeAssignTask(projectId, args);
    case 'create_subtask': return executeCreateSubtask(projectId, args);
    case 'add_comment': return executeAddComment(projectId, args);
    case 'approve_reject_task': return executeApproveReject(projectId, args);
    case 'delete_task': return executeDeleteTask(projectId, args);
    case 'enqueue_task': return executeEnqueueTask(projectId, args);
    case 'search_knowledge': return executeSearchKnowledge(projectId, args);
    case 'send_notification': return executeSendNotification(projectId, args);
    case 'get_mission_result': return executeGetMissionResult(projectId, args);
    case 'list_agents': return executeListAgents(projectId, args);
    case 'delete_knowledge': return executeDeleteKnowledge(projectId, args);
    default:
      return { success: false, data: null, message: `Unknown tool: ${toolName}` };
  }
}
