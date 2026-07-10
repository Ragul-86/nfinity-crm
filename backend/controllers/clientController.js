const Client = require('../models/Client');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

exports.getClients = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const features = new APIFeatures(
      Client.find(tf).populate('assignedManager', 'name email avatar'),
      req.query
    ).search(['companyName', 'contactPerson', 'email', 'industry']).filter().sort().paginate();

    const [clients, total] = await Promise.all([features.query, Client.countDocuments(tf)]);
    res.status(200).json({ success: true, count: clients.length, total, page: features.page, limit: features.limit, data: clients });
  } catch (error) { next(error); }
};

exports.getClient = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, ...getTenantFilter(req) })
      .populate('assignedManager createdBy', 'name email avatar');
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.status(200).json({ success: true, data: client });
  } catch (error) { next(error); }
};

exports.createClient = async (req, res, next) => {
  try {
    const client = await Client.create({ ...req.body, createdBy: req.user.id, tenantId: injectTenantId(req) });
    res.status(201).json({ success: true, data: client });
  } catch (error) { next(error); }
};

exports.updateClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, ...getTenantFilter(req) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.status(200).json({ success: true, data: client });
  } catch (error) { next(error); }
};

exports.deleteClient = async (req, res, next) => {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    res.status(200).json({ success: true, message: 'Client deleted' });
  } catch (error) { next(error); }
};

exports.addCommunicationLog = async (req, res, next) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, ...getTenantFilter(req) });
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    client.communicationLogs.push({ ...req.body, createdBy: req.user.id });
    await client.save();
    res.status(201).json({ success: true, data: client });
  } catch (error) { next(error); }
};
