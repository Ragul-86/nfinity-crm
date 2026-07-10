const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getLeads, getLead, createLead, updateLead, deleteLead,
  addNote, deleteNote, getLeadStats, getTimeline,
  bulkAction, importLeads, exportLeads,
} = require('../controllers/leadController');

router.use(protect);

// Stats & export
router.get('/stats', getLeadStats);
router.get('/export', exportLeads);

// Bulk & import
router.post('/bulk', bulkAction);
router.post('/import', authorize('super_admin', 'admin', 'manager'), importLeads);

// Roles that can create/update leads (employee and above)
const LEAD_WRITERS = ['employee', 'manager', 'admin', 'super_admin', 'client_super_admin'];

// CRUD
router.route('/')
  .get(getLeads)
  .post(authorize(...LEAD_WRITERS), createLead);

router.route('/:id')
  .get(getLead)
  .put(authorize(...LEAD_WRITERS), updateLead)
  .delete(authorize('super_admin', 'admin', 'manager'), deleteLead);

// Notes
router.post('/:id/notes', addNote);
router.delete('/:id/notes/:noteId', authorize('super_admin', 'admin', 'manager'), deleteNote);

// Timeline
router.get('/:id/timeline', getTimeline);

module.exports = router;
