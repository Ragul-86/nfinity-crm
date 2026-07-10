/**
 * analyticsController.js
 * Phase 9 — Executive Command Center + Enhanced Reports & Analytics
 *
 * All queries respect tenantId isolation via getTenantFilter().
 * No existing data is modified or renamed.
 */

const Client       = require('../models/Client');
const Lead         = require('../models/Lead');
const Campaign     = require('../models/Campaign');
const Task         = require('../models/Task');
const SOP          = require('../models/SOP');
const SOPAssignment = require('../models/SOPAssignment');
const User         = require('../models/User');
const Attendance   = require('../models/Attendance');
const Invoice      = require('../models/Invoice');
const Payment      = require('../models/Payment');
const Quotation    = require('../models/Quotation');
const FollowUp     = require('../models/FollowUp');
const Meeting      = require('../models/Meeting');
const ClientActivity = require('../models/ClientActivity');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfLastMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}
function endOfLastMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── EXECUTIVE COMMAND CENTER KPIs ────────────────────────────────────────────
exports.getCommandCenterKPIs = async (req, res, next) => {
  try {
    const tf  = getTenantFilter(req);
    const now = new Date();
    const todayStart  = startOfDay(now);
    const todayEnd    = endOfDay(now);
    const monthStart  = startOfMonth(now);
    const lmStart     = startOfLastMonth(now);
    const lmEnd       = endOfLastMonth(now);

    const [
      // Today
      todayLeads,
      todayClients,
      // Monthly
      monthLeads,
      monthClients,
      lastMonthLeads,
      lastMonthClients,
      // Finance
      todayRevenueDocs,
      monthRevenueDocs,
      lastMonthRevenueDocs,
      pendingCollectionDocs,
      overdueInvoiceCount,
      // Invoices + Quotations
      invoicesToday,
      quotationsToday,
      // Pipeline
      wonLeadsTotal,
      totalLeads,
      pipelineValueDocs,
      // Tasks
      tasksDueToday,
      followUpsDueToday,
      // SOP
      sopStats,
      // Team
      activeUsers,
      // Renewals (clients with renewalDate in next 30 days)
      upcomingRenewals,
    ] = await Promise.all([
      Lead.countDocuments({ ...tf, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Client.countDocuments({ ...tf, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Lead.countDocuments({ ...tf, createdAt: { $gte: monthStart } }),
      Client.countDocuments({ ...tf, createdAt: { $gte: monthStart } }),
      Lead.countDocuments({ ...tf, createdAt: { $gte: lmStart, $lte: lmEnd } }),
      Client.countDocuments({ ...tf, createdAt: { $gte: lmStart, $lte: lmEnd } }),
      // Today's payments
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Monthly payments
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Last month payments
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: lmStart, $lte: lmEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Pending collection (outstanding)
      Invoice.aggregate([
        { $match: { ...tf, status: { $nin: ['paid', 'cancelled'] }, outstanding: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$outstanding' } } },
      ]),
      Invoice.countDocuments({ ...tf, status: 'overdue' }),
      Invoice.countDocuments({ ...tf, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Quotation.countDocuments({ ...tf, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      Lead.countDocuments({ ...tf, status: 'won' }),
      Lead.countDocuments({ ...tf }),
      // Pipeline value from leads with expectedRevenue
      Lead.aggregate([
        { $match: { ...tf, status: { $nin: ['won','lost'] } } },
        { $group: { _id: null, total: { $sum: '$expectedRevenue' } } },
      ]),
      Task.countDocuments({ ...tf, status: { $ne: 'completed' }, dueDate: { $gte: todayStart, $lte: todayEnd } }),
      FollowUp.countDocuments({ ...tf, status: 'pending', scheduledAt: { $gte: todayStart, $lte: todayEnd } }),
      SOPAssignment.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ ...tf, isActive: true, role: { $ne: 'platform_super_admin' } }),
      Client.countDocuments({ ...tf, renewalDate: { $gte: now, $lte: new Date(now.getTime() + 30 * 86400000) } }),
    ]);

    const todayRevenue   = todayRevenueDocs[0]?.total   || 0;
    const monthRevenue   = monthRevenueDocs[0]?.total   || 0;
    const lmRevenue      = lastMonthRevenueDocs[0]?.total || 0;
    const pendingAmount  = pendingCollectionDocs[0]?.total || 0;
    const pipelineValue  = pipelineValueDocs[0]?.total  || 0;
    const conversionRate = totalLeads > 0 ? +((wonLeadsTotal / totalLeads) * 100).toFixed(1) : 0;

    const sopByStatus = {};
    sopStats.forEach(s => { sopByStatus[s._id] = s.count; });

    res.json({
      success: true,
      data: {
        todayLeads,
        newCustomers: todayClients,
        todayRevenue,
        monthRevenue,
        pendingCollection: pendingAmount,
        overdueInvoices: overdueInvoiceCount,
        invoicesToday,
        quotationsToday,
        conversionRate,
        pipelineValue,
        wonDeals: wonLeadsTotal,
        lostDeals: await Lead.countDocuments({ ...tf, status: 'lost' }),
        tasksDueToday,
        followUpsDueToday,
        activeTeamMembers: activeUsers,
        upcomingRenewals,
        monthLeads,
        monthClients,
        // Month-over-month changes
        leadsMoM:    lastMonthLeads  > 0 ? +(((monthLeads   - lastMonthLeads)  / lastMonthLeads)  * 100).toFixed(1) : null,
        clientsMoM:  lastMonthClients > 0 ? +(((monthClients - lastMonthClients) / lastMonthClients) * 100).toFixed(1) : null,
        revenueMoM:  lmRevenue > 0 ? +(((monthRevenue - lmRevenue) / lmRevenue) * 100).toFixed(1) : null,
        sopCompleted: sopByStatus['completed'] || 0,
        sopPending:   (sopByStatus['in_progress'] || 0) + (sopByStatus['assigned'] || 0),
      },
    });

    // Fire-and-forget audit
    logAction(req, { action: 'dashboard_access', resourceType: 'Analytics', details: 'Executive KPIs accessed' }).catch(() => {});
  } catch (e) { next(e); }
};

// ─── PIPELINE SNAPSHOT ────────────────────────────────────────────────────────
exports.getPipelineSnapshot = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const STAGES = ['new_lead','contacted','discovery_call','proposal_sent','negotiation','won','lost'];

    const [stageCounts, stageValues, avgClosing] = await Promise.all([
      Lead.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, status: { $nin: ['won','lost'] } } },
        { $group: { _id: '$status', value: { $sum: '$expectedRevenue' } } },
      ]),
      // Avg days from createdAt → updatedAt for won leads
      Lead.aggregate([
        { $match: { ...tf, status: 'won' } },
        { $project: { days: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$days' } } },
      ]),
    ]);

    const countMap = {};
    stageCounts.forEach(s => { countMap[s._id] = s.count; });
    const valueMap = {};
    stageValues.forEach(s => { valueMap[s._id] = s.value; });

    const stages = STAGES.map(key => ({
      key,
      count: countMap[key] || 0,
      value: valueMap[key] || 0,
    }));

    const total = stages.reduce((s, st) => s + st.count, 0);
    const won   = countMap['won'] || 0;
    const lost  = countMap['lost'] || 0;
    const wonPct  = total > 0 ? +((won / total) * 100).toFixed(1) : 0;
    const lostPct = total > 0 ? +((lost / total) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        stages,
        total,
        wonPct,
        lostPct,
        avgClosingDays: +(avgClosing[0]?.avg || 0).toFixed(1),
        pipelineValue: stages.filter(s => !['won','lost'].includes(s.key)).reduce((s, st) => s + st.value, 0),
      },
    });
  } catch (e) { next(e); }
};

// ─── FINANCE SNAPSHOT ─────────────────────────────────────────────────────────
exports.getFinanceSnapshot = async (req, res, next) => {
  try {
    const tf  = getTenantFilter(req);
    const now = new Date();
    const todayStart  = startOfDay(now);
    const todayEnd    = endOfDay(now);
    const monthStart  = startOfMonth(now);

    const [todayPay, monthPay, outstanding, overdue, paidInvoices, pendingInvoices, gst] = await Promise.all([
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Invoice.aggregate([
        { $match: { ...tf, status: { $nin: ['paid','cancelled'] }, outstanding: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$outstanding' } } },
      ]),
      Invoice.aggregate([
        { $match: { ...tf, status: 'overdue' } },
        { $group: { _id: null, total: { $sum: '$outstanding' }, count: { $sum: 1 } } },
      ]),
      Invoice.countDocuments({ ...tf, status: 'paid' }),
      Invoice.countDocuments({ ...tf, status: { $in: ['sent','draft','partial'] } }),
      Invoice.aggregate([
        { $match: { ...tf, gstType: { $ne: 'non_gst' }, status: { $ne: 'cancelled' }, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' } } },
      ]),
    ]);

    const gstData = gst[0] || { cgst: 0, sgst: 0, igst: 0 };

    res.json({
      success: true,
      data: {
        todayCollection: todayPay[0]?.total || 0,
        monthlyCollection: monthPay[0]?.total || 0,
        outstandingAmount: outstanding[0]?.total || 0,
        overdueAmount: overdue[0]?.total || 0,
        overdueCount: overdue[0]?.count || 0,
        paidInvoices,
        pendingInvoices,
        gstMonth: { cgst: gstData.cgst, sgst: gstData.sgst, igst: gstData.igst, total: gstData.cgst + gstData.sgst + gstData.igst },
      },
    });
  } catch (e) { next(e); }
};

// ─── TEAM SNAPSHOT ────────────────────────────────────────────────────────────
exports.getTeamSnapshot = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd   = endOfDay(now);
    const monthStart = startOfMonth(now);

    const [
      activeEmployees,
      pendingTasks,
      completedTasksToday,
      topPerformerRaw,
      mostActiveRaw,
    ] = await Promise.all([
      User.countDocuments({ ...tf, isActive: true, role: { $ne: 'platform_super_admin' } }),
      Task.countDocuments({ ...tf, status: { $ne: 'completed' } }),
      Task.countDocuments({ ...tf, status: 'completed', updatedAt: { $gte: todayStart, $lte: todayEnd } }),
      // Top performer: most won leads this month — unwind array before grouping
      Lead.aggregate([
        { $match: { ...tf, status: 'won', updatedAt: { $gte: monthStart } } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo', won: { $sum: 1 } } },
        { $sort: { won: -1 } },
        { $limit: 1 },
      ]),
      // Most active: most tasks completed this month — unwind array before grouping
      Task.aggregate([
        { $match: { ...tf, status: 'completed', updatedAt: { $gte: monthStart } } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo', done: { $sum: 1 } } },
        { $sort: { done: -1 } },
        { $limit: 1 },
      ]),
    ]);

    // Separate lookups to avoid $lookup on array-typed _id
    const [topPerformerUser, mostActiveUser] = await Promise.all([
      topPerformerRaw[0]?._id ? User.findById(topPerformerRaw[0]._id).select('name').lean() : null,
      mostActiveRaw[0]?._id   ? User.findById(mostActiveRaw[0]._id).select('name').lean()   : null,
    ]);

    res.json({
      success: true,
      data: {
        activeEmployees,
        pendingTasks,
        completedTasksToday,
        topPerformer: topPerformerRaw[0] ? { name: topPerformerUser?.name || 'Unknown', wonDeals: topPerformerRaw[0].won } : null,
        mostActiveEmployee: mostActiveRaw[0] ? { name: mostActiveUser?.name || 'Unknown', tasksCompleted: mostActiveRaw[0].done } : null,
      },
    });
  } catch (e) { next(e); }
};

// ─── CUSTOMER SNAPSHOT ────────────────────────────────────────────────────────
exports.getCustomerSnapshot = async (req, res, next) => {
  try {
    const tf  = getTenantFilter(req);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const in30 = new Date(now.getTime() + 30 * 86400000);

    const [
      totalActive,
      totalInactive,
      newThisMonth,
      renewalsDue,
      outstanding,
      topRevClients,
    ] = await Promise.all([
      Client.countDocuments({ ...tf, status: 'active' }),
      Client.countDocuments({ ...tf, status: { $in: ['inactive','paused'] } }),
      Client.countDocuments({ ...tf, createdAt: { $gte: monthStart } }),
      Client.countDocuments({ ...tf, renewalDate: { $gte: now, $lte: in30 } }),
      Client.countDocuments({ ...tf, outstandingAmount: { $gt: 0 } }),
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$client', revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    // Separate lookup to avoid $lookup on possibly-null _id
    const clientIds = topRevClients.map(r => r._id).filter(Boolean);
    const clientDocs = clientIds.length
      ? await Client.find({ _id: { $in: clientIds } }).select('companyName').lean()
      : [];
    const clientMap = {};
    clientDocs.forEach(c => { clientMap[String(c._id)] = c.companyName; });
    const topRevClientsFormatted = topRevClients.map(r => ({
      _id: r._id,
      name: r._id ? (clientMap[String(r._id)] || 'Unknown') : 'Unknown',
      revenue: r.revenue,
    }));

    res.json({
      success: true,
      data: {
        totalActive,
        totalInactive,
        newThisMonth,
        renewalsDue,
        outstandingClients: outstanding,
        totalClients: totalActive + totalInactive,
        topRevClients: topRevClientsFormatted,
      },
    });
  } catch (e) { next(e); }
};

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────
exports.getActivityFeed = async (req, res, next) => {
  try {
    const tf    = getTenantFilter(req);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const activities = await ClientActivity.find({ ...tf })
      .sort('-createdAt')
      .limit(limit)
      .populate('performedBy', 'name avatar')
      .populate('client', 'companyName')
      .lean();

    res.json({ success: true, data: activities });
  } catch (e) { next(e); }
};

// ─── MY WORK (role-aware personalized section) ────────────────────────────────
exports.getMyWork = async (req, res, next) => {
  try {
    const tf     = getTenantFilter(req);
    const userId = req.user._id;
    const now    = new Date();
    const todayStart = startOfDay(now);
    const todayEnd   = endOfDay(now);
    const in7     = new Date(now.getTime() + 7 * 86400000);

    const [
      myTasksToday,
      followUpsToday,
      upcomingMeetings,
      pendingSOPs,
      assignedLeads,
    ] = await Promise.all([
      Task.find({ ...tf, assignedTo: userId, status: { $ne: 'completed' }, dueDate: { $gte: todayStart, $lte: todayEnd } })
        .sort('dueDate').limit(5).lean(),
      FollowUp.find({ ...tf, createdBy: userId, status: 'pending', scheduledAt: { $gte: todayStart, $lte: todayEnd } })
        .sort('scheduledAt').limit(5)
        .populate('lead', 'name')
        .populate('client', 'companyName')
        .lean(),
      Meeting.find({ ...tf, $or: [{ createdBy: userId }, { attendees: userId }], status: 'scheduled', date: { $gte: now, $lte: in7 } })
        .sort('date').limit(5)
        .populate('client', 'companyName')
        .lean(),
      SOPAssignment.find({ ...tf, assignedTo: userId, status: { $nin: ['completed','archived'] } })
        .sort('-updatedAt').limit(5)
        .populate('sop', 'title')
        .lean(),
      Lead.find({ ...tf, assignedTo: userId, status: { $nin: ['won','lost'] } })
        .sort('-updatedAt').limit(5)
        .lean(),
    ]);

    res.json({
      success: true,
      data: { myTasksToday, followUpsToday, upcomingMeetings, pendingSOPs, assignedLeads },
    });
  } catch (e) { next(e); }
};

// ─── SALES PERFORMANCE ────────────────────────────────────────────────────────
exports.getSalesPerformance = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const now = new Date();
    const monthStart = startOfMonth(now);

    const [leadsByOwner, followUpsByOwner, tasksByOwner] = await Promise.all([
      Lead.aggregate([
        { $match: { ...tf, status: 'won', updatedAt: { $gte: monthStart } } },
        { $group: { _id: '$assignedTo', wonDeals: { $sum: 1 }, totalValue: { $sum: '$expectedRevenue' } } },
        { $sort: { wonDeals: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { name: '$user.name', wonDeals: 1, totalValue: 1 } },
      ]),
      FollowUp.aggregate([
        { $match: { ...tf, status: 'completed', updatedAt: { $gte: monthStart } } },
        { $group: { _id: '$createdBy', followUps: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { ...tf, status: 'completed', updatedAt: { $gte: monthStart } } },
        { $group: { _id: '$assignedTo', tasksCompleted: { $sum: 1 } } },
      ]),
    ]);

    const followUpMap = {};
    followUpsByOwner.forEach(f => { followUpMap[String(f._id)] = f.followUps; });
    const taskMap = {};
    tasksByOwner.forEach(t => { taskMap[String(t._id)] = t.tasksCompleted; });

    const teamPerformance = await Promise.all(
      (await User.find({ ...tf, role: { $ne: 'platform_super_admin' }, isActive: true }).select('name role').lean())
        .map(async u => {
          const uid = String(u._id);
          const [assignedLeads, wonDeals, pendingTasks, sopPct] = await Promise.all([
            Lead.countDocuments({ ...tf, assignedTo: u._id }),
            Lead.countDocuments({ ...tf, assignedTo: u._id, status: 'won' }),
            Task.countDocuments({ ...tf, assignedTo: u._id, status: { $ne: 'completed' } }),
            SOPAssignment.aggregate([
              { $match: { ...tf, assignedTo: u._id } },
              { $group: { _id: null, total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
            ]),
          ]);
          const sopArr = sopPct[0] || { total: 0, done: 0 };
          const sopCompletion = sopArr.total > 0 ? Math.round((sopArr.done / sopArr.total) * 100) : 0;
          return {
            name: u.name,
            role: u.role,
            assignedLeads,
            wonDeals,
            completedTasks: taskMap[uid] || 0,
            pendingTasks,
            followUps: followUpMap[uid] || 0,
            sopCompletion,
            revenue: leadsByOwner.find(l => String(l._id) === uid)?.totalValue || 0,
          };
        })
    );

    res.json({
      success: true,
      data: {
        topSalespeople: leadsByOwner,
        teamPerformance,
      },
    });
  } catch (e) { next(e); }
};

// ─── BUSINESS INSIGHTS ────────────────────────────────────────────────────────
exports.getBusinessInsights = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const now = new Date();
    const yearStart = startOfYear(now);

    const [
      bestSource,
      bestSalesPerson,
      bestMonth,
      fastestClosing,
      topCustomer,
      mostActiveEmp,
    ] = await Promise.all([
      // Best lead source
      Lead.aggregate([
        { $match: { ...tf, status: 'won', source: { $exists: true, $ne: '' } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
      // Best sales person this year — unwind array before grouping
      Lead.aggregate([
        { $match: { ...tf, status: 'won', updatedAt: { $gte: yearStart } } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo', won: { $sum: 1 } } },
        { $sort: { won: -1 } },
        { $limit: 1 },
      ]),
      // Best revenue month
      Payment.aggregate([
        { $match: { ...tf } },
        { $group: { _id: { month: { $month: '$paymentDate' }, year: { $year: '$paymentDate' } }, total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 1 },
      ]),
      // Fastest avg closing time (days)
      Lead.aggregate([
        { $match: { ...tf, status: 'won' } },
        { $project: { days: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$days' } } },
      ]),
      // Highest revenue customer
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$client', revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } },
        { $limit: 1 },
      ]),
      // Most active employee (tasks completed) — unwind array before grouping
      Task.aggregate([
        { $match: { ...tf, status: 'completed', updatedAt: { $gte: yearStart } } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo', done: { $sum: 1 } } },
        { $sort: { done: -1 } },
        { $limit: 1 },
      ]),
    ]);

    // Separate lookups to avoid $lookup on array-typed _id
    const [bestSalesUser, topCustomerDoc, mostActiveEmpUser] = await Promise.all([
      bestSalesPerson[0]?._id ? User.findById(bestSalesPerson[0]._id).select('name').lean()     : null,
      topCustomer[0]?._id     ? Client.findById(topCustomer[0]._id).select('companyName').lean() : null,
      mostActiveEmp[0]?._id   ? User.findById(mostActiveEmp[0]._id).select('name').lean()        : null,
    ]);

    const bm = bestMonth[0];
    const bestMonthLabel = bm ? `${MONTH_LABELS[(bm._id.month || 1) - 1]} ${bm._id.year}` : null;

    res.json({
      success: true,
      data: {
        bestLeadSource:      bestSource[0]       ? { source: bestSource[0]._id, count: bestSource[0].count }       : null,
        bestSalesPerson:     bestSalesPerson[0]  ? { name: bestSalesUser?.name || 'Unknown', wonDeals: bestSalesPerson[0].won } : null,
        bestRevenueMonth:    bm ? { label: bestMonthLabel, amount: bm.total } : null,
        avgClosingDays:      +(fastestClosing[0]?.avg || 0).toFixed(1),
        highestRevCustomer:  topCustomer[0]      ? { name: topCustomerDoc?.companyName || 'Unknown', revenue: topCustomer[0].revenue } : null,
        mostActiveEmployee:  mostActiveEmp[0]    ? { name: mostActiveEmpUser?.name || 'Unknown', tasksCompleted: mostActiveEmp[0].done } : null,
      },
    });
  } catch (e) { next(e); }
};

// ─── LEAD ANALYTICS ───────────────────────────────────────────────────────────
exports.getLeadAnalytics = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { year = new Date().getFullYear(), dateFrom, dateTo } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo, year, 'createdAt');

    const [bySource, byMonth, byStatus, byPriority, byOwner, funnel] = await Promise.all([
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // Conversion funnel
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const monthsData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
    }));

    res.json({
      success: true,
      data: { bySource, byMonth: monthsData, byStatus, byPriority, byOwner, funnel },
    });
  } catch (e) { next(e); }
};

// ─── REVENUE ANALYTICS ────────────────────────────────────────────────────────
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { year = new Date().getFullYear(), dateFrom, dateTo } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo, year, 'paymentDate');

    const [monthly, quarterly, byClient, byEmployee] = await Promise.all([
      Payment.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$paymentDate' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $ceil: { $divide: [{ $month: '$paymentDate' }, 3] } }, amount: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$client', revenue: { $sum: '$total' }, paid: { $sum: '$paidAmount' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      // Revenue by employee (who created the invoice / collected)
      Payment.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$collectedBy', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      amount: monthly.find(m => m._id === i + 1)?.amount || 0,
      count:  monthly.find(m => m._id === i + 1)?.count  || 0,
    }));

    const yearlyTotal = monthlyData.reduce((s, m) => s + m.amount, 0);

    const quarterlyData = [1, 2, 3, 4].map(q => ({
      quarter: `Q${q}`,
      amount: quarterly.find(d => d._id === q)?.amount || 0,
    }));

    // Separate lookups
    const clientIds = byClient.map(r => r._id).filter(Boolean);
    const empIds    = byEmployee.map(r => r._id).filter(Boolean);
    const [clientDocs, empDocs] = await Promise.all([
      clientIds.length ? Client.find({ _id: { $in: clientIds } }).select('companyName').lean() : [],
      empIds.length    ? User.find({ _id: { $in: empIds } }).select('name').lean()             : [],
    ]);
    const clientNameMap = {};
    clientDocs.forEach(c => { clientNameMap[String(c._id)] = c.companyName; });
    const empNameMap = {};
    empDocs.forEach(u => { empNameMap[String(u._id)] = u.name; });

    const byClientFormatted  = byClient.map(r => ({ _id: r._id, name: clientNameMap[String(r._id)] || 'Unknown', revenue: r.revenue, paid: r.paid }));
    const byEmployeeFormatted = byEmployee.map(r => ({ _id: r._id, name: empNameMap[String(r._id)] || 'Unknown', amount: r.amount }));

    res.json({
      success: true,
      data: { monthly: monthlyData, quarterly: quarterlyData, yearlyTotal, byClient: byClientFormatted, byEmployee: byEmployeeFormatted },
    });
  } catch (e) { next(e); }
};

// ─── TASK ANALYTICS ───────────────────────────────────────────────────────────
exports.getTaskAnalytics = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo } = req.query;

    const [byStatus, byEmployee, overdueCount, byPriority] = await Promise.all([
      Task.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { ...tf } },
        { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$assignedTo',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pending:   { $sum: { $cond: [{ $ne:  ['$status', 'completed'] }, 1, 0] } },
        } },
        { $sort: { completed: -1 } },
        { $limit: 10 },
      ]),
      Task.countDocuments({ ...tf, status: { $ne: 'completed' }, dueDate: { $lt: new Date() } }),
      Task.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = {};
    byStatus.forEach(s => { statusMap[s._id] = s.count; });

    // Separate lookup for employee names
    const empIds = byEmployee.map(r => r._id).filter(Boolean);
    const empDocs = empIds.length ? await User.find({ _id: { $in: empIds } }).select('name').lean() : [];
    const empNameMap = {};
    empDocs.forEach(u => { empNameMap[String(u._id)] = u.name; });
    const byEmployeeFormatted = byEmployee.map(r => ({
      _id: r._id, name: empNameMap[String(r._id)] || 'Unknown',
      total: r.total, completed: r.completed, pending: r.pending,
    }));

    res.json({
      success: true,
      data: {
        completed:  statusMap['completed']  || 0,
        pending:    statusMap['pending']    || 0,
        inProgress: statusMap['in_progress'] || 0,
        overdue:    overdueCount,
        byEmployee: byEmployeeFormatted,
        byPriority,
      },
    });
  } catch (e) { next(e); }
};

// ─── SOP ANALYTICS ────────────────────────────────────────────────────────────
exports.getSOPAnalytics = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const [byStatus, avgCompletion, byDept] = await Promise.all([
      SOPAssignment.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SOPAssignment.aggregate([
        { $match: { ...tf, status: 'completed', completedAt: { $exists: true } } },
        { $project: { days: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$days' } } },
      ]),
      SOP.aggregate([
        { $match: { ...tf } },
        { $group: { _id: '$sopType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const statusMap = {};
    byStatus.forEach(s => { statusMap[s._id] = s.count; });
    const total = byStatus.reduce((s, b) => s + b.count, 0);
    const completionRate = total > 0 ? Math.round(((statusMap['completed'] || 0) / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        completed:      statusMap['completed']   || 0,
        inProgress:     statusMap['in_progress'] || 0,
        pending:        statusMap['assigned']    || 0,
        completionRate,
        avgCompletionDays: +(avgCompletion[0]?.avg || 0).toFixed(1),
        byDepartment: byDept,
      },
    });
  } catch (e) { next(e); }
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────
exports.getSalesReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, employeeId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);

    const matchWon = { ...tf, status: 'won', ...dateFilter };
    if (employeeId) matchWon.assignedTo = employeeId;

    const [wonLeads, byEmployee, bySource, byMonth] = await Promise.all([
      Lead.find(matchWon).populate('assignedTo', 'name').sort('-updatedAt').limit(100).lean(),
      Lead.aggregate([
        { $match: matchWon },
        { $group: { _id: '$assignedTo', deals: { $sum: 1 }, revenue: { $sum: '$expectedRevenue' } } },
        { $sort: { deals: -1 } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { name: '$user.name', deals: 1, revenue: 1 } },
      ]),
      Lead.aggregate([
        { $match: matchWon },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { month: { $month: '$createdAt' }, status: '$status' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),
    ]);

    logAction(req, { action: 'export_report', resourceType: 'Analytics', details: 'Sales report generated' }).catch(() => {});
    res.json({ success: true, data: { wonLeads, byEmployee, bySource, byMonth, totalWon: wonLeads.length } });
  } catch (e) { next(e); }
};

exports.getInvoiceReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, status, clientId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const match = { ...tf, ...dateFilter };
    if (status)   match.status = status;
    if (clientId) match.client = clientId;

    const [invoices, byStatus, byMonth, summary] = await Promise.all([
      Invoice.find(match).populate('client', 'companyName').sort('-createdAt').limit(200).lean(),
      Invoice.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }]),
      Invoice.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 }, total: { $sum: '$total' }, paid: { $sum: '$paidAmount' } } },
        { $sort: { _id: 1 } },
      ]),
      Invoice.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: null, total: { $sum: '$total' }, paid: { $sum: '$paidAmount' }, outstanding: { $sum: '$outstanding' }, count: { $sum: 1 } } }]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
      total: byMonth.find(m => m._id === i + 1)?.total || 0,
      paid:  byMonth.find(m => m._id === i + 1)?.paid  || 0,
    }));

    logAction(req, { action: 'export_report', resourceType: 'Analytics', details: 'Invoice report generated' }).catch(() => {});
    res.json({ success: true, data: { invoices, byStatus, monthly: monthlyData, summary: summary[0] || {} } });
  } catch (e) { next(e); }
};

