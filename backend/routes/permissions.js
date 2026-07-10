const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getPermissions, getAllPermissions, updatePermissions, resetPermissions,
} = require('../controllers/permissionController');

router.use(protect);

// All authenticated users can read permissions (to gate frontend nav)
router.get('/', getAllPermissions);
router.get('/:role', getPermissions);

// Only super_admin can modify
router.put('/:role', authorize('super_admin', 'client_super_admin'), updatePermissions);
router.post('/reset/:role', authorize('super_admin', 'client_super_admin'), resetPermissions);

module.exports = router;
