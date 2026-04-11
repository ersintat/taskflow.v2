import { prisma } from '@/lib/db';

export interface ProjectSnapshot {
  project: {
    name: string;
    description: string | null;
    status: string;
    claudeWorkDir: string | null;
    autoMission: boolean;
  } | null;
  taskSummary: string;
  totalTasks: number;
  missionSummary: string;
  contextSummary: string;
  knowledgeSummary: string;
  agentSummary: string;
}

export async function getProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const [project, tasks, missions, contexts, knowledge, agents] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, description: true, status: true, claudeWorkDir: true, autoMission: true },
    }),
    prisma.task.findMany({
      where: { projectId },
      select: {
        id: true, title: true, status: true, priority: true,
        platform: true, taskType: true, description: true,
        assignments: { select: { actor: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.agentMission.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true, title: true, status: true, targetService: true,
        missionType: true, result: true, errorMessage: true, createdAt: true,
      },
    }),
    prisma.projectContext.findMany({
      where: { projectId },
      select: { key: true, value: true, version: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.knowledgeBase.findMany({
      where: { projectId },
      select: { title: true, content: true, type: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.actor.findMany({
      where: { isActive: true, type: { in: ['AGENT', 'SYSTEM'] } },
      select: {
        id: true, name: true, type: true, trustLevel: true,
        capabilities: { select: { capabilityName: true, proficiencyLevel: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  // --- Format task summary (adaptive based on count) ---
  const totalTasks = tasks.length;
  let taskSummary: string;

  if (totalTasks === 0) {
    taskSummary = 'No tasks yet. This appears to be a new or empty project.';
  } else {
    const statusCounts: Record<string, number> = {};
    const blockedTasks: typeof tasks = [];
    const urgentTasks: typeof tasks = [];

    for (const t of tasks) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      if (t.status === 'blocked') blockedTasks.push(t);
      if (t.priority === 'urgent') urgentTasks.push(t);
    }

    const statusLine = Object.entries(statusCounts)
      .map(([s, c]) => `${s}: ${c}`)
      .join(' | ');

    if (totalTasks < 20) {
      // List all tasks
      const taskLines = tasks.map(t => {
        const assignees = t.assignments?.map((a: any) => a.actor?.name).filter(Boolean).join(', ');
        return `- [${t.status}] (${t.priority}) ${t.title}${t.platform ? ` [${t.platform}]` : ''}${assignees ? ` → ${assignees}` : ''} {id: ${t.id}}`;
      });
      taskSummary = `Total: ${totalTasks} (${statusLine})\n${taskLines.join('\n')}`;
    } else if (totalTasks < 50) {
      // Summary + blocked/urgent details
      const criticalLines = [...blockedTasks, ...urgentTasks]
        .slice(0, 10)
        .map(t => `- [${t.status}] (${t.priority}) ${t.title} {id: ${t.id}}`);
      taskSummary = `Total: ${totalTasks} (${statusLine})\n\nAttention Required:\n${criticalLines.length > 0 ? criticalLines.join('\n') : 'None'}`;
    } else {
      // Counts only + blocked
      const blockedLines = blockedTasks.slice(0, 5).map(t => `- ${t.title} {id: ${t.id}}`);
      taskSummary = `Total: ${totalTasks} (${statusLine})\n\nBlocked Items (${blockedTasks.length}):\n${blockedLines.length > 0 ? blockedLines.join('\n') : 'None'}`;
    }
  }

  // --- Format mission summary ---
  let missionSummary: string;
  if (missions.length === 0) {
    missionSummary = 'No missions created yet.';
  } else {
    const missionLines = missions.map(m => {
      let line = `- [${m.status}] ${m.title} (${m.targetService}) {id: ${m.id}}`;
      if (m.status === 'completed' && m.result) line += `\n  Result: ${m.result.substring(0, 200)}`;
      if (m.status === 'failed' && m.errorMessage) line += `\n  Error: ${m.errorMessage}`;
      return line;
    });
    missionSummary = missionLines.join('\n');
  }

  // --- Format context summary (latest version per key) ---
  const latestContexts = new Map<string, { key: string; value: string; version: number }>();
  for (const c of contexts) {
    if (!latestContexts.has(c.key)) latestContexts.set(c.key, c);
  }

  let contextSummary: string;
  if (latestContexts.size === 0) {
    contextSummary = 'No project context saved yet.';
  } else {
    const contextLines = Array.from(latestContexts.values()).map(
      c => `### ${c.key} (v${c.version})\n${c.value?.substring(0, 400)}`
    );
    contextSummary = contextLines.join('\n\n');
  }

  // --- Format knowledge summary ---
  let knowledgeSummary: string;
  if (knowledge.length === 0) {
    knowledgeSummary = 'No knowledge entries yet.';
  } else {
    const knowledgeLines = knowledge.map(
      k => `- [${k.type}] ${k.title}: ${k.content?.substring(0, 150)}`
    );
    knowledgeSummary = knowledgeLines.join('\n');
  }

  // --- Format agent summary ---
  let agentSummary: string;
  if (agents.length === 0) {
    agentSummary = 'No sub-agents created yet.';
  } else {
    const agentLines = agents.map(a => {
      const caps = a.capabilities?.map((c: any) => `${c.capabilityName}(${c.proficiencyLevel})`).join(', ');
      return `- ${a.name} [id: ${a.id}] (${a.type}, trust: ${a.trustLevel})${caps ? ` — Skills: ${caps}` : ' — No skills defined'}`;
    });
    agentSummary = agentLines.join('\n');
  }

  return {
    project,
    taskSummary,
    totalTasks,
    missionSummary,
    contextSummary,
    knowledgeSummary,
    agentSummary,
  };
}
