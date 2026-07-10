const express = require('express')
const router  = express.Router()
const { protect, authorize } = require('../middleware/auth')
const ctrl = require('../controllers/aiController')

const ADMINS = ['platform_super_admin', 'client_super_admin', 'super_admin', 'admin']

router.use(protect)

// Settings — admin+ only
router.get('/settings',     authorize(...ADMINS), ctrl.getSettings)
router.put('/settings',     authorize(...ADMINS), ctrl.updateSettings)

// Status & quick prompts — any authenticated user
router.get('/status',        ctrl.getStatus)
router.get('/quick-prompts', ctrl.getQuickPrompts)

// Chat — role permissions enforced in controller
router.post('/chat', ctrl.chat)

// Track action events (copy, note_saved, etc.)
router.post('/track', ctrl.trackAction)

// History — role-filtered in controller
router.get('/history', ctrl.getHistory)

// Usage stats — admin+ only
router.get('/usage-stats', authorize(...ADMINS), ctrl.getUsageStats)

module.exports = router
