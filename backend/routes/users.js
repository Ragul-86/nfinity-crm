const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getUsers, getUser, createUser, updateUser, deleteUser,
  updateAvatar, updateUserStatus, changeRole, resetPassword,
} = require('../controllers/userController');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, `avatar-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(protect);

router.route('/')
  .get(getUsers)
  .post(authorize('super_admin', 'client_super_admin', 'admin'), createUser);

router.route('/:id')
  .get(getUser)
  .put(authorize('super_admin', 'client_super_admin', 'admin'), updateUser)
  .delete(authorize('super_admin', 'client_super_admin'), deleteUser);

// Status — super_admin can set all; admin can set active/inactive only
router.patch('/:id/status', authorize('super_admin', 'client_super_admin', 'admin'), updateUserStatus);

// Role change (with audit log) — super_admin only
router.patch('/:id/change-role', authorize('super_admin', 'client_super_admin'), changeRole);

// Admin-initiated password reset
router.patch('/:id/reset-password', authorize('super_admin', 'client_super_admin', 'admin'), resetPassword);

// Avatar upload (own user only, handled inside controller)
router.put('/upload-avatar', upload.single('avatar'), updateAvatar);

module.exports = router;
