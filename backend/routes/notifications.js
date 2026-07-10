const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/auth')
const {
  getNotifications,
  markRead,
  markAllRead,
  archiveNotification,
  deleteNotification,
  clearAll,
} = require('../controllers/notificationController')

router.use(protect)

router.get('/',                     getNotifications)
router.put('/mark-all-read',        markAllRead)
router.delete('/',                  clearAll)
router.put('/:id/read',             markRead)
router.put('/:id/archive',          archiveNotification)
router.delete('/:id',               deleteNotification)

module.exports = router
