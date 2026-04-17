export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/sidebar — lightweight project list with unread counts
// Query param: lastVisited = JSON object { projectId: ISO timestamp }
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse last visited timestamps from query
    const lastVisitedParam = req.nextUrl.searchParams.get('lastVisited');
    let lastVisited: Record<string, string> = {};
    try {
      if (lastVisitedParam) lastVisited = JSON.parse(lastVisitedParam);
    } catch { /* ignore parse errors */ }

    const projects = await prisma.project.findMany({
      where: { status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, color: true },
    });

    // Count unread messages per project (assistant messages after last visit)
    const projectsWithUnread = await Promise.all(
      projects.map(async (p) => {
        const lastSeen = lastVisited[p.id] ? new Date(lastVisited[p.id]) : null;
        let unread = 0;
        if (lastSeen) {
          unread = await prisma.orchestratorChat.count({
            where: {
              projectId: p.id,
              role: 'assistant',
              createdAt: { gt: lastSeen },
            },
          });
        }
        return { ...p, unread };
      })
    );

    return NextResponse.json({ projects: projectsWithUnread });
  } catch (e: any) {
    console.error('[sidebar-projects]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
