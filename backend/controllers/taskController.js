const Task = require('../models/Task');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

exports.getTasks = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const features = new APIFeatures(
      Task.find(tf).populate('assignedTo', 'name avatar').populate('project', 'name').populate('client', 'companyName'),
      req.query
    ).search(['title']).filter().sort().paginate();
    // Build a parallel count query with the same search/filter but no pagination
    const countFeatures = new APIFeatures(Task.find(tf), req.query).search(['title']).filter();
    const [tasks, total] = await Promise.all([features.query, Task.countDocuments(countFeatures.query.getFilter())]);
    res.status(200).json({ success: true, count: tasks.length, total, page: features.page, data: tasks });
  } catch (error) { next(error); }
};

exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...getTenantFilter(req) })
      .populate('assignedTo createdBy', 'name email avatar')
      .populate('project', 'name')
      .populate('comments.author', 'name avatar');
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.status(200).json({ success: true, data: task });
  } catch (error) { next(error); }
};

exports.createTask = async (req, res, next) => {
  try {
    const task = await Task.create({ ...req.body, createdBy: req.user.id, tenantId: injectTenantId(req) });
    res.status(201).json({ success: true, data: task });
  } catch (error) { next(error); }
};

exports.updateTask = async (req, res, next) => {
  try {
    if (req.body.status === 'completed') req.body.completedAt = new Date();
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, ...getTenantFilter(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.status(200).json({ success: true, data: task });
  } catch (error) { next(error); }
};

exports.deleteTask = async (req, res, next) => {
  try {
    await Task.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) });
    res.status(200).json({ success: true, message: 'Task deleted' });
  } catch (error) { next(error); }
};

exports.addComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...getTenantFilter(req) });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    task.comments.push({ content: req.body.content, author: req.user.id });
    await task.save();
    res.status(201).json({ success: true, data: task });
  } catch (error) { next(error); }
};

exports.getMyTasks = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const tasks = await Task.find({ assignedTo: req.user.id, status: { $ne: 'completed' }, ...tf })
      .sort('dueDate').populate('project', 'name').limit(20);
    res.status(200).json({ success: true, data: tasks });
  } catch (error) { next(error); }
};
