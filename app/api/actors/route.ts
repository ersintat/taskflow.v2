export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const actors = await prisma.actor.findMany({
      orderBy: { createdAt: 'desc' },
      include: { capabilities: true },
    });
    return NextResponse.json(actors);
  } catch (err: any) {
    console.error('GET /api/actors error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { name, type, email, trustLevel, capabilities } = body ?? {};
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const actor = await prisma.actor.create({
      data: {
        name: name.trim(),
        type: type ?? 'HUMAN',
        email: email?.trim() || null,
        trustLevel: trustLevel ?? 'SUPERVISED',
      },
    });

    // Create capabilities
    if (Array.isArray(capabilities) && capabilities.length > 0) {
      await prisma.actorCapability.createMany({
        data: capabilities.map((c: any) => ({
          actorId: actor.id,
          capabilityName: c.name ?? c,
          proficiencyLevel: c.level ?? 3,
        })),
      });
    }

    const result = await prisma.actor.findUnique({
      where: { id: actor.id },
      include: { capabilities: true },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/actors error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
