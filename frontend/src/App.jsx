import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { PortalProvider } from '@/contexts/PortalContext'
import ProtectedRoute from '@/routes/ProtectedRoute'
import PortalRoute from '@/routes/PortalRoute'
import DashboardLayout from '@/layouts/DashboardLayout'
import PlatformLayout from '@/layouts/PlatformLayout'
import ClientPortalLayout from '@/layouts/ClientPortalLayout'

// ── Auth pages (eager — first pages visitors see) ────────────────────────────
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'

// ── Error / misc pages (eager — may be rendered before JS chunks load) ───────
import NotFound from '@/pages/error/NotFound'
import Maintenance from '@/pages/error/Maintenance'
import AcceptInvitation from '@/pages/AcceptInvitation'
import AccessDenied from '@/pages/AccessDenied'
import OAuthCallback from '@/pages/OAuthCallback'

// ── Legal pages (lazy — publicly accessible, no auth required) ───────────────
const PrivacyPolicy = lazy(() => import('@/pages/legal/PrivacyPolicy'))
const Terms         = lazy(() => import('@/pages/legal/Terms'))

// ── Tenant workspace pages (lazy — loaded on demand per route) ────────────────
const Dashboard           = lazy(() => import('@/pages/Dashboard'))
const SalesPipeline       = lazy(() => import('@/pages/SalesPipeline'))
const MetaLeads           = lazy(() => import('@/pages/MetaLeads'))
const Clients             = lazy(() => import('@/pages/Clients'))
const CustomerWorkspace   = lazy(() => import('@/pages/CustomerWorkspace'))
const Campaigns           = lazy(() => import('@/pages/Campaigns'))
const MyCampaigns         = lazy(() => import('@/pages/MyCampaigns'))
const SOP                 = lazy(() => import('@/pages/SOP'))
const Projects            = lazy(() => import('@/pages/Projects'))
const Tasks               = lazy(() => import('@/pages/Tasks'))
const Employees           = lazy(() => import('@/pages/Employees'))
const Attendance          = lazy(() => import('@/pages/Attendance'))
const Reports             = lazy(() => import('@/pages/Reports'))
const Notifications       = lazy(() => import('@/pages/Notifications'))
const Settings            = lazy(() => import('@/pages/Settings'))
const Integrations        = lazy(() => import('@/pages/Integrations'))
const Leads               = lazy(() => import('@/pages/Leads'))
const LeadSources         = lazy(() => import('@/pages/LeadSources'))
const LeadStreamDashboard = lazy(() => import('@/pages/LeadStreamDashboard'))
const GSheetKanbanDashboard = lazy(() => import('@/pages/GSheetKanbanDashboard'))
const GSheetLeadsTable    = lazy(() => import('@/pages/GSheetLeadsTable'))
const LeadForms           = lazy(() => import('@/pages/LeadForms'))
const FinanceWorkspace    = lazy(() => import('@/pages/FinanceWorkspace'))
const OperationsWorkspace = lazy(() => import('@/pages/OperationsWorkspace'))
const AuditLogs           = lazy(() => import('@/pages/AuditLogs'))
const SystemHealth        = lazy(() => import('@/pages/SystemHealth'))

// ── Platform Super Admin pages (lazy — separate user type) ───────────────────
const PlatformDashboard      = lazy(() => import('@/pages/platform/PlatformDashboard'))
const PlatformWorkspaces     = lazy(() => import('@/pages/platform/PlatformWorkspaces'))
const PlatformClients        = lazy(() => import('@/pages/platform/PlatformClients'))
const PlatformSubscriptions  = lazy(() => import('@/pages/platform/PlatformSubscriptions'))
const PlatformBilling        = lazy(() => import('@/pages/platform/PlatformBilling'))
const PlatformGlobalUsers    = lazy(() => import('@/pages/platform/PlatformGlobalUsers'))
const PlatformGlobalRoles    = lazy(() => import('@/pages/platform/PlatformGlobalRoles'))
const PlatformPermissions    = lazy(() => import('@/pages/platform/PlatformPermissions'))
const PlatformFeatures       = lazy(() => import('@/pages/platform/PlatformFeatures'))
const PlatformSOPTemplates   = lazy(() => import('@/pages/platform/PlatformSOPTemplates'))
const PlatformLeadForms      = lazy(() => import('@/pages/platform/PlatformLeadForms'))
const PlatformPipelines      = lazy(() => import('@/pages/platform/PlatformPipelines'))
const PlatformAnalytics      = lazy(() => import('@/pages/platform/PlatformAnalytics'))
const PlatformReports        = lazy(() => import('@/pages/platform/PlatformReports'))
const PlatformAuditLogs      = lazy(() => import('@/pages/platform/PlatformAuditLogs'))
const PlatformActivityLogs   = lazy(() => import('@/pages/platform/PlatformActivityLogs'))
const PlatformNotifications  = lazy(() => import('@/pages/platform/PlatformNotifications'))
const PlatformSupport        = lazy(() => import('@/pages/platform/PlatformSupport'))
const PlatformStorage        = lazy(() => import('@/pages/platform/PlatformStorage'))
const PlatformAPIManagement  = lazy(() => import('@/pages/platform/PlatformAPIManagement'))
const PlatformWebhooks       = lazy(() => import('@/pages/platform/PlatformWebhooks'))
const PlatformEmail          = lazy(() => import('@/pages/platform/PlatformEmail'))
const PlatformWhatsApp       = lazy(() => import('@/pages/platform/PlatformWhatsApp'))
const PlatformAISettings     = lazy(() => import('@/pages/platform/PlatformAISettings'))
const PlatformSecurity       = lazy(() => import('@/pages/platform/PlatformSecurity'))
const PlatformBackup         = lazy(() => import('@/pages/platform/PlatformBackup'))
const PlatformSystemSettings = lazy(() => import('@/pages/platform/PlatformSystemSettings'))
const PlatformLicense        = lazy(() => import('@/pages/platform/PlatformLicense'))

// ── Client Portal pages (lazy — separate audience) ───────────────────────────
const PortalLogin      = lazy(() => import('@/pages/portal/PortalLogin'))
const PortalDashboard  = lazy(() => import('@/pages/portal/PortalDashboard'))
const PortalInvoices   = lazy(() => import('@/pages/portal/PortalInvoices'))
const PortalQuotations = lazy(() => import('@/pages/portal/PortalQuotations'))
const PortalTasks      = lazy(() => import('@/pages/portal/PortalTasks'))
const PortalSOP        = lazy(() => import('@/pages/portal/PortalSOP'))
const PortalMeetings   = lazy(() => import('@/pages/portal/PortalMeetings'))
const PortalSupport    = lazy(() => import('@/pages/portal/PortalSupport'))
const PortalProfile    = lazy(() => import('@/pages/portal/PortalProfile'))

// ── Route loading fallback ────────────────────────────────────────────────────
function RouteLoader() {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PortalProvider>
            <Suspense fallback={<RouteLoader />}>
            <Routes>
              {/* ── Public CRM routes ── */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
              <Route path="/unauthorized" element={<AccessDenied />} />
              <Route path="/oauth-callback" element={<OAuthCallback />} />

              {/* ── Legal pages (public) ── */}
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />

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
                  <Route path="/leads/dashboard" element={<GSheetKanbanDashboard />} />
                  <Route path="/leads/sheet-table" element={<GSheetLeadsTable />} />
                  <Route path="/leads/sources" element={<LeadSources />} />
                  <Route path="/leads/sources/:streamType/:streamKey" element={<LeadStreamDashboard />} />
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
            </Suspense>
          </PortalProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
