import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type FileNode = {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileNode[];
};

function readDirRecursive(dirPath: string, basePath: string): FileNode[] {
  const result: FileNode[] = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.name === '.git' || item.name === 'node_modules' || item.name === '.DS_Store') continue;

      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(basePath, fullPath);
      const stats = fs.statSync(fullPath);

      if (item.isDirectory()) {
        result.push({
          name: item.name,
          type: "directory",
          path: relativePath,
          children: readDirRecursive(fullPath, basePath),
        });
      } else {
        result.push({
          name: item.name,
          type: "file",
          path: relativePath,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Error reading dir", e);
  }
  
  // Sort: directories first, then files alphabetically
  return result.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "directory" ? -1 : 1;
  });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workspacePath = path.join(process.cwd(), "workspaces", params.id);
    if (!fs.existsSync(workspacePath)) {
      return NextResponse.json({ files: [] });
    }

    const files = readDirRecursive(workspacePath, workspacePath);
    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read workspace directory" },
      { status: 500 }
    );
  }
}