exports.getPaymentReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, paymentMethod } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo, null, 'paymentDate');
    const match = { ...tf, ...dateFilter };
    if (paymentMethod) match.paymentMethod = paymentMethod;

    const [payments, byMethod, byMonth, summary] = await Promise.all([
      Payment.find(match).populate('client', 'companyName').populate('invoice', 'invoiceNumber').sort('-paymentDate').limit(200).lean(),
      Payment.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
      Payment.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$paymentDate' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      total: byMonth.find(m => m._id === i + 1)?.total || 0,
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
    }));

    logAction(req, { action: 'export_report', resourceType: 'Analytics', details: 'Payment report generated' }).catch(() => {});
    res.json({ success: true, data: { payments, byMethod, monthly: monthlyData, summary: summary[0] || {} } });
  } catch (e) { next(e); }
};

exports.getCustomerReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, status } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const match = { ...tf, ...dateFilter };
    if (status) match.status = status;

    const [clients, byStatus, byMonth, byPackage] = await Promise.all([
      Client.find(match).sort('-createdAt').limit(200).lean(),
      Client.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Client.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Client.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$packageName', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
    }));

    res.json({ success: true, data: { clients, byStatus, monthly: monthlyData, byPackage, total: clients.length } });
  } catch (e) { next(e); }
};

