const express = require('express');
const router  = express.Router();
const { protect, platformOnly } = require('../middleware/auth');
const ctrl = require('../controllers/platformController');

// Also import tenant-specific ops from tenantController for backward compat
const tenantCtrl = require('../controllers/tenantController');

router.use(protect, platformOnly);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/stats', ctrl.getPlatformStats);

// ─── WORKSPACE MANAGEMENT ─────────────────────────────────────────────────────
router.get('/tenants',                       ctrl.listTenants);
router.post('/tenants',                      ctrl.createTenant);
router.get('/tenants/:id',                   ctrl.getTenant);
router.put('/tenants/:id',                   ctrl.updateTenant);
router.patch('/tenants/:id/status',          ctrl.updateTenantStatus);
router.post('/tenants/:id/impersonate',      ctrl.impersonate);
router.post('/tenants/:id/reset-password',   ctrl.resetOwnerPassword);
router.get('/tenants/:id/backup',            ctrl.backupWorkspace);
router.patch('/tenants/:id/features',        ctrl.updateWorkspaceFeatures);
router.patch('/tenants/:id/upgrade',         ctrl.upgradePlan);

// ─── GLOBAL USERS ─────────────────────────────────────────────────────────────
router.get('/users',                         ctrl.listGlobalUsers);
router.get('/users/:id',                     ctrl.getGlobalUser);
router.patch('/users/:id',                   ctrl.updateGlobalUser);
router.post('/users/:id/suspend',            ctrl.suspendGlobalUser);
router.post('/users/:id/activate',           ctrl.activateGlobalUser);
router.post('/users/:id/reset-password',     ctrl.resetUserPassword);

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
router.get('/subscriptions',                 ctrl.listSubscriptions);

// ─── BILLING ──────────────────────────────────────────────────────────────────
router.get('/billing/overview',              ctrl.getBillingOverview);
router.get('/billing/invoices',              ctrl.listInvoices);
router.get('/billing/payments',              ctrl.listPayments);

// ─── FEATURES ─────────────────────────────────────────────────────────────────
router.get('/features',                      ctrl.listFeatures);
router.put('/features',                      ctrl.savePlatformFeatures);
router.patch('/features/:key',               ctrl.toggleFeature);

// ─── CLIENTS (global view) ────────────────────────────────────────────────────
router.get('/clients',                       ctrl.listGlobalClients);

// ─── SUPPORT ──────────────────────────────────────────────────────────────────
router.get('/support',                       ctrl.listSupportTickets);
router.post('/support',                      ctrl.createSupportTicket);
router.patch('/support/:id',                 ctrl.updateSupportTicket);

// ─── REPORTS ──────────────────────────────────────────────────────────────────
router.get('/reports',                       ctrl.getPlatformReports);

// ─── LICENSE ──────────────────────────────────────────────────────────────────
router.get('/license',                       ctrl.getLicense);
router.post('/license/activate',             ctrl.activateLicense);

// ─── SOP TEMPLATES (full CRUD) ────────────────────────────────────────────────
router.get('/sop-templates',                 ctrl.listGlobalSOPTemplates);
router.post('/sop-templates',                ctrl.createSOPTemplate);
router.put('/sop-templates/:id',             ctrl.updateSOPTemplate);
router.delete('/sop-templates/:id',          ctrl.deleteSOPTemplate);
router.post('/sop-templates/:id/push',       ctrl.pushSOPTemplate);

// ─── LEAD FORM TEMPLATES ──────────────────────────────────────────────────────
router.get('/lead-form-templates',           ctrl.listGlobalLeadForms);
router.post('/lead-form-templates',          ctrl.createLeadFormTemplate);
router.put('/lead-form-templates/:id',       ctrl.updateLeadFormTemplate);
router.delete('/lead-form-templates/:id',    ctrl.deleteLeadFormTemplate);
router.post('/lead-form-templates/:id/push', ctrl.pushLeadFormTemplate);
// Legacy
router.get('/lead-forms',                    ctrl.listGlobalLeadForms);
router.post('/lead-forms',                   ctrl.createLeadFormTemplate);
router.delete('/lead-forms/:id',             ctrl.deleteLeadFormTemplate);
router.post('/lead-forms/:id/push',          ctrl.pushLeadFormTemplate);

// ─── PIPELINE TEMPLATES ───────────────────────────────────────────────────────
router.get('/pipeline-templates',            ctrl.listPipelineTemplates);
router.post('/pipeline-templates',           ctrl.createPipelineTemplate);
router.put('/pipeline-templates/:id',        ctrl.updatePipelineTemplate);
router.delete('/pipeline-templates/:id',     ctrl.deletePipelineTemplate);
router.post('/pipeline-templates/:id/push',  ctrl.pushPipelineTemplate);

