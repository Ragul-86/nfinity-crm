const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const {
  getSOPs, getSOPById, createSOP, updateSOP, duplicateSOP,
  archiveSOP, restoreSOP, deleteSOP, toggleBookmark, assignSOP, reassignAssignment,
  getAssignments, getAssignmentById, completeItem,
  addChecklistItem, deleteChecklistItem, reorderChecklist, addChecklistItemComment,
  addComment, editComment, deleteComment, resolveComment,
  submitForReview, approveAssignment, requestChanges,
  getActivityLog, getVersionHistory, compareVersions, restoreVersion,
  getStats, seedTemplates,
} = require('../controllers/sopController')

const MANAGER_UP = ['super_admin', 'admin', 'manager']

router.use(protect)

// ─── Templates & stats ─────────────────────────────────────────────────────
router.get('/stats', getStats)
router.post('/seed-templates', authorize('super_admin', 'admin'), seedTemplates)

// ─── Assignments — checklist management ────────────────────────────────────
router.get('/assignments', getAssignments)
router.get('/assignments/:id', getAssignmentById)
router.put('/assignments/:id/complete-item', completeItem)
router.post('/assignments/:id/checklist', addChecklistItem)
router.delete('/assignments/:id/checklist/:itemId', deleteChecklistItem)
router.put('/assignments/:id/checklist/reorder', reorderChecklist)
router.post('/assignments/:id/checklist/:itemId/comments', addChecklistItemComment)

// ─── Assignments — comments & collaboration ────────────────────────────────
router.post('/assignments/:id/comments', addComment)
router.put('/assignments/:id/comments/:commentId', editComment)
router.delete('/assignments/:id/comments/:commentId', deleteComment)
router.put('/assignments/:id/comments/:commentId/resolve', resolveComment)

// ─── Assignments — review workflow & reassignment ──────────────────────────
router.put('/assignments/:id/submit-review', submitForReview)
router.put('/assignments/:id/approve', authorize(...MANAGER_UP), approveAssignment)
router.put('/assignments/:id/request-changes', authorize(...MANAGER_UP), requestChanges)
router.put('/assignments/:id/reassign', authorize(...MANAGER_UP), reassignAssignment)

// ─── SOP CRUD ────────────────────────────────────────────────────────────────
router.get('/', getSOPs)
router.post('/', authorize(...MANAGER_UP), createSOP)

router.get('/:id', getSOPById)
router.put('/:id', authorize(...MANAGER_UP), updateSOP)
router.delete('/:id', authorize('super_admin', 'admin'), deleteSOP)
router.post('/:id/duplicate', duplicateSOP)
router.put('/:id/archive', authorize(...MANAGER_UP), archiveSOP)
router.put('/:id/restore', authorize(...MANAGER_UP), restoreSOP)
router.put('/:id/bookmark', toggleBookmark)
router.post('/:id/assign', authorize(...MANAGER_UP), assignSOP)

// ─── SOP — activity log & version history ──────────────────────────────────
router.get('/:id/activity', getActivityLog)
router.get('/:id/versions', getVersionHistory)
router.get('/:id/versions/compare', compareVersions)
router.post('/:id/versions/:version/restore', authorize(...MANAGER_UP), restoreVersion)

module.exports = router
