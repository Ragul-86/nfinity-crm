'use strict';

const express = require('express');
const router  = express.Router();
const { protect, authorize, requireTenant } = require('../middleware/auth');
const sc = require('../controllers/salesController');

// All routes require authentication and a tenant context
router.use(protect);
router.use(requireTenant);

// ── Dashboard & Reporting ────────────────────────────────────────────────────
router.get('/dashboard',  sc.getDashboard);
router.get('/kanban',     sc.getKanban);
router.get('/reports',    sc.getReports);
router.get('/salespeople', sc.getSalespeople);

// ── Prospect CRUD ────────────────────────────────────────────────────────────
router.get('/',     sc.getProspects);
router.post('/',    sc.createProspect);
router.get('/:id',  sc.getProspect);
router.put('/:id',  sc.updateProspect);
router.delete('/:id', authorize('admin', 'super_admin', 'client_super_admin'), sc.deleteProspect);

// ── Stage management ─────────────────────────────────────────────────────────
router.patch('/:id/stage',          sc.changeStage);
router.patch('/:id/kanban-order',   sc.updateKanbanOrder);

// ── Proposal ─────────────────────────────────────────────────────────────────
router.patch('/:id/proposal', sc.updateProposal);

// ── Convert to Client ────────────────────────────────────────────────────────
router.post('/:id/convert', authorize('admin', 'super_admin', 'client_super_admin', 'manager'), sc.convertToClient);

// ── Activities ───────────────────────────────────────────────────────────────
router.get('/:id/activities',  sc.getActivities);
router.post('/:id/activities', sc.addActivity);

// ── Follow-ups ───────────────────────────────────────────────────────────────
router.get('/:id/follow-ups',              sc.getFollowUps);
router.post('/:id/follow-ups',             sc.addFollowUp);
router.patch('/:id/follow-ups/:followUpId', sc.updateFollowUp);

module.exports = router;
