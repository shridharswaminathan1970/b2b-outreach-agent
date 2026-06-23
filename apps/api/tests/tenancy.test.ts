// Unit tests for the pure RBAC capability + scoping helpers (no DB calls).
import { describe, it, expect } from 'vitest';
import {
  isCompanyWide,
  canWrite,
  canReassign,
  scopeWhere,
  type Actor,
} from '../src/utils/tenancy';

const actor = (role: Actor['role'], teamId: string | null = 'team-1'): Actor => ({
  id: 'u1',
  role,
  companyId: 'co-1',
  teamId,
});

describe('role capabilities', () => {
  it('isCompanyWide is true only for super_admin / management_admin', () => {
    expect(isCompanyWide('super_admin')).toBe(true);
    expect(isCompanyWide('management_admin')).toBe(true);
    expect(isCompanyWide('sales_manager')).toBe(false);
    expect(isCompanyWide('sdr')).toBe(false);
  });

  it('canWrite is true only for super_admin / sales_manager', () => {
    expect(canWrite('super_admin')).toBe(true);
    expect(canWrite('sales_manager')).toBe(true);
    expect(canWrite('management_admin')).toBe(false); // view-only
    expect(canWrite('sdr')).toBe(false);
  });

  it('canReassign includes sdr but not the view-only management_admin', () => {
    expect(canReassign('super_admin')).toBe(true);
    expect(canReassign('sales_manager')).toBe(true);
    expect(canReassign('sdr')).toBe(true);
    expect(canReassign('management_admin')).toBe(false);
  });
});

describe('scopeWhere', () => {
  it('company-wide roles are scoped to the company only', () => {
    expect(scopeWhere(actor('super_admin'), { team: true })).toEqual({ companyId: 'co-1' });
    expect(scopeWhere(actor('management_admin'), { team: true })).toEqual({ companyId: 'co-1' });
  });

  it('team roles are additionally scoped to their team when team:true', () => {
    expect(scopeWhere(actor('sales_manager'), { team: true })).toEqual({ companyId: 'co-1', teamId: 'team-1' });
    expect(scopeWhere(actor('sdr'), { team: true })).toEqual({ companyId: 'co-1', teamId: 'team-1' });
  });

  it('without team:true even team roles are company-scoped only', () => {
    expect(scopeWhere(actor('sdr'))).toEqual({ companyId: 'co-1' });
  });
});
