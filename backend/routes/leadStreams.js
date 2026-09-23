const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  getLeadStreams,
  discoverStreams,
  createLeadStream,
  getLeadStreamStats,
  getStatsByFilter,
  updateLeadStream,
  deleteLeadStream,
} = require('../controllers/leadStreamController');

router.use(protect);

// ── Static routes BEFORE /:id to prevent route collisions ─────────────────────
router.get('/discover',         discoverStreams);
router.get('/stats-by-filter',  getStatsByFilter);

// ── Collection ─────────────────────────────────────────────────────────────────
router.route('/')
  .get(getLeadStreams)
  .post(authorize('super_admin', 'admin', 'manager'), createLeadStream);

// ── Per-stream ─────────────────────────────────────────────────────────────────
router.get('/:id/stats',  getLeadStreamStats);
router.put('/:id',        authorize('super_admin', 'admin', 'manager'), updateLeadStream);
router.delete('/:id',     authorize('super_admin', 'admin', 'manager'), deleteLeadStream);

module.exports = router;