exports.getLeadReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, status, source, employeeId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const match = { ...tf, ...dateFilter };
    if (status)     match.status     = status;
    if (source)     match.source     = source;
    if (employeeId) match.assignedTo = employeeId;

    const [leads, byStatus, bySource, byMonth, byEmployee] = await Promise.all([
      Lead.find(match).populate('assignedTo', 'name').sort('-createdAt').limit(200).lean(),
      Lead.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Lead.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 }, won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { name: '$user.name', count: 1, won: 1 } },
      ]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
    }));

    res.json({ success: true, data: { leads, byStatus, bySource, monthly: monthlyData, byEmployee, total: leads.length } });
  } catch (e) { next(e); }
};

exports.getTaskReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, status, employeeId } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const match = { ...tf, ...dateFilter };
    if (status)     match.status     = status;
    if (employeeId) match.assignedTo = employeeId;

    const [tasks, byStatus, byPriority, byEmployee] = await Promise.all([
      Task.find(match).populate('assignedTo', 'name').sort('-createdAt').limit(200).lean(),
      Task.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Task.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: '$assignedTo',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        }},
        { $sort: { completed: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { name: '$user.name', total: 1, completed: 1 } },
      ]),
    ]);

    res.json({ success: true, data: { tasks, byStatus, byPriority, byEmployee, total: tasks.length } });
  } catch (e) { next(e); }
};

