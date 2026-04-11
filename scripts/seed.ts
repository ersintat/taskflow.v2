import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing old data and seeding database...');

  // Reset db tables locally
  await prisma.agentQueue.deleteMany({});
  await prisma.decision.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.taskActivity.deleteMany({});
  await prisma.taskAssignment.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.taskCategory.deleteMany({});
  await prisma.projectContext.deleteMany({});
  await prisma.knowledgeBase.deleteMany({});
  await prisma.agentMission.deleteMany({});
  await prisma.project.deleteMany({});

  // Seed admin user
  const passwordHash = await bcrypt.hash('Psns*2167', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'ersintat@gmail.com' },
    update: { passwordHash, name: 'Ersin Tat' },
    create: {
      email: 'ersintat@gmail.com',
      passwordHash,
      name: 'Ersin Tat',
      role: 'admin',
    },
  });
  console.log('Admin user seeded:', adminUser.id);

  // Seed actors
  const actor1 = await prisma.actor.upsert({
    where: { id: 'actor-human-1' },
    update: {},
    create: {
      id: 'actor-human-1',
      name: 'Sarah Chen',
      type: 'HUMAN',
      email: 'sarah@company.com',
      trustLevel: 'FULL',
    },
  });

  const actor2 = await prisma.actor.upsert({
    where: { id: 'actor-human-2' },
    update: {},
    create: {
      id: 'actor-human-2',
      name: 'Mike Ross',
      type: 'HUMAN',
      email: 'mike@company.com',
      trustLevel: 'FULL',
    },
  });

  const actor3 = await prisma.actor.upsert({
    where: { id: 'actor-agent-1' },
    update: {},
    create: {
      id: 'actor-agent-1',
      name: 'CodeBot',
      type: 'AGENT',
      trustLevel: 'SUPERVISED',
    },
  });

  const actor4 = await prisma.actor.upsert({
    where: { id: 'actor-system-1' },
    update: {},
    create: {
      id: 'actor-system-1',
      name: 'System',
      type: 'SYSTEM',
      trustLevel: 'FULL',
    },
  });

  // Seed project
  const project1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Complete redesign of the company website with modern UI and improved performance.',
      status: 'active',
      ownerId: adminUser.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile App v2',
      description: 'Build the next version of our mobile application with new features.',
      status: 'active',
      ownerId: adminUser.id,
    },
  });

  // Categories for project 1
  const p1Backlog = await prisma.taskCategory.create({ data: { projectId: project1.id, name: 'Backlog', color: '#6b7280', order: 0 } });
  const p1Progress = await prisma.taskCategory.create({ data: { projectId: project1.id, name: 'In Progress', color: '#3b82f6', order: 1 } });
  const p1Review = await prisma.taskCategory.create({ data: { projectId: project1.id, name: 'Review', color: '#f59e0b', order: 2 } });
  const p1Done = await prisma.taskCategory.create({ data: { projectId: project1.id, name: 'Done', color: '#10b981', order: 3 } });

  // Categories for project 2
  const p2Backlog = await prisma.taskCategory.create({ data: { projectId: project2.id, name: 'Backlog', color: '#6b7280', order: 0 } });
  const p2Progress = await prisma.taskCategory.create({ data: { projectId: project2.id, name: 'In Progress', color: '#3b82f6', order: 1 } });
  
  // Tasks for project 1
  const t1 = await prisma.task.create({ data: { projectId: project1.id, categoryId: p1Progress.id, title: 'Design new homepage layout', status: 'in_progress', priority: 'high', taskType: 'action', createdBy: adminUser.id } });
  const t2 = await prisma.task.create({ data: { projectId: project1.id, categoryId: p1Progress.id, title: 'Implement responsive navigation', status: 'in_progress', priority: 'high', taskType: 'action', createdBy: adminUser.id } });
  
  // Tasks for project 2
  const t3 = await prisma.task.create({ data: { projectId: project2.id, categoryId: p2Backlog.id, title: 'User authentication flow', status: 'todo', priority: 'high', taskType: 'action', createdBy: adminUser.id } });

  // Task assignments
  await prisma.taskAssignment.create({ data: { taskId: t1.id, actorId: actor1.id, role: 'ASSIGNEE' } });
  await prisma.taskAssignment.create({ data: { taskId: t2.id, actorId: actor3.id, role: 'ASSIGNEE' } });

  console.log('Seeding complete! Projects have dynamic IDs now.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
