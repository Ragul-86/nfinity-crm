const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getFollowUps,
  getFollowUp,
  createFollowUp,
  updateFollowUp,
  completeFollowUp,
  deleteFollowUp,
} = require('../controllers/followUpController');

router.use(protect);

router.route('/').get(getFollowUps).post(createFollowUp);
router.route('/:id').get(getFollowUp).put(updateFollowUp).delete(deleteFollowUp);
router.post('/:id/complete', completeFollowUp);

module.exports = router;
