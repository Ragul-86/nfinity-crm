const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getProjects, getProject, createProject, updateProject, deleteProject, updateMilestone } = require('../controllers/projectController');

router.use(protect);
router.route('/').get(getProjects).post(authorize('super_admin','admin','manager'), createProject);
router.route('/:id').get(getProject).put(authorize('super_admin','admin','manager'), updateProject).delete(authorize('super_admin','admin'), deleteProject);
router.put('/:id/milestones/:milestoneId', updateMilestone);
module.exports = router;
