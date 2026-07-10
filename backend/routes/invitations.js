const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  sendInvitation, listInvitations, validateInvitation,
  acceptInvitation, resendInvitation, revokeInvitation, resendByUser,
} = require('../controllers/invitationController');

// Public routes (no auth needed)
router.get('/validate/:token', validateInvitation);
router.post('/accept/:token', acceptInvitation);

// Protected routes — client super admin and admin can manage invitations
router.use(protect);
router.get('/', authorize('super_admin', 'client_super_admin', 'admin'), listInvitations);
router.post('/', authorize('super_admin', 'client_super_admin', 'admin'), sendInvitation);
router.post('/:id/resend', authorize('super_admin', 'client_super_admin', 'admin'), resendInvitation);
router.post('/resend-by-user/:userId', authorize('super_admin', 'client_super_admin', 'admin'), resendByUser);
router.delete('/:id', authorize('super_admin', 'client_super_admin'), revokeInvitation);

module.exports = router;