exports.getSOPReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const [assignments, byStatus, byType, avgTime] = await Promise.all([
      SOPAssignment.find({ ...tf }).populate('sop', 'title sopType').populate('assignedTo', 'name').sort('-updatedAt').limit(200).lean(),
      SOPAssignment.aggregate([{ $match: { ...tf } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      SOP.aggregate([{ $match: { ...tf } }, { $group: { _id: '$sopType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      SOPAssignment.aggregate([
        { $match: { ...tf, status: 'completed', completedAt: { $exists: true } } },
        { $project: { days: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$days' } } },
      ]),
    ]);

    res.json({ success: true, data: { assignments, byStatus, byType, avgCompletionDays: +(avgTime[0]?.avg || 0).toFixed(1) } });
  } catch (e) { next(e); }
};

exports.getEmployeeReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const monthStart = startOfMonth(new Date());

    const employees = await User.find({ ...tf, role: { $ne: 'platform_super_admin' }, isActive: true }).select('name role email').lean();

    const data = await Promise.all(employees.map(async u => {
      const [leads, wonLeads, tasks, completedTasks, attendance, sopDone] = await Promise.all([
        Lead.countDocuments({ ...tf, assignedTo: u._id, ...dateFilter }),
        Lead.countDocuments({ ...tf, assignedTo: u._id, status: 'won', ...dateFilter }),
        Task.countDocuments({ ...tf, assignedTo: u._id, ...dateFilter }),
        Task.countDocuments({ ...tf, assignedTo: u._id, status: 'completed', ...dateFilter }),
        Attendance.countDocuments({ ...tf, employee: u._id, status: 'present', date: { $gte: monthStart } }),
        SOPAssignment.countDocuments({ ...tf, assignedTo: u._id, status: 'completed' }),
      ]);
      const convRate = leads > 0 ? +((wonLeads / leads) * 100).toFixed(1) : 0;
      const taskCompletion = tasks > 0 ? +((completedTasks / tasks) * 100).toFixed(1) : 0;
      return { name: u.name, role: u.role, leads, wonLeads, convRate, tasks, completedTasks, taskCompletion, attendance, sopDone };
    }));

    res.json({ success: true, data });
  } catch (e) { next(e); }
};

exports.getQuotationReport = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { dateFrom, dateTo, status } = req.query;
    const dateFilter = buildDateFilter(dateFrom, dateTo);
    const match = { ...tf, ...dateFilter };
    if (status) match.status = status;

    const [quotations, byStatus, byMonth, summary] = await Promise.all([
      Quotation.find(match).populate('client', 'companyName').sort('-createdAt').limit(200).lean(),
      Quotation.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }]),
      Quotation.aggregate([
        { $match: { ...tf, ...dateFilter } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 }, total: { $sum: '$total' } } },
        { $sort: { _id: 1 } },
      ]),
      Quotation.aggregate([{ $match: { ...tf, ...dateFilter } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_LABELS[i],
      count: byMonth.find(m => m._id === i + 1)?.count || 0,
      total: byMonth.find(m => m._id === i + 1)?.total || 0,
    }));

    res.json({ success: true, data: { quotations, byStatus, monthly: monthlyData, summary: summary[0] || {}, total: quotations.length } });
  } catch (e) { next(e); }
};

// ─── Date filter builder ──────────────────────────────────────────────────────
function buildDateFilter(dateFrom, dateTo, year, field = 'createdAt') {
  if (dateFrom || dateTo) {
    const f = {};
    if (dateFrom) f.$gte = new Date(dateFrom);
    if (dateTo)   f.$lte = endOfDay(new Date(dateTo));
    return { [field]: f };
  }
  if (year) {
    return { [field]: { $gte: new Date(Number(year), 0, 1), $lt: new Date(Number(year) + 1, 0, 1) } };
  }
  return {};
}
