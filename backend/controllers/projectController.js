const Project = require('../models/Project');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

exports.getProjects = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const features = new APIFeatures(
      Project.find(tf).populate('client', 'companyName').populate('assignedManager', 'name avatar'),
      req.query
    ).search(['name']).filter().sort().paginate();
    const [projects, total] = await Promise.all([features.query, Project.countDocuments(tf)]);
    res.status(200).json({ success: true, count: projects.length, total, page: features.page, data: projects });
  } catch (error) { next(error); }
};

exports.getProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, ...getTenantFilter(req) })
      .populate('client assignedManager teamMembers', 'name email avatar companyName');
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: project });
  } catch (error) { next(error); }
};

exports.createProject = async (req, res, next) => {
  try {
    const project = await Project.create({ ...req.body, createdBy: req.user.id, tenantId: injectTenantId(req) });
    res.status(201).json({ success: true, data: project });
  } catch (error) { next(error); }
};

exports.updateProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, ...getTenantFilter(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: project });
  } catch (error) { next(error); }
};

exports.deleteProject = async (req, res, next) => {
  try {
    await Project.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) });
    res.status(200).json({ success: true, message: 'Project deleted' });
  } catch (error) { next(error); }
};

exports.updateMilestone = async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, ...getTenantFilter(req) });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const milestone = project.milestones.id(req.params.milestoneId);
    if (!milestone) return res.status(404).json({ success: false, message: 'Milestone not found' });
    Object.assign(milestone, req.body);
    if (req.body.isCompleted) milestone.completedAt = new Date();
    await project.save();
    res.status(200).json({ success: true, data: project });
  } catch (error) { next(error); }
};
