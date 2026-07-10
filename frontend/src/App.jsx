import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { PortalProvider } from '@/contexts/PortalContext'
import ProtectedRoute from '@/routes/ProtectedRoute'
import PortalRoute from '@/routes/PortalRoute'
import DashboardLayout from '@/layouts/DashboardLayout'
import PlatformLayout from '@/layouts/PlatformLayout'
import ClientPortalLayout from '@/layouts/ClientPortalLayout'

// Auth pages
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'

// Dashboard & module pages
import Dashboard from '@/pages/Dashboard'
import SalesPipeline from '@/pages/SalesPipeline'
import MetaLeads from '@/pages/MetaLeads'
import Clients from '@/pages/Clients'
import CustomerWorkspace from '@/pages/CustomerWorkspace'
import Campaigns from '@/pages/Campaigns'
import MyCampaigns from '@/pages/MyCampaigns'
import SOP from '@/pages/SOP'
import Projects from '@/pages/Projects'
import Tasks from '@/pages/Tasks'
import Employees from '@/pages/Employees'
import Attendance from '@/pages/Attendance'
import Reports from '@/pages/Reports'
import Notifications from '@/pages/Notifications'
import Settings from '@/pages/Settings'
import Integrations from '@/pages/Integrations'
import Leads from '@/pages/Leads'
import LeadForms from '@/pages/LeadForms'
import FinanceWorkspace from '@/pages/FinanceWorkspace'
import OperationsWorkspace from '@/pages/OperationsWorkspace'
import AuditLogs from '@/pages/AuditLogs'
import SystemHealth from '@/pages/SystemHealth'

// Platform Super Admin pages
import PlatformDashboard       from '@/pages/platform/PlatformDashboard'
import PlatformWorkspaces      from '@/pages/platform/PlatformWorkspaces'
import PlatformClients         from '@/pages/platform/PlatformClients'
import PlatformSubscriptions   from '@/pages/platform/PlatformSubscriptions'
import PlatformBilling         from '@/pages/platform/PlatformBilling'
import PlatformGlobalUsers     from '@/pages/platform/PlatformGlobalUsers'
import PlatformGlobalRoles     from '@/pages/platform/PlatformGlobalRoles'
import PlatformPermissions     from '@/pages/platform/PlatformPermissions'
import PlatformFeatures        from '@/pages/platform/PlatformFeatures'
import PlatformSOPTemplates    from '@/pages/platform/PlatformSOPTemplates'
import PlatformLeadForms       from '@/pages/platform/PlatformLeadForms'
import PlatformPipelines       from '@/pages/platform/PlatformPipelines'
import PlatformAnalytics       from '@/pages/platform/PlatformAnalytics'
import PlatformReports         from '@/pages/platform/PlatformReports'
import PlatformAuditLogs       from '@/pages/platform/PlatformAuditLogs'
import PlatformActivityLogs    from '@/pages/platform/PlatformActivityLogs'
import PlatformNotifications   from '@/pages/platform/PlatformNotifications'
import PlatformSupport         from '@/pages/platform/PlatformSupport'
import PlatformStorage         from '@/pages/platform/PlatformStorage'
import PlatformAPIManagement   from '@/pages/platform/PlatformAPIManagement'
import PlatformWebhooks        from '@/pages/platform/PlatformWebhooks'
import PlatformEmail           from '@/pages/platform/PlatformEmail'
import PlatformWhatsApp        from '@/pages/platform/PlatformWhatsApp'
import PlatformAISettings      from '@/pages/platform/PlatformAISettings'
import PlatformSecurity        from '@/pages/platform/PlatformSecurity'
import PlatformBackup          from '@/pages/platform/PlatformBackup'
import PlatformSystemSettings  from '@/pages/platform/PlatformSystemSettings'
import PlatformLicense         from '@/pages/platform/PlatformLicense'

// Misc pages
import AcceptInvitation from '@/pages/AcceptInvitation'
import AccessDenied from '@/pages/AccessDenied'
import OAuthCallback from '@/pages/OAuthCallback'

// Error pages
import NotFound from '@/pages/error/NotFound'
import Maintenance from '@/pages/error/Maintenance'

