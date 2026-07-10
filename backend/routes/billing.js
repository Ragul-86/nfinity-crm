const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const {
  getBillings, getBillingStats, createBilling, updateBilling,
  deleteBilling, getMonthlyRevenue, exportBillings,
} = require('../controllers/billingController')

router.use(protect)

router.get('/stats', getBillingStats)
router.get('/monthly', getMonthlyRevenue)
router.get('/export', exportBillings)
router.get('/', getBillings)
router.post('/', authorize('super_admin', 'admin', 'manager'), createBilling)
router.put('/:id', authorize('super_admin', 'admin', 'manager'), updateBilling)
router.delete('/:id', authorize('super_admin', 'admin'), deleteBilling)

module.exports = router
