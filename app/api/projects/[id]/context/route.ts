export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/projects/:id/context — list latest version of each key
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get all contexts for this project
    const allContexts = await prisma.projectContext.findMany({
      where: { projectId: params.id },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });

    // Group by key, take latest version
    const latest = new Map<string, any>();
    for (const ctx of allContexts) {
      if (!latest.has(ctx.key)) {
        latest.set(ctx.key, ctx);
      }
    }

    return NextResponse.json(Array.from(latest.values()));
  } catch (err: any) {
    console.error('GET /api/projects/[id]/context error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
