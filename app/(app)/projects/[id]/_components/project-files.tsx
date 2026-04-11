'use client';
import { useEffect, useState } from 'react';
import { Folder, FolderOpen, FileText, File, FileCode, FileImage, Loader2, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

type FileNode = {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileNode[];
};

function formatBytes(bytes: number = 0, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return <File className="h-4 w-4 text-slate-400" />;
  if (['md', 'txt', 'csv'].includes(ext)) return <FileText className="h-4 w-4 text-blue-400" />;
  if (['js', 'ts', 'jsx', 'tsx', 'py'].includes(ext)) return <FileCode className="h-4 w-4 text-yellow-400" />;
  if (['png', 'jpg', 'jpeg', 'svg'].includes(ext)) return <FileImage className="h-4 w-4 text-emerald-400" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

function FileTreeItem({ node, depth = 0 }: { node: FileNode, depth?: number }) {
  const [isOpen, setIsOpen] = useState(depth < 1); // Auto open root level
  const isDir = node.type === 'directory';

  return (
    <div className="flex flex-col">
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 hover:bg-white/5 rounded-md cursor-pointer select-none group transition-colors",
          isDir ? "text-slate-200" : "text-slate-400 hover:text-slate-100"
        )}
        style={{ paddingLeft: `${depth * 1.2 + 0.5}rem` }}
        onClick={() => isDir && setIsOpen(!isOpen)}
      >
        <div className="flex-shrink-0">
          {isDir ? (
            isOpen ? <FolderOpen className="h-4 w-4 text-indigo-400" /> : <Folder className="h-4 w-4 text-indigo-500" />
          ) : (
            getFileIcon(node.name)
          )}
        </div>
        <span className="text-sm truncate flex-1">{node.name}</span>
        {!isDir && node.size !== undefined && (
          <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatBytes(node.size)}
          </span>
        )}
      </div>
      
      {isDir && isOpen && node.children && (
        <div className="flex flex-col">
          {node.children.map((child, i) => (
            <FileTreeItem key={`${child.path}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectFiles({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/files`)
      .then(r => r.json())
      .then(d => setFiles(d.files || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <HardDrive className="h-4 w-4 text-indigo-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Workspace Explorer</h3>
          <p className="text-[10px] text-slate-400">Isolated directory: /workspaces/{projectId}</p>
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-[#0d0d0d] overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mb-2 text-indigo-500" />
            <span className="text-xs">Scanning workspace...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FolderOpen className="h-8 w-8 mb-3 opacity-20" />
            <span className="text-sm text-slate-300">Workspace is empty</span>
            <span className="text-xs opacity-50 mt-1">Files created by agent will appear here</span>
          </div>
        ) : (
          <div className="py-2">
            {files.map((node, i) => (
              <FileTreeItem key={`${node.path}-${i}`} node={node} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
