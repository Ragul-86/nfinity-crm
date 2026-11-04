'use strict';

const mongoose = require('mongoose');
const SalesProspect  = require('../models/SalesProspect');
const SalesActivity  = require('../models/SalesActivity');
const SalesFollowUp  = require('../models/SalesFollowUp');
const Client         = require('../models/Client');
const User           = require('../models/User');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STAGES = [
  'new_prospect', 'contacted', 'meeting_scheduled',
  'proposal_sent', 'negotiation', 'won', 'lost',
];

function notFound(res) {
  return res.status(404).json({ success: false, message: 'Prospect not found' });
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const [
      totalProspects,
      stageBreakdown,
      dealValueByStage,
      monthlyWon,
      upcomingFollowUps,
      overdueFollowUps,
      salespersonStats,
      serviceDistribution,
    ] = await Promise.all([

      // 1. Total prospects
      SalesProspect.countDocuments(tf),

      // 2. Count per stage
      SalesProspect.aggregate([
        { $match: tf },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),

      // 3. Total estimated deal value per stage
      SalesProspect.aggregate([
        { $match: tf },
        { $group: { _id: '$stage', totalValue: { $sum: '$estimatedDealValue' } } },
      ]),

      // 4. Won deals this month vs last 6 months
      SalesProspect.aggregate([
        { $match: { ...tf, stage: 'won', wonAt: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: {
              year:  { $year: '$wonAt' },
              month: { $month: '$wonAt' },
            },
            count:      { $sum: 1 },
            totalValue: { $sum: '$estimatedDealValue' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 6 },
      ]),

      // 5. Upcoming follow-ups (next 7 days)
      SalesFollowUp.find({
        ...tf,
        status: 'pending',
        scheduledAt: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86400000) },
      })
        .sort({ scheduledAt: 1 })
        .limit(10)
        .populate('prospectId', 'companyName contactPerson stage')
        .populate('assignedTo', 'name avatar'),

      // 6. Overdue follow-ups
      SalesFollowUp.countDocuments({
        ...tf,
        status: 'pending',
        scheduledAt: { $lt: new Date() },
      }),

      // 7. Salesperson-wise counts
      SalesProspect.aggregate([
        { $match: { ...tf, assignedSalesperson: { $exists: true, $ne: null } } },
        {
          $group: {
            _id:        '$assignedSalesperson',
            total:      { $sum: 1 },
            won:        { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
            lost:       { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
            totalValue: { $sum: '$estimatedDealValue' },
            wonValue:   { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$estimatedDealValue', 0] } },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),

      // 8. Service-wise distribution
      SalesProspect.aggregate([
        { $match: tf },
        { $unwind: { path: '$interestedServices', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$interestedServices', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Build counts map
    const countsMap = {};
    STAGES.forEach(s => { countsMap[s] = 0; });
    stageBreakdown.forEach(r => { countsMap[r._id] = r.count; });

    const valueMap = {};
    STAGES.forEach(s => { valueMap[s] = 0; });
    dealValueByStage.forEach(r => { valueMap[r._id] = r.totalValue; });

    const activeDealStages = ['contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation'];
    const activeDeals = activeDealStages.reduce((s, st) => s + (countsMap[st] || 0), 0);

    const expectedDealValue = activeDealStages.reduce((s, st) => s + (valueMap[st] || 0), 0)
      + (valueMap['new_prospect'] || 0);

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalProspects,
          activeDeals,
          meetingsScheduled:    countsMap['meeting_scheduled'] || 0,
          proposalsSent:        countsMap['proposal_sent']     || 0,
          wonDeals:             countsMap['won']               || 0,
          lostDeals:            countsMap['lost']              || 0,
          expectedDealValue,
          wonDealValue:         valueMap['won']                || 0,
          overdueFollowUps,
        },
        stageBreakdown:    countsMap,
        dealValueByStage:  valueMap,
        monthlyWon,
        upcomingFollowUps,
        salespersonStats,
        serviceDistribution,
      },
    });
  } catch (err) { next(err); }
};

// ─── KANBAN (all prospects grouped by stage) ──────────────────────────────────
exports.getKanban = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { search, assignedSalesperson, service, dateFrom, dateTo } = req.query;

    const filter = { ...tf };
    if (search) {
      filter.$or = [
        { companyName:   { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email:         { $regex: search, $options: 'i' } },
      ];
    }
    if (assignedSalesperson && mongoose.Types.ObjectId.isValid(assignedSalesperson)) {
      filter.assignedSalesperson = new mongoose.Types.ObjectId(assignedSalesperson);
    }
    if (service) {
      filter.interestedServices = service;
    }
    if (dateFrom || dateTo) {
      filter.expectedClosingDate = {};
      if (dateFrom) filter.expectedClosingDate.$gte = new Date(dateFrom);
      if (dateTo)   filter.expectedClosingDate.$lte = new Date(dateTo);
    }

    const prospects = await SalesProspect.find(filter)
      .populate('assignedSalesperson', 'name avatar')
      .sort({ kanbanOrder: 1, createdAt: -1 });

    // Group by stage
    const board = {};
    STAGES.forEach(s => { board[s] = []; });
    prospects.forEach(p => { if (board[p.stage]) board[p.stage].push(p); });

    res.status(200).json({ success: true, data: board, stages: STAGES });
  } catch (err) { next(err); }
};

// ─── LIST PROSPECTS ───────────────────────────────────────────────────────────
exports.getProspects = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { stage, search, assignedSalesperson, service, page = 1, limit = 20 } = req.query;

    const filter = { ...tf };
    if (stage) filter.stage = stage;
    if (search) {
      filter.$or = [
        { companyName:   { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email:         { $regex: search, $options: 'i' } },
      ];
    }
    if (assignedSalesperson && mongoose.Types.ObjectId.isValid(assignedSalesperson)) {
      filter.assignedSalesperson = new mongoose.Types.ObjectId(assignedSalesperson);
    }
    if (service) filter.interestedServices = service;

    const skip = (Number(page) - 1) * Number(limit);
    const [prospects, total] = await Promise.all([
      SalesProspect.find(filter)
        .populate('assignedSalesperson', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SalesProspect.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, data: prospects, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
};

// ─── GET SINGLE PROSPECT ──────────────────────────────────────────────────────
exports.getProspect = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf })
      .populate('assignedSalesperson', 'name avatar email')
      .populate('convertedClientId', 'companyName')
      .populate('stageHistory.changedBy', 'name');

    if (!prospect) return notFound(res);
    res.status(200).json({ success: true, data: prospect });
  } catch (err) { next(err); }
};

// ─── CREATE PROSPECT ──────────────────────────────────────────────────────────
exports.createProspect = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tenantId = injectTenantId(req);

    const {
      companyName, contactPerson, phone, email, website, industry, businessLocation,
      interestedServices, dealType, estimatedDealValue, expectedClosingDate,
      assignedSalesperson, leadSource, stage,
      nextFollowUpDate, followUpTime, followUpNotes,
      notes, remarks,
    } = req.body;

    if (!companyName || !contactPerson) {
      return res.status(400).json({ success: false, message: 'Company name and contact person are required' });
    }

    const initialStage = (stage && STAGES.includes(stage)) ? stage : 'new_prospect';

    const prospect = await SalesProspect.create({
      companyName, contactPerson, phone, email, website, industry, businessLocation,
      interestedServices: Array.isArray(interestedServices) ? interestedServices : [],
      dealType, estimatedDealValue: Number(estimatedDealValue) || 0,
      expectedClosingDate: expectedClosingDate || null,
      assignedSalesperson: assignedSalesperson && mongoose.Types.ObjectId.isValid(assignedSalesperson)
        ? assignedSalesperson : null,
      leadSource: leadSource || 'other',
      stage: initialStage,
      stageHistory: [{
        fromStage: null,
        toStage:   initialStage,
        changedBy: req.user._id,
        notes:     'Prospect created',
      }],
      nextFollowUpDate: nextFollowUpDate || null,
      followUpTime:     followUpTime  || '',
      followUpNotes:    followUpNotes || '',
      notes:   notes   || '',
      remarks: remarks || '',
      createdBy: req.user._id,
      tenantId,
    });

    // Log creation activity
    await SalesActivity.create({
      prospectId: prospect._id,
      type:        'note',
      description: 'Prospect created',
      createdBy:   req.user._id,
      tenantId,
    });

    const populated = await SalesProspect.findById(prospect._id)
      .populate('assignedSalesperson', 'name avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// ─── UPDATE PROSPECT ──────────────────────────────────────────────────────────
exports.updateProspect = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    // Prevent stage changes via generic update (use changeStage endpoint instead)
    const { stage, stageHistory, convertedClientId, convertedAt, wonAt, lostAt, ...updateData } = req.body;

    // Sanitize assignedSalesperson
    if (updateData.assignedSalesperson !== undefined) {
      updateData.assignedSalesperson = updateData.assignedSalesperson &&
        mongoose.Types.ObjectId.isValid(updateData.assignedSalesperson)
        ? updateData.assignedSalesperson : null;
    }

    if (updateData.estimatedDealValue !== undefined) {
      updateData.estimatedDealValue = Number(updateData.estimatedDealValue) || 0;
    }

    const prospect = await SalesProspect.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('assignedSalesperson', 'name avatar');

    if (!prospect) return notFound(res);
    res.status(200).json({ success: true, data: prospect });
  } catch (err) { next(err); }
};

// ─── CHANGE STAGE ─────────────────────────────────────────────────────────────
exports.changeStage = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { stage: newStage, notes = '', lostReason = '', lostNotes = '' } = req.body;

    if (!STAGES.includes(newStage)) {
      return res.status(400).json({ success: false, message: `Invalid stage. Valid stages: ${STAGES.join(', ')}` });
    }

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    if (prospect.stage === newStage) {
      return res.status(400).json({ success: false, message: 'Prospect is already in this stage' });
    }

    // Validation for special stages
    if (newStage === 'lost' && !lostReason) {
      return res.status(400).json({ success: false, message: 'Lost reason is required when marking as lost' });
    }

    const fromStage = prospect.stage;
    prospect.stage = newStage;
    prospect.stageHistory.push({
      fromStage,
      toStage:   newStage,
      changedBy: req.user._id,
      notes,
    });

    if (newStage === 'won')  { prospect.wonAt  = new Date(); }
    if (newStage === 'lost') {
      prospect.lostAt     = new Date();
      prospect.lostReason = lostReason;
      prospect.lostNotes  = lostNotes;
    }

    await prospect.save();

    // Log stage change activity
    const tenantId = injectTenantId(req);
    await SalesActivity.create({
      prospectId:  prospect._id,
      type:        'stage_change',
      description: `Stage changed: ${fromStage} → ${newStage}`,
      fromStage,
      toStage:     newStage,
      outcome:     notes,
      createdBy:   req.user._id,
      tenantId,
    });

    const populated = await SalesProspect.findById(prospect._id)
      .populate('assignedSalesperson', 'name avatar')
      .populate('stageHistory.changedBy', 'name');

    res.status(200).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// ─── UPDATE KANBAN ORDER (drag-and-drop) ──────────────────────────────────────
exports.updateKanbanOrder = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { stage: newStage, kanbanOrder, notes = '' } = req.body;

    if (!STAGES.includes(newStage)) {
      return res.status(400).json({ success: false, message: 'Invalid stage' });
    }

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const fromStage = prospect.stage;
    const tenantId  = injectTenantId(req);

    if (newStage === 'lost' && fromStage !== 'lost') {
      return res.status(400).json({
        success: false,
        message: 'Use the stage change endpoint to mark as Lost (requires a lost reason)',
      });
    }
    if (newStage === 'won' && fromStage !== 'won') {
      return res.status(400).json({
        success: false,
        message: 'Use the stage change endpoint to mark as Won',
      });
    }

    prospect.kanbanOrder = kanbanOrder ?? 0;

    if (newStage !== fromStage) {
      prospect.stage = newStage;
      prospect.stageHistory.push({
        fromStage,
        toStage:   newStage,
        changedBy: req.user._id,
        notes,
      });
      await SalesActivity.create({
        prospectId:  prospect._id,
        type:        'stage_change',
        description: `Stage changed via Kanban: ${fromStage} → ${newStage}`,
        fromStage,
        toStage:     newStage,
        createdBy:   req.user._id,
        tenantId,
      });
    }

    await prospect.save();
    const populated = await SalesProspect.findById(prospect._id)
      .populate('assignedSalesperson', 'name avatar');

    res.status(200).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// ─── DELETE PROSPECT ──────────────────────────────────────────────────────────
exports.deleteProspect = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const prospect = await SalesProspect.findOneAndDelete({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    // Clean up activities and follow-ups
    await Promise.all([
      SalesActivity.deleteMany({ prospectId: prospect._id }),
      SalesFollowUp.deleteMany({ prospectId: prospect._id }),
    ]);

    res.status(200).json({ success: true, message: 'Prospect deleted' });
  } catch (err) { next(err); }
};

// ─── CONVERT TO CLIENT ────────────────────────────────────────────────────────
exports.convertToClient = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tenantId = injectTenantId(req);

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);
    if (prospect.stage !== 'won') {
      return res.status(400).json({ success: false, message: 'Only Won prospects can be converted to clients' });
    }
    if (prospect.convertedClientId) {
      return res.status(400).json({ success: false, message: 'This prospect has already been converted to a client' });
    }

    // Duplicate check by email
    if (prospect.email) {
      const existing = await Client.findOne({ email: prospect.email, ...tf });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `A client with email "${prospect.email}" already exists`,
          existingClientId: existing._id,
        });
      }
    }

    const clientData = {
      companyName:   prospect.companyName,
      contactPerson: prospect.contactPerson,
      phone:         prospect.phone || '',
      email:         prospect.email || `noemail+${prospect._id}@placeholder.local`,
      website:       prospect.website || '',
      industry:      prospect.industry || '',
      status:        'active',
      notes:         prospect.notes || '',
      createdBy:     req.user._id,
      tenantId,
    };

    const client = await Client.create(clientData);

    prospect.convertedClientId = client._id;
    prospect.convertedAt       = new Date();
    await prospect.save();

    await SalesActivity.create({
      prospectId:  prospect._id,
      type:        'note',
      description: `Converted to client: ${client.companyName} (ID: ${client._id})`,
      createdBy:   req.user._id,
      tenantId,
    });

    res.status(201).json({ success: true, data: { prospect, client } });
  } catch (err) { next(err); }
};

