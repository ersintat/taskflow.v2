export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/notifications — list user notifications
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions) as any;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

  const where: any = { userId: session.user.id };
  if (unreadOnly) where.read = false;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

// POST /api/notifications — create a notification (internal use)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions) as any;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, message, type, link, userId } = body;

  if (!title || !message) {
    return NextResponse.json({ error: 'Title and message required' }, { status: 400 });
  }

  const notification = await prisma.notification.create({
    data: {
      userId: userId || session.user.id,
      title,
      message,
      type: type || 'info',
      link: link || null,
    },
  });

  return NextResponse.json(notification, { status: 201 });
}

// PATCH /api/notifications — mark all as read
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions) as any;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, notificationId } = body;

  if (action === 'mark_all_read') {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'mark_read' && notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: session.user.id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'mark_unread' && notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: session.user.id },
      data: { read: false },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE /api/notifications — delete a notification
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions) as any;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    await prisma.notification.deleteMany({
      where: { id, userId: session.user.id },
    });
  } else {
    // Delete all read notifications
    await prisma.notification.deleteMany({
      where: { userId: session.user.id, read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
