// User-facing labels for the internal RBAC role names. The backend keeps the
// original role identifiers (platform_owner / super_admin / management_admin /
// sales_manager / sdr); this is the single place the UI translates them to the
// product's terminology. Change a label here and it updates everywhere.
import type { UserRole } from '@/hooks/useAuth';

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_owner: 'Platform Owner',
  super_admin: 'Super Admin',
  management_admin: 'Admin (Management)',
  sales_manager: 'Team Manager',
  sdr: 'Account Executive',
};

// One-line description of what each role can do, shown next to role selectors.
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  platform_owner: 'Cross-company operator — manages every workspace.',
  super_admin: 'Full control of this company: create, edit, delete, transfer.',
  management_admin: 'Company-wide view only — cannot create, edit, or transfer.',
  sales_manager: 'Runs a team: manages its members and their work.',
  sdr: 'Individual contributor working their own leads and pipeline.',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role as UserRole] ?? role;
}

// Roles a company admin can assign to a user (platform_owner is never assignable
// from inside a company).
export const ASSIGNABLE_ROLES: UserRole[] = [
  'super_admin',
  'management_admin',
  'sales_manager',
  'sdr',
];
