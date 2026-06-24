import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { roleLabel } from '@/lib/roleLabels';

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-5">
      <div className="text-sm text-muted-foreground">
        {user?.companyId ? 'Company workspace' : ''}
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{user.name}</span>
            <Badge variant="secondary">{roleLabel(user.role)}</Badge>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
