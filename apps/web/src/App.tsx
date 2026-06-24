import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { PlatformConsolePage } from '@/features/platform/PlatformConsolePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CampaignsPage } from '@/features/campaigns/CampaignsPage';
import { CampaignBriefBuilder } from '@/features/campaigns/CampaignBriefBuilder';
import { CampaignDetailPage } from '@/features/campaigns/CampaignDetailPage';
import { ContactsPage } from '@/features/contacts/ContactsPage';
import { ProspectingPage } from '@/features/prospecting/ProspectingPage';
import { OpportunitiesPage } from '@/features/opportunities/OpportunitiesPage';
import { DealWorkspacePage } from '@/features/opportunities/DealWorkspacePage';
import { ExcelRitualPage } from '@/features/excel/ExcelRitualPage';
import { DraftReviewPage } from '@/features/drafts/DraftReviewPage';
import { ReplyInboxPage } from '@/features/replies/ReplyInboxPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { TeamsPage } from '@/features/teams/TeamsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { PromptsPage } from '@/features/prompts/PromptsPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { CompanySettingsPage } from '@/features/company/CompanySettingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<CampaignBriefBuilder />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="prospecting" element={<ProspectingPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="opportunities/:id" element={<DealWorkspacePage />} />
        <Route path="excel" element={<ExcelRitualPage />} />
        <Route path="drafts" element={<DraftReviewPage />} />
        <Route path="replies" element={<ReplyInboxPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="prompts" element={<PromptsPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<CompanySettingsPage />} />
        <Route path="platform" element={<PlatformConsolePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