// ─── UPDATE PROPOSAL ──────────────────────────────────────────────────────────
exports.updateProposal = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { status, sentDate, amount, notes } = req.body;

    const updateFields = {};
    if (status !== undefined)   updateFields['proposal.status']   = status;
    if (sentDate !== undefined) updateFields['proposal.sentDate'] = sentDate || null;
    if (amount !== undefined)   updateFields['proposal.amount']   = Number(amount) || 0;
    if (notes !== undefined)    updateFields['proposal.notes']    = notes;

    const prospect = await SalesProspect.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('assignedSalesperson', 'name avatar');

    if (!prospect) return notFound(res);

    // Auto-advance to proposal_sent stage if status is 'sent' and not already past that
    const tenantId = injectTenantId(req);
    const advanceableStages = ['new_prospect', 'contacted', 'meeting_scheduled'];
    if (status === 'sent' && advanceableStages.includes(prospect.stage)) {
      const fromStage = prospect.stage;
      prospect.stage = 'proposal_sent';
      prospect.stageHistory.push({
        fromStage,
        toStage:   'proposal_sent',
        changedBy: req.user._id,
        notes:     'Proposal sent',
      });
      await prospect.save();
      await SalesActivity.create({
        prospectId:  prospect._id,
        type:        'proposal',
        description: 'Proposal status updated to Sent',
        createdBy:   req.user._id,
        tenantId,
      });
    } else {
      await SalesActivity.create({
        prospectId:  prospect._id,
        type:        'proposal',
        description: `Proposal updated: status = ${status || prospect.proposal.status}`,
        createdBy:   req.user._id,
        tenantId,
      });
    }

    const updated = await SalesProspect.findById(prospect._id)
      .populate('assignedSalesperson', 'name avatar');

    res.status(200).json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// ─── ACTIVITIES ───────────────────────────────────────────────────────────────
