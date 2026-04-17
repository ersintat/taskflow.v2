'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ChevronRight,
  Workflow,
  Layers,
  Settings,
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ScrollText,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/queue', label: 'Agent Queue', icon: Layers },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings/logs', label: 'System Logs', icon: ScrollText },
];

const NOTIF_ICONS: Record<string, any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};
const NOTIF_COLORS: Record<string, string> = {
  info: 'text-blue-500',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
};

interface SidebarProject {
  id: string;
  name: string;
  color: string;
  unread: number;
}

export function AppShellClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [sidebarProjects, setSidebarProjects] = useState<SidebarProject[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession() || {};
  const userName = session?.user?.name ?? 'User';
  const userImage = (session?.user as any)?.image ?? null;
  const userInitials = userName
    .split(' ')
    .map((w: string) => w?.[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // --- Sidebar Projects + Unread Tracking ---
  const fetchSidebarProjects = useCallback(() => {
    try {
      const stored = localStorage.getItem('projectLastVisited');
      const lastVisited = stored ? JSON.parse(stored) : {};
      fetch(`/api/projects/sidebar?lastVisited=${encodeURIComponent(JSON.stringify(lastVisited))}`)
        .then((r) => r.json())
        .then((d: any) => { if (d.projects) setSidebarProjects(d.projects); })
        .catch((e) => console.error('[sidebar-projects]', e));
    } catch { /* localStorage error */ }
  }, []);

  // Track last visited project
  useEffect(() => {
    const match = pathname?.match(/^\/projects\/([a-z0-9]+)/i);
    if (match) {
      const projectId = match[1];
      try {
        const stored = localStorage.getItem('projectLastVisited');
        const lastVisited = stored ? JSON.parse(stored) : {};
        lastVisited[projectId] = new Date().toISOString();
        localStorage.setItem('projectLastVisited', JSON.stringify(lastVisited));
        // Clear unread for this project immediately in UI
        setSidebarProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, unread: 0 } : p));
      } catch { /* localStorage error */ }
    }
  }, [pathname]);

  useEffect(() => {
    fetchSidebarProjects();
    const interval = setInterval(fetchSidebarProjects, 30000);
    return () => clearInterval(interval);
  }, [fetchSidebarProjects]);

  const fetchNotifications = useCallback(() => {
    fetch('/api/notifications?limit=20')
      .then((r) => r.json())
      .then((d: any) => {
        setNotifications(d.notifications ?? []);
        setUnreadCount(d.unreadCount ?? 0);
      })
      .catch((e) => console.error('[app_shell_client]', e));
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    fetchNotifications();
  };

  const markRead = async (id: string) => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', notificationId: id }),
    });
    fetchNotifications();
  };

  const deleteNotif = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
    fetchNotifications();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[290px] flex flex-col bg-card border-r border-border transition-transform duration-normal lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-14 border-b border-border shrink-0">
          <img src="/logo.svg" alt="PSNS" className="h-7 w-7 rounded-lg" />
          <span className="font-display font-bold text-lg tracking-tight">PSNS Taskflow <span style={{ fontSize: '1.15em' }}>🧿</span></span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((item: any) => {
            // Projects gets special treatment — collapsible sub-menu
            if (item.href === '/projects') {
              const isProjectsActive = pathname?.startsWith('/projects');
              const totalUnread = sidebarProjects.reduce((sum, p) => sum + p.unread, 0);
              return (
                <div key={item.href}>
                  <div className="flex items-center">
                    <button
                      onClick={() => setProjectsExpanded(!projectsExpanded)}
                      className="flex items-center justify-center h-8 w-6 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', projectsExpanded && 'rotate-90')} />
                    </button>
                    <Link
                      href="/projects"
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors flex-1',
                        isProjectsActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                      {totalUnread > 0 && (
                        <span className="ml-auto h-5 min-w-[20px] rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1.5">
                          {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                      )}
                    </Link>
                  </div>
                  {projectsExpanded && (
                    <div className="ml-6 mt-0.5 space-y-0.5">
                      {sidebarProjects.map((project) => {
                        const isThisProject = pathname === `/projects/${project.id}`;
                        return (
                          <Link
                            key={project.id}
                            href={`/projects/${project.id}`}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                              isThisProject
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: project.color || '#6366f1' }}
                            />
                            <span className="truncate flex-1">{project.name}</span>
                            {project.unread > 0 && (
                              <span className="h-4.5 min-w-[18px] rounded-full bg-primary/90 text-[9px] font-bold text-primary-foreground flex items-center justify-center px-1">
                                {project.unread > 99 ? '99+' : project.unread}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 space-y-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors text-left">
                {userImage ? (
                  <img src={userImage} alt={userName} className="h-7 w-7 rounded-full object-cover shrink-0 border border-border" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                    {userInitials}
                  </div>
                )}
                <span className="truncate flex-1 font-medium">{userName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="border-t border-border pt-2 px-3">
            <p className="text-[10px] text-muted-foreground/60 text-center italic">The Project that Sun Never Sets 🌞❤️</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-card/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden mr-3"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-display font-semibold text-base tracking-tight capitalize flex-1">
            {pathname === '/' ? 'Dashboard' : pathname?.split('/')?.[1]?.replace(/-/g, ' ') ?? ''}
          </h1>

          <ThemeToggle />

          {/* Notification Bell */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              onClick={() => setNotifOpen(!notifOpen)}
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>

            {/* Notification Dropdown */}
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-card border border-border rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <CheckCheck className="h-3 w-3" /> Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <Bell className="h-8 w-8 mb-2" />
                        <p className="text-sm">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((n: any) => {
                        const IconComp = NOTIF_ICONS[n.type] || Info;
                        const iconColor = NOTIF_COLORS[n.type] || 'text-blue-500';
                        return (
                          <div
                            key={n.id}
                            className={cn(
                              'flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer group border-b border-border/50 last:border-b-0',
                              !n.read && 'bg-primary/5'
                            )}
                            onClick={() => {
                              markRead(n.id);
                              if (n.link) { router.push(n.link); setNotifOpen(false); }
                            }}
                          >
                            <div className={cn('mt-0.5 shrink-0', iconColor)}>
                              <IconComp className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={cn('text-sm truncate', !n.read && 'font-semibold')}>{n.title}</p>
                                {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteNotif(n.id); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
