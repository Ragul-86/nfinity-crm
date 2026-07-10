const Client = require('../models/Client');
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const Project = require('../models/Project');
const Task = require('../models/Task');
const SOP = require('../models/SOP');
const SOPAssignment = require('../models/SOPAssignment');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { getTenantFilter } = require('../middleware/auth');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const tf = getTenantFilter(req);

    const [
      totalClients, totalLeads, totalCampaigns, activeCampaigns,
      activeProjects, totalSOPs, pendingSOPs, pendingTasks,
      totalUsers, wonLeads, monthlyLeads,
    ] = await Promise.all([
      Client.countDocuments({ status: 'active', ...tf }),
      Lead.countDocuments({ ...tf }),
      Campaign.countDocuments({ isArchived: false, ...tf }),
      Campaign.countDocuments({ status: 'active', isArchived: false, ...tf }),
      Project.countDocuments({ status: 'in_progress', ...tf }),
      SOP.countDocuments({ status: 'published', ...tf }),
      SOP.countDocuments({ 'approvalWorkflow.status': 'pending', ...tf }),
      Task.countDocuments({ status: { $ne: 'completed' }, ...tf }),
      User.countDocuments({ isActive: true, role: { $ne: 'platform_super_admin' }, ...tf }),
      Lead.countDocuments({ status: 'won', ...tf }),
      Lead.countDocuments({ createdAt: { $gte: firstOfMonth }, ...tf }),
    ]);

    const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : 0;

    // Revenue from completed campaigns
    const revenueData = await Campaign.aggregate([
      { $match: { status: { $in: ['active', 'completed'] }, ...tf } },
      { $group: { _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }, revenue: { $sum: '$budget' }, spend: { $sum: '$spend' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]);

    // Lead funnel
    const leadFunnel = await Lead.aggregate([
      { $match: { ...tf } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Campaign performance by type
    const campaignsByType = await Campaign.aggregate([
      { $match: { isArchived: false, ...tf } },
      { $group: { _id: '$type', count: { $sum: 1 }, totalBudget: { $sum: '$budget' }, totalSpend: { $sum: '$spend' } } }
    ]);

    // Recent activities (tasks + leads + clients combined)
    const [recentLeads, recentClients, recentTasks] = await Promise.all([
      Lead.find(tf).sort('-createdAt').limit(5).populate('createdBy', 'name avatar'),
      Client.find(tf).sort('-createdAt').limit(5).populate('createdBy', 'name avatar'),
      Task.find(tf).sort('-createdAt').limit(5).populate('createdBy assignedTo', 'name avatar'),
    ]);

    // Upcoming tasks
    const upcomingTasks = await Task.find({ status: { $ne: 'completed' }, dueDate: { $gte: now }, ...tf })
      .sort('dueDate').limit(10).populate('assignedTo', 'name avatar');

    // Attendance rate this month
    const totalAttendance = await Attendance.countDocuments({ date: { $gte: firstOfMonth }, status: 'present', ...tf });
    const workingDays = Math.ceil((now - firstOfMonth) / (1000 * 60 * 60 * 24));
    const attendanceRate = workingDays > 0 && totalUsers > 0
      ? ((totalAttendance / (workingDays * totalUsers)) * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalClients, totalLeads, totalCampaigns, activeCampaigns,
          activeProjects, totalSOPs, pendingSOPs, pendingTasks,
          conversionRate: parseFloat(conversionRate),
          attendanceRate: parseFloat(attendanceRate),
          monthlyLeads,
        },
        revenueData,
        leadFunnel,
        campaignsByType,
        recentActivities: { leads: recentLeads, clients: recentClients, tasks: recentTasks },
        upcomingTasks,
      },
    });
  } catch (error) { next(error); }
};

// ─── Employee Dashboard — widgets scoped to the logged-in employee ────────
exports.getEmployeeDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tf = getTenantFilter(req);

    const [
      myCampaignsCount, assignedLeadsCount, myTasksCount, overdueTasksCount,
      sopAssignmentsCount, sopAwaitingReview, upcomingDeadlines,
      unreadNotifications, presentDaysThisMonth, leaveDaysThisMonth,
    ] = await Promise.all([
      Campaign.countDocuments({ 'assignedTeam.user': userId, isArchived: false, ...tf }),
      Lead.countDocuments({ assignedTo: userId, ...tf }),
      Task.countDocuments({ assignedTo: userId, status: { $ne: 'completed' }, ...tf }),
      Task.countDocuments({ assignedTo: userId, status: { $ne: 'completed' }, dueDate: { $lt: now }, ...tf }),
      SOPAssignment.countDocuments({ assignedTo: userId, status: { $nin: ['completed', 'archived'] }, ...tf }),
      SOPAssignment.countDocuments({ assignedTo: userId, status: 'awaiting_review', ...tf }),
      Task.find({ assignedTo: userId, status: { $ne: 'completed' }, dueDate: { $gte: now, $lte: in7Days }, ...tf })
        .sort('dueDate').limit(5).populate('campaign', 'name').populate('project', 'name'),
      Notification.countDocuments({ recipient: userId, isRead: false }),
      Attendance.countDocuments({ employee: userId, status: 'present', date: { $gte: firstOfMonth } }),
      Attendance.countDocuments({ employee: userId, status: 'leave', date: { $gte: firstOfMonth } }),
    ]);

    const workingDaysSoFar = Math.max(1, Math.ceil((now - firstOfMonth) / (1000 * 60 * 60 * 24)));
    const attendanceRate = parseFloat(((presentDaysThisMonth / workingDaysSoFar) * 100).toFixed(1));

    const recentNotifications = await Notification.find({ recipient: userId }).sort('-createdAt').limit(5);

    res.status(200).json({
      success: true,
      data: {
        widgets: {
          myCampaigns: myCampaignsCount, assignedLeads: assignedLeadsCount,
          myTasks: myTasksCount, overdueTasks: overdueTasksCount,
          sopAssignments: sopAssignmentsCount, sopAwaitingReview,
          unreadNotifications,
        },
        attendanceSummary: { presentDaysThisMonth, leaveDaysThisMonth, attendanceRate },
        upcomingDeadlines,
        recentNotifications,
      },
    });
  } catch (error) { next(error); }
};

exports.getRevenueReport = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const tf = getTenantFilter(req);
    const monthly = await Campaign.aggregate([
      { $match: { $expr: { $eq: [{ $year: '$createdAt' }, parseInt(year)] }, ...tf } },
      { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$budget' }, spend: { $sum: '$spend' }, roi: { $avg: '$roi' } } },
      { $sort: { '_id': 1 } },
    ]);
    res.status(200).json({ success: true, data: monthly });
  } catch (error) { next(error); }
};