// ─── LEGACY TEMPLATE PATHS ────────────────────────────────────────────────────
router.get('/templates/sop',                 ctrl.listGlobalSOPTemplates);
router.get('/templates/lead-forms',          ctrl.listGlobalLeadForms);

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
router.get('/analytics',                     ctrl.getPlatformAnalytics);

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
router.get('/audit-logs',                    ctrl.listAuditLogs);

// ─── SYSTEM SETTINGS ──────────────────────────────────────────────────────────
router.get('/settings',                      ctrl.getSystemSettings);
router.put('/settings',                      ctrl.updateSystemSettings);

// ─── SECURITY ─────────────────────────────────────────────────────────────────
router.get('/security',                      ctrl.getSecurityStats);
router.get('/security/stats',                ctrl.getSecurityStats);

// ─── EMAIL SETTINGS ───────────────────────────────────────────────────────────
router.get('/email-settings',                    ctrl.getEmailSettings);
router.put('/email-settings',                    ctrl.updateEmailSettings);
router.post('/email-settings/test',              ctrl.sendTestEmail);
router.post('/email-settings/test-connection',   ctrl.testEmailConnection);

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
router.get('/whatsapp-settings',                 ctrl.getWhatsAppSettings);
router.put('/whatsapp-settings',                 ctrl.updateWhatsAppSettings);
router.post('/whatsapp-settings/test-connection',ctrl.testWhatsAppConnection);
router.post('/whatsapp-settings/sync-templates', ctrl.syncWhatsAppTemplates);
router.post('/whatsapp-settings/test-message',   ctrl.sendWhatsAppTestMessage);
router.get('/whatsapp-settings/logs',            ctrl.getWhatsAppMessageLogs);

// ─── AI SETTINGS ──────────────────────────────────────────────────────────────
router.get('/ai-settings',                   ctrl.getPlatformAISettings);
router.put('/ai-settings',                   ctrl.updatePlatformAISettings);

// ─── API MANAGEMENT ───────────────────────────────────────────────────────────
router.get('/api-keys',                        ctrl.listApiKeys);
router.post('/api-keys',                       ctrl.generateApiKey);
router.delete('/api-keys/:id',                 ctrl.revokeApiKey);
router.post('/api-keys/:id/regenerate',        ctrl.regenerateApiKey);
router.patch('/api-keys/:id/rate-limit',       ctrl.updateApiKeyRateLimit);
router.get('/api-keys/:id/logs',               ctrl.getApiKeyLogs);

// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────
router.get('/webhooks',                        ctrl.listWebhooks);
router.post('/webhooks',                       ctrl.createWebhook);
router.put('/webhooks/:id',                    ctrl.updateWebhook);
router.delete('/webhooks/:id',                 ctrl.deleteWebhook);
router.patch('/webhooks/:id/toggle',           ctrl.toggleWebhook);
router.post('/webhooks/:id/test',              ctrl.testWebhook);
router.get('/webhooks/:id/logs',               ctrl.getWebhookLogs);

// ─── STORAGE ──────────────────────────────────────────────────────────────────
router.get('/storage',                       ctrl.getStorageStats);
router.get('/storage/stats',                 ctrl.getStorageStats);

// ─── BACKUP ───────────────────────────────────────────────────────────────────
router.get('/backups',                       ctrl.listBackups);
router.post('/backups',                      ctrl.createBackup);

// ─── SUPPORT ──────────────────────────────────────────────────────────────────
router.get('/support/tickets',               ctrl.listSupportTickets);
router.post('/support/tickets',              ctrl.createSupportTicket);
router.patch('/support/tickets/:id',         ctrl.updateSupportTicket);

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
router.post('/notifications/broadcast',      ctrl.broadcastNotification);

// ─── LICENSE / PLANS ──────────────────────────────────────────────────────────
router.get('/plans',                         ctrl.listPlans);
router.patch('/plans/:key',                  ctrl.updatePlan);

// ─── GLOBAL ROLES ─────────────────────────────────────────────────────────────
router.get('/roles',                         ctrl.listGlobalRoles);
router.post('/roles',                        ctrl.createGlobalRole);
router.put('/roles/:id',                     ctrl.updateGlobalRole);
router.delete('/roles/:id',                  ctrl.deleteGlobalRole);
router.post('/roles/:id/duplicate',          ctrl.duplicateGlobalRole);

// ─── PERMISSION MATRIX ────────────────────────────────────────────────────────
router.get('/permissions',                   ctrl.getPermissionMatrix);
router.put('/permissions',                   ctrl.savePermissionMatrix);

module.exports = router;
