const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const { getAuditLogs, getAuditStats } = require('../controllers/auditController')

const AUDITORS = ['super_admin', 'client_super_admin', 'admin', 'platform_super_admin']

router.use(protect)
router.get('/',       authorize(...AUDITORS), getAuditLogs)
router.get('/stats',  authorize(...AUDITORS), getAuditStats)

module.exports = router
