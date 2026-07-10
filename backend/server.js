const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const SOP = require('./models/SOP');
const User = require('./models/User');
const Tenant = require('./models/Tenant');
const Campaign = require('./models/Campaign');
const Lead = require('./models/Lead');
const Client = require('./models/Client');
const Task = require('./models/Task');
const Project = require('./models/Project');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const Notification = require('./models/Notification');
const MetaLead = require('./models/MetaLead');
const FollowUp = require('./models/FollowUp');
const LeadActivity = require('./models/LeadActivity');
const LeadForm = require('./models/LeadForm');
const LeadFormSubmission = require('./models/LeadFormSubmission');
const Invoice = require('./models/Invoice');
const Quotation = require('./models/Quotation');
const ClientNote = require('./models/ClientNote');
const Meeting = require('./models/Meeting');
const ClientActivity = require('./models/ClientActivity');
const ClientFile = require('./models/ClientFile');
const Payment    = require('./models/Payment');
const CreditNote = require('./models/CreditNote');
const DebitNote  = require('./models/DebitNote');
const { seedSOPTemplates } = require('./utils/sopTemplatesData');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const leadRoutes = require('./routes/leads');
const campaignRoutes = require('./routes/campaigns');
const sopRoutes = require('./routes/sop');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const metaLeadRoutes = require('./routes/metaLeads');
const pipelineRoutes = require('./routes/pipeline');
const billingRoutes = require('./routes/billing');
const platformRoutes = require('./routes/platform');
const invitationRoutes = require('./routes/invitations');
const auditRoutes = require('./routes/audit');
const permissionRoutes = require('./routes/permissions');
const integrationRoutes = require('./routes/integrations');
const followUpRoutes = require('./routes/followUps');
const leadFormRoutes = require('./routes/leadForms');
const customerRoutes = require('./routes/customers');
const financeRoutes     = require('./routes/finance');
const analyticsRoutes   = require('./routes/analytics');
const operationsRoutes  = require('./routes/operations');
const searchRoutes      = require('./routes/search');
const aiRoutes          = require('./routes/ai');
const clientPortalRoutes = require('./routes/clientPortal');
const systemHealthRoutes = require('./routes/systemHealth');

const app = express();

