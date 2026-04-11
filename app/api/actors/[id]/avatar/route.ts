export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

// POST /api/actors/:id/avatar — upload profile photo
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('avatar') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use PNG, JPG, WebP, GIF, or SVG.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 2MB.' }, { status: 400 });
  }

  const actor = await prisma.actor.findUnique({ where: { id: params.id } });
  if (!actor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? ext : 'png';
  const filename = `${params.id}.${safeExt}`;

  const avatarDir = path.join(process.cwd(), 'public', 'avatars');
  await mkdir(avatarDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(avatarDir, filename), buffer);

  const avatarUrl = `/avatars/${filename}?t=${Date.now()}`;

  await prisma.actor.update({
    where: { id: params.id },
    data: { avatarUrl },
  });

  return NextResponse.json({ avatarUrl });
}

// DELETE /api/actors/:id/avatar — remove profile photo
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await prisma.actor.update({
    where: { id: params.id },
    data: { avatarUrl: null },
  });

  return NextResponse.json({ success: true });
}
