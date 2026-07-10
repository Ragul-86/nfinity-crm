const express = require('express')
const router  = express.Router()
const ctrl    = require('../controllers/systemHealthController')
const { protect, authorize } = require('../middleware/auth')

// Public lightweight ping
router.get('/', ctrl.ping)

// Detailed metrics — admin+ only
router.get('/details', protect, authorize('admin', 'super_admin', 'client_super_admin', 'platform_super_admin'), ctrl.getHealthDetails)

module.exports = router