// ─── DB connect → seed & backfill ─────────────────────────────────────────────
connectDB().then(async () => {
  try {
    // ── 1. Ensure a default tenant exists for all pre-existing data ──────────
    let defaultTenant = await Tenant.findOne({ slug: 'default' });
    if (!defaultTenant) {
      // Find the existing super_admin to be the tenant owner
      const existingSuperAdmin = await User.findOne({
        role: { $in: ['super_admin', 'admin'] },
        tenantId: { $exists: false },
      }).sort({ createdAt: 1 });

      defaultTenant = await Tenant.create({
        name: process.env.DEFAULT_TENANT_NAME || 'Default Workspace',
        slug: 'default',
        status: 'active',
        plan: 'professional',
        owner: existingSuperAdmin?._id,
      });
      console.log(`🏢 Default tenant created: "${defaultTenant.name}" (${defaultTenant._id})`);
    }

    // ── 2. Backfill all users without a tenantId ─────────────────────────────
    const userBackfill = await User.updateMany(
      { tenantId: { $exists: false }, role: { $ne: 'platform_super_admin' } },
      { $set: { tenantId: defaultTenant._id } }
    );
    if (userBackfill.modifiedCount > 0) {
      console.log(`🔧 Backfilled tenantId on ${userBackfill.modifiedCount} user(s)`);
    }

    // Link super_admin as tenant owner if not yet set
    if (!defaultTenant.owner) {
      const owner = await User.findOne({ tenantId: defaultTenant._id, role: 'super_admin' });
      if (owner) {
        defaultTenant.owner = owner._id;
        await defaultTenant.save();
      }
    }

    // ── 3. Seed Platform Super Admin from env (if configured) ────────────────
    const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
    const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    if (platformAdminEmail && platformAdminPassword) {
      const existing = await User.findOne({ email: platformAdminEmail });
      if (!existing) {
        await User.create({
          name: process.env.PLATFORM_ADMIN_NAME || 'Platform Admin',
          email: platformAdminEmail,
          password: platformAdminPassword,
          role: 'platform_super_admin',
          isActive: true,
          status: 'active',
          isEmailVerified: true,
        });
        console.log(`🔑 Platform Super Admin created: ${platformAdminEmail}`);
      }
    }

    // ── 4. Backfill all data records without tenantId ─────────────────────────
    const tid = defaultTenant._id;
    const MODELS_TO_BACKFILL = [Lead, Client, Campaign, Task, Project, Attendance, Leave, Notification, MetaLead, FollowUp, LeadActivity, LeadForm, LeadFormSubmission, Invoice, Quotation, ClientNote, Meeting, ClientActivity, ClientFile, Payment, CreditNote, DebitNote];
    const backfillResults = await Promise.all(
      MODELS_TO_BACKFILL.map(Model =>
        Model.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: tid } })
      )
    );
    const totalBackfilled = backfillResults.reduce((sum, r) => sum + r.modifiedCount, 0);
    if (totalBackfilled > 0) {
      console.log(`🔧 Backfilled tenantId on ${totalBackfilled} data record(s) across all collections`);
    }

    // Backfill SOP + SOPAssignment (these have different fields to be safe)
    const SOPAssignment = require('./models/SOPAssignment');
    await Promise.all([
      SOP.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: tid } }),
      SOPAssignment.updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: tid } }),
    ]);

    // ── 5. Legacy sopType backfill ────────────────────────────────────────────
    const sopTypeBackfill = await SOP.updateMany(
      { sopType: { $exists: false } },
      { $set: { sopType: 'performance_marketing' } }
    );
    if (sopTypeBackfill.modifiedCount > 0) {
      console.log(`🔧 Backfilled sopType on ${sopTypeBackfill.modifiedCount} legacy SOP(s)`);
    }

    // ── 6. Legacy assignedTeam backfill on campaigns ──────────────────────────
    const legacyCampaigns = await Campaign.find({
      $expr: { $gt: [{ $size: { $ifNull: ['$teamMembers', []] } }, 0] },
      $or: [{ assignedTeam: { $exists: false } }, { assignedTeam: { $size: 0 } }],
    }).select('teamMembers assignedTeam');
    if (legacyCampaigns.length > 0) {
      await Promise.all(legacyCampaigns.map(c => {
        c.assignedTeam = c.teamMembers.map(u => ({ user: u, role: '' }));
        return c.save();
      }));
      console.log(`🔧 Backfilled assignedTeam on ${legacyCampaigns.length} legacy campaign(s)`);
    }

    // ── 7. Seed SOP templates for default tenant ──────────────────────────────
    const admin = await User.findOne({ tenantId: tid, role: { $in: ['super_admin', 'admin'] } }).sort({ createdAt: 1 });
    const result = await seedSOPTemplates(SOP, admin ? admin._id : null, tid);
    if (result.seeded) console.log(`🌱 SOP templates: ${result.message}`);

  } catch (err) {
    console.error('Startup backfill/seed failed:', err.message);
  }
});

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// CORS — allow X-Tenant-Id header for impersonation
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any Vercel preview or production deployment
    if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) return callback(null, true);
    // Allow configured origins
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
}));

// Body parsing (capture raw body for Meta webhook signature verification)
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf.toString() },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging in development
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/sop', sopRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meta', metaLeadRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/billing', billingRoutes);
// ── Multi-tenant routes ──
app.use('/api/platform', platformRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/lead-forms', leadFormRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/finance',     financeRoutes);
app.use('/api/analytics',   analyticsRoutes);
app.use('/api/operations',  operationsRoutes);
app.use('/api/search',      searchRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/portal',      clientPortalRoutes);
app.use('/api/health',      systemHealthRoutes);

// 404 handler
app.use('*', (req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