// Client Portal pages
import PortalLogin from '@/pages/portal/PortalLogin'
import PortalDashboard from '@/pages/portal/PortalDashboard'
import PortalInvoices from '@/pages/portal/PortalInvoices'
import PortalQuotations from '@/pages/portal/PortalQuotations'
import PortalTasks from '@/pages/portal/PortalTasks'
import PortalSOP from '@/pages/portal/PortalSOP'
import PortalMeetings from '@/pages/portal/PortalMeetings'
import PortalSupport from '@/pages/portal/PortalSupport'
import PortalProfile from '@/pages/portal/PortalProfile'

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PortalProvider>
            <Routes>
              {/* ── Public CRM routes ── */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
              <Route path="/unauthorized" element={<AccessDenied />} />
              <Route path="/oauth-callback" element={<OAuthCallback />} />

              {/* ── Error pages ── */}
              <Route path="/404" element={<NotFound />} />
              <Route path="/maintenance" element={<Maintenance />} />

              {/* ── Platform Super Admin routes ── */}
              <Route element={<ProtectedRoute require="platformAdmin" />}>
                <Route element={<PlatformLayout />}>
                  <Route path="/platform"                          element={<PlatformDashboard />} />
                  <Route path="/platform/workspaces"               element={<PlatformWorkspaces />} />
                  <Route path="/platform/clients"                  element={<PlatformClients />} />
                  <Route path="/platform/subscriptions"            element={<PlatformSubscriptions />} />
                  <Route path="/platform/billing"                  element={<PlatformBilling />} />
                  <Route path="/platform/users"                    element={<PlatformGlobalUsers />} />
                  <Route path="/platform/roles"                    element={<PlatformGlobalRoles />} />
                  <Route path="/platform/permissions"              element={<PlatformPermissions />} />
                  <Route path="/platform/features"                 element={<PlatformFeatures />} />
                  <Route path="/platform/templates/sop"            element={<PlatformSOPTemplates />} />
                  <Route path="/platform/templates/lead-forms"     element={<PlatformLeadForms />} />
                  <Route path="/platform/templates/pipelines"      element={<PlatformPipelines />} />
                  <Route path="/platform/analytics"                element={<PlatformAnalytics />} />
                  <Route path="/platform/reports"                  element={<PlatformReports />} />
                  <Route path="/platform/audit-logs"               element={<PlatformAuditLogs />} />
                  <Route path="/platform/activity-logs"            element={<PlatformActivityLogs />} />
                  <Route path="/platform/notifications"            element={<PlatformNotifications />} />
                  <Route path="/platform/support"                  element={<PlatformSupport />} />
                  <Route path="/platform/storage"                  element={<PlatformStorage />} />
                  <Route path="/platform/api-keys"                 element={<PlatformAPIManagement />} />
                  <Route path="/platform/webhooks"                 element={<PlatformWebhooks />} />
                  <Route path="/platform/email-settings"           element={<PlatformEmail />} />
                  <Route path="/platform/whatsapp"                 element={<PlatformWhatsApp />} />
                  <Route path="/platform/ai-settings"              element={<PlatformAISettings />} />
                  <Route path="/platform/security"                 element={<PlatformSecurity />} />
                  <Route path="/platform/backups"                  element={<PlatformBackup />} />
                  <Route path="/platform/settings"                 element={<PlatformSystemSettings />} />
                  <Route path="/platform/license"                  element={<PlatformLicense />} />
                </Route>
              </Route>

              {/* ── Tenant workspace routes ── */}
              <Route element={<ProtectedRoute require="tenantUser" />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/pipeline/*" element={<SalesPipeline />} />
                  <Route path="/crm-leads/*" element={<Leads />} />
                  <Route path="/lead-forms/*" element={<LeadForms />} />
                  <Route path="/leads/*" element={<MetaLeads />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/clients/:id" element={<CustomerWorkspace />} />
                  <Route path="/campaigns/*" element={<Campaigns />} />
                  <Route path="/my-campaigns" element={<MyCampaigns />} />
                  <Route path="/sop/*" element={<SOP />} />
                  <Route path="/projects/*" element={<Projects />} />
                  <Route path="/tasks/*" element={<Tasks />} />
                  <Route path="/employees/*" element={<Employees />} />
                  <Route path="/team/*" element={<Employees />} />
                  <Route path="/attendance/*" element={<Attendance />} />
                  <Route path="/reports/*" element={<Reports />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/finance" element={<FinanceWorkspace />} />
                  <Route path="/operations/*" element={<OperationsWorkspace />} />
                  <Route path="/audit-logs" element={<AuditLogs />} />
                  <Route path="/system-health" element={<SystemHealth />} />
                  <Route path="/settings/integrations" element={<Integrations />} />
                  <Route path="/settings/*" element={<Settings />} />
                </Route>
              </Route>

              {/* ── Client Portal routes ── */}
              <Route path="/portal/login" element={<PortalLogin />} />
              <Route path="/portal" element={<PortalRoute><ClientPortalLayout /></PortalRoute>}>
                <Route index element={<Navigate to="/portal/dashboard" replace />} />
                <Route path="dashboard"  element={<PortalDashboard />} />
                <Route path="invoices"   element={<PortalInvoices />} />
                <Route path="quotations" element={<PortalQuotations />} />
                <Route path="tasks"      element={<PortalTasks />} />
                <Route path="sop"        element={<PortalSOP />} />
                <Route path="meetings"   element={<PortalMeetings />} />
                <Route path="support"    element={<PortalSupport />} />
                <Route path="profile"    element={<PortalProfile />} />
              </Route>

              {/* 404 fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PortalProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