exports.getActivities = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const activities = await SalesActivity.find({ prospectId: req.params.id })
      .populate('createdBy', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, data: activities });
  } catch (err) { next(err); }
};

exports.addActivity = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tenantId = injectTenantId(req);

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const { type, description, outcome, scheduledAt, completedAt } = req.body;

    if (!type || !description) {
      return res.status(400).json({ success: false, message: 'Type and description are required' });
    }

    const activity = await SalesActivity.create({
      prospectId:  prospect._id,
      type,
      description,
      outcome:     outcome     || '',
      scheduledAt: scheduledAt || null,
      completedAt: completedAt || null,
      createdBy:   req.user._id,
      tenantId,
    });

    const populated = await SalesActivity.findById(activity._id)
      .populate('createdBy', 'name avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

// ─── FOLLOW-UPS ───────────────────────────────────────────────────────────────
exports.getFollowUps = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const followUps = await SalesFollowUp.find({ prospectId: req.params.id })
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar')
      .sort({ scheduledAt: 1 });

    res.status(200).json({ success: true, data: followUps });
  } catch (err) { next(err); }
};

exports.addFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tenantId = injectTenantId(req);

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const { scheduledAt, mode, title, notes, assignedTo } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'scheduledAt is required' });
    }

    const followUp = await SalesFollowUp.create({
      prospectId:  prospect._id,
      scheduledAt: new Date(scheduledAt),
      mode:        mode       || 'phone',
      title:       title      || '',
      notes:       notes      || '',
      assignedTo:  assignedTo && mongoose.Types.ObjectId.isValid(assignedTo) ? assignedTo : null,
      createdBy:   req.user._id,
      tenantId,
    });

    // Update prospect's nextFollowUpDate if this is sooner
    if (!prospect.nextFollowUpDate || new Date(scheduledAt) < prospect.nextFollowUpDate) {
      await SalesProspect.findByIdAndUpdate(prospect._id, { nextFollowUpDate: new Date(scheduledAt) });
    }

    const populated = await SalesFollowUp.findById(followUp._id)
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

