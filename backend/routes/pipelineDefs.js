/**
 * pipelineDefs.js
 *
 * Routes for the flexible Pipeline system.
 * All routes are tenant-scoped and require authentication.
 *
 * Base path: /api/pipeline-defs
 */

const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/pipelineDefController');

router.use(protect);

const ADMIN_ROLES  = ['client_super_admin', 'super_admin', 'admin'];
const MANAGE_ROLES = ['client_super_admin', 'super_admin', 'admin', 'manager'];

// ── Industry templates (read-only, any authenticated user) ───────────────────
router.get('/industry-templates',            ctrl.listIndustryTemplates);

// ── Ad → Pipeline mappings ───────────────────────────────────────────────────
// IMPORTANT: /mappings routes must come BEFORE /:id to avoid Express matching
// "mappings" as an :id parameter.
router.get('/mappings',                      ctrl.listMappings);
router.post('/mappings',                     authorize(...ADMIN_ROLES), ctrl.createMapping);
router.put('/mappings/:mid',                 authorize(...ADMIN_ROLES), ctrl.updateMapping);
router.delete('/mappings/:mid',              authorize(...ADMIN_ROLES), ctrl.deleteMapping);

// ── Lead stage movement (pipeline-aware) ─────────────────────────────────────
router.put('/leads/:leadId/move',            ctrl.moveLead);

// ── Pipeline CRUD ─────────────────────────────────────────────────────────────
router.get('/',                              ctrl.listPipelines);
router.post('/',                             authorize(...ADMIN_ROLES), ctrl.createPipeline);
router.post('/from-industry',               authorize(...ADMIN_ROLES), ctrl.createFromIndustry);

// /:id routes — must come after all fixed sub-routes above
router.get('/:id',                           ctrl.getPipeline);
router.put('/:id',                           authorize(...ADMIN_ROLES), ctrl.updatePipeline);
router.delete('/:id',                        authorize(...ADMIN_ROLES), ctrl.deletePipeline);
router.post('/:id/default',                  authorize(...ADMIN_ROLES), ctrl.setDefault);
router.get('/:id/leads',                     ctrl.getPipelineLeads);

module.exports = router;
