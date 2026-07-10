const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getClients, getClient, createClient, updateClient, deleteClient, addCommunicationLog } = require('../controllers/clientController');

router.use(protect);
router.route('/').get(getClients).post(authorize('super_admin','admin','manager'), createClient);
router.route('/:id').get(getClient).put(authorize('super_admin','admin','manager'), updateClient).delete(authorize('super_admin','admin'), deleteClient);
router.post('/:id/communication-logs', addCommunicationLog);
module.exports = router;
