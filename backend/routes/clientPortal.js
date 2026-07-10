/**
 * clientPortal.js — two route groups:
 *   /api/portal/auth/*      public portal auth
 *   /api/portal/*           portal-authenticated (protectPortal)
 *   /api/portal/manage/*    CRM-authenticated (existing protect + authorize)
 */
const express  = require('express')
const jwt      = require('jsonwebtoken')
const router   = express.Router()
const ClientPortalUser = require('../models/ClientPortalUser')
const { protect, authorize } = require('../middleware/auth')
const ctrl = require('../controllers/clientPortalController')

// ─────────────────────────────────────────────────────────────────────────────
// protectPortal middleware
// Validates portal JWT (type:'portal'), loads portal user, attaches to req.portalUser
// ─────────────────────────────────────────────────────────────────────────────
async function protectPortal(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No portal token provided' })
    }
    const token = header.slice(7)
    let payload
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired portal token' })
    }
    if (payload.type !== 'portal') {
      return res.status(401).json({ success: false, message: 'Invalid token type' })
    }
    const user = await ClientPortalUser.findById(payload.id)
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Portal account not found or disabled' })
    }
    req.portalUser = user
    next()
  } catch (e) {
    next(e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public portal auth routes
// ─────────────────────────────────────────────────────────────────────────────
router.post('/auth/login',          ctrl.portalLogin)
router.post('/auth/forgot-password', ctrl.portalForgotPassword)
router.post('/auth/reset-password',  ctrl.portalResetPassword)

// ─────────────────────────────────────────────────────────────────────────────
// Portal-authenticated routes  (use protectPortal)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/auth/me', protectPortal, ctrl.portalMe)

router.get('/dashboard',  protectPortal, ctrl.portalDashboard)
router.get('/invoices',   protectPortal, ctrl.portalInvoices)
router.get('/quotations', protectPortal, ctrl.portalQuotations)
router.put('/quotations/:id/action', protectPortal, ctrl.portalQuotationAction)
router.get('/payments',   protectPortal, ctrl.portalPayments)
router.get('/tasks',      protectPortal, ctrl.portalTasks)
router.get('/sop',        protectPortal, ctrl.portalSOP)
router.get('/meetings',   protectPortal, ctrl.portalMeetings)

// Support tickets
router.get('/support',           protectPortal, ctrl.portalGetTickets)
router.post('/support',          protectPortal, ctrl.portalCreateTicket)
router.get('/support/:id',       protectPortal, ctrl.portalGetTicket)
router.post('/support/:id/reply', protectPortal, ctrl.portalReplyTicket)

// Profile
router.get('/profile',          protectPortal, ctrl.portalGetProfile)
router.put('/profile',          protectPortal, ctrl.portalUpdateProfile)
router.put('/profile/password', protectPortal, ctrl.portalChangePassword)

// ─────────────────────────────────────────────────────────────────────────────
// CRM-side management routes  (CRM JWT + admin role)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/manage/users',     protect, authorize('admin', 'super_admin', 'client_super_admin', 'platform_super_admin'), ctrl.listPortalUsers)
router.post('/manage/users',    protect, authorize('admin', 'super_admin', 'client_super_admin', 'platform_super_admin'), ctrl.createPortalUser)
router.put('/manage/users/:id', protect, authorize('admin', 'super_admin', 'client_super_admin', 'platform_super_admin'), ctrl.updatePortalUser)
router.delete('/manage/users/:id', protect, authorize('admin', 'super_admin', 'client_super_admin', 'platform_super_admin'), ctrl.deletePortalUser)

module.exports = router