exports.updateFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tenantId = injectTenantId(req);

    const prospect = await SalesProspect.findOne({ _id: req.params.id, ...tf });
    if (!prospect) return notFound(res);

    const { status, outcome, completedAt, notes, scheduledAt, mode } = req.body;
    const updateFields = {};
    if (status !== undefined)      updateFields.status      = status;
    if (outcome !== undefined)     updateFields.outcome     = outcome;
    if (notes !== undefined)       updateFields.notes       = notes;
    if (scheduledAt !== undefined) updateFields.scheduledAt = scheduledAt;
    if (mode !== undefined)        updateFields.mode        = mode;
    if (status === 'completed')    updateFields.completedAt = completedAt || new Date();

    const followUp = await SalesFollowUp.findOneAndUpdate(
      { _id: req.params.followUpId, prospectId: req.params.id },
      { $set: updateFields },
      { new: true }
    ).populate('assignedTo', 'name avatar').populate('createdBy', 'name avatar');

    if (!followUp) {
      return res.status(404).json({ success: false, message: 'Follow-up not found' });
    }

    if (status === 'completed') {
      await SalesActivity.create({
        prospectId:  prospect._id,
        type:        'follow_up',
        description: `Follow-up completed: ${followUp.title || followUp.mode}`,
        outcome:     outcome || '',
        completedAt: updateFields.completedAt,
        createdBy:   req.user._id,
        tenantId,
      });
    }

    res.status(200).json({ success: true, data: followUp });
  } catch (err) { next(err); }
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────
exports.getReports = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const {
      dateFrom, dateTo,
      salesperson, stage,
      service, dealType,
    } = req.query;

    const filter = { ...tf };
    if (stage)      filter.stage = stage;
    if (dealType)   filter.dealType = dealType;
    if (service)    filter.interestedServices = service;
    if (salesperson && mongoose.Types.ObjectId.isValid(salesperson)) {
      filter.assignedSalesperson = new mongoose.Types.ObjectId(salesperson);
    }
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(dateTo);
    }

    const [
      totalByStage,
      valueByStage,
      salespersonPerformance,
      serviceDistribution,
      dealTypeBreakdown,
      monthlyTrend,
      conversionRate,
    ] = await Promise.all([

      SalesProspect.aggregate([
        { $match: filter },
        { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$estimatedDealValue' } } },
      ]),

      SalesProspect.aggregate([
        { $match: filter },
        { $group: { _id: '$stage', totalValue: { $sum: '$estimatedDealValue' }, avgValue: { $avg: '$estimatedDealValue' } } },
      ]),

      SalesProspect.aggregate([
        { $match: { ...filter, assignedSalesperson: { $exists: true, $ne: null } } },
        {
          $group: {
            _id:         '$assignedSalesperson',
            total:       { $sum: 1 },
            won:         { $sum: { $cond: [{ $eq: ['$stage', 'won']  }, 1, 0] } },
            lost:        { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
            totalValue:  { $sum: '$estimatedDealValue' },
            wonValue:    { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$estimatedDealValue', 0] } },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $sort: { total: -1 } },
      ]),

      SalesProspect.aggregate([
        { $match: filter },
        { $unwind: { path: '$interestedServices', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$interestedServices', count: { $sum: 1 }, totalValue: { $sum: '$estimatedDealValue' } } },
        { $sort: { count: -1 } },
      ]),

      SalesProspect.aggregate([
        { $match: filter },
        { $group: { _id: '$dealType', count: { $sum: 1 }, totalValue: { $sum: '$estimatedDealValue' } } },
      ]),

      SalesProspect.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              year:  { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            created:    { $sum: 1 },
            won:        { $sum: { $cond: [{ $eq: ['$stage', 'won']  }, 1, 0] } },
            lost:       { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
            totalValue: { $sum: '$estimatedDealValue' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 },
      ]),

      // Conversion rate: won / (won + lost) * 100
      SalesProspect.aggregate([
        { $match: filter },
        {
          $group: {
            _id:  null,
            won:  { $sum: { $cond: [{ $eq: ['$stage', 'won']  }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
            totalValue: { $sum: '$estimatedDealValue' },
            wonValue:   { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$estimatedDealValue', 0] } },
            avgValue:   { $avg: '$estimatedDealValue' },
          },
        },
      ]),
    ]);

    const cr = conversionRate[0] || { won: 0, lost: 0, totalValue: 0, wonValue: 0, avgValue: 0 };
    const closedTotal = cr.won + cr.lost;

    res.status(200).json({
      success: true,
      data: {
        totalByStage,
        valueByStage,
        salespersonPerformance,
        serviceDistribution,
        dealTypeBreakdown,
        monthlyTrend,
        summary: {
          wonDeals:        cr.won,
          lostDeals:       cr.lost,
          conversionRate:  closedTotal > 0 ? Math.round((cr.won / closedTotal) * 100) : 0,
          totalDealValue:  cr.totalValue,
          wonDealValue:    cr.wonValue,
          avgDealValue:    Math.round(cr.avgValue || 0),
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── GET SALESPEOPLE (users in the tenant) ────────────────────────────────────
exports.getSalespeople = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const users = await User.find({
      ...tf,
      isActive: true,
      status: 'active',
      role: { $ne: 'platform_super_admin' },
    }).select('name email avatar role').sort({ name: 1 });

    res.status(200).json({ success: true, data: users });
  } catch (err) { next(err); }
};
