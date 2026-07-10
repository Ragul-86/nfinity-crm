const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getForms, getForm, createForm, updateForm, deleteForm,
  duplicateForm, archiveForm, getSubmissions,
  getPublicForm, submitPublicForm,
} = require('../controllers/leadFormController');

// ── PUBLIC routes (no auth) ───────────────────────────────────────────────────
// These must be registered BEFORE protect middleware
router.get('/public/:token', getPublicForm);
router.post('/public/:token/submit', submitPublicForm);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(protect);

const FORM_MANAGERS = ['super_admin', 'admin', 'manager'];

router.route('/')
  .get(getForms)
  .post(authorize(...FORM_MANAGERS), createForm);

router.route('/:id')
  .get(getForm)
  .put(authorize(...FORM_MANAGERS), updateForm)
  .delete(authorize('super_admin', 'admin'), deleteForm);

router.post('/:id/duplicate', authorize(...FORM_MANAGERS), duplicateForm);
router.patch('/:id/archive', authorize(...FORM_MANAGERS), archiveForm);
router.get('/:id/submissions', getSubmissions);

module.exports = router;
