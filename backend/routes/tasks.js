const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getTasks, getTask, createTask, updateTask, deleteTask, addComment, getMyTasks } = require('../controllers/taskController');

const { duplicateTask } = require('../controllers/operationsController');

// Roles that can write/create tasks (employee and above)
const TASK_WRITERS = ['employee', 'manager', 'admin', 'super_admin', 'client_super_admin'];
const TASK_DELETERS = ['manager', 'admin', 'super_admin', 'client_super_admin'];

router.use(protect);
router.get('/my-tasks', getMyTasks);
router.route('/').get(getTasks).post(authorize(...TASK_WRITERS), createTask);
router.route('/:id')
  .get(getTask)
  .put(authorize(...TASK_WRITERS), updateTask)
  .delete(authorize(...TASK_DELETERS), deleteTask);
router.post('/:id/comments', addComment);
router.post('/:id/duplicate', duplicateTask);
module.exports = router;
