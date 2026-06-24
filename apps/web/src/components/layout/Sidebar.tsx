import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Target,
  FileText,
  MessageSquare,
  BarChart3,
  Network,
  UserCog,
  ScrollText,
  Sparkles,
  Settings,
  Flame,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, type UserRole } from '@/hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/prospecting', label: 'Prospecting', icon: Radar },
  { to: '/opportunities', label: 'Pipeline', icon: Target },
  { to: '/excel', label: 'Daily Ritual', icon: Flame },
  { to: '/drafts', label: 'Drafts', icon: FileText },
  { to: '/replies', label: 'Replies', icon: MessageSquare },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/teams', label: 'Teams', icon: Network, roles: ['super_admin', 'management_admin', 'sales_manager'] },
  { to: '/users', label: 'Users', icon: UserCog, roles: ['super_admin', 'management_admin', 'sales_manager'] },
  { to: '/prompts', label: 'AI Prompts', icon: Sparkles, roles: ['super_admin', 'management_admin', 'sales_manager'] },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, roles: ['super_admin', 'management_admin', 'sales_manager'] },
  { to: '/settings', label: 'Company', icon: Settings, roles: ['super_admin', 'management_admin'] },
  { to: '/platform', label: 'Platform', icon: ShieldCheck, roles: ['platform_owner'] },
];

export function Sidebar() {
  const { user } = useAuth();
  const role = user?.role;
  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
          <Megaphone className="h-4 w-4" />
        </div>
        <span className="font-semibold">Outreach</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
