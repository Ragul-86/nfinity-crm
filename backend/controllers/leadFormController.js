const LeadForm = require('../models/LeadForm');
const LeadFormSubmission = require('../models/LeadFormSubmission');
const Lead = require('../models/Lead');
const LeadActivity = require('../models/LeadActivity');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ── GET /api/lead-forms ───────────────────────────────────────────────────────
exports.getForms = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { tenantId: tf.tenantId };
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $ne: 'archived' };  // hide archived by default

    const forms = await LeadForm.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: forms.length, data: forms });
  } catch (e) { next(e); }
};

// ── GET /api/lead-forms/:id ───────────────────────────────────────────────────
exports.getForm = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const form = await LeadForm.findOne({ _id: req.params.id, tenantId: tf.tenantId })
      .populate('createdBy', 'name email')
      .populate('settings.assignTo', 'name email');
    if (!form) return next(err('Form not found', 404));
    res.json({ success: true, data: form });
  } catch (e) { next(e); }
};

// ── POST /api/lead-forms ───────────────────────────────────────────────────────
exports.createForm = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    const form = await LeadForm.create({
      ...req.body,
      tenantId,
      createdBy: req.user.id,
    });

    await logAction({
      action: 'CREATE', module: 'lead_forms',
      resourceId: form._id, resourceType: 'LeadForm',
      details: { message: `Created lead form: ${form.name}` },
      performedBy: req.user.id, tenantId,
    });

    res.status(201).json({ success: true, data: form });
  } catch (e) { next(e); }
};

// ── PUT /api/lead-forms/:id ───────────────────────────────────────────────────
exports.updateForm = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const form = await LeadForm.findOneAndUpdate(
      { _id: req.params.id, tenantId: tf.tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!form) return next(err('Form not found', 404));
    res.json({ success: true, data: form });
  } catch (e) { next(e); }
};

// ── DELETE /api/lead-forms/:id ─────────────────────────────────────────────────
exports.deleteForm = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const form = await LeadForm.findOneAndDelete({ _id: req.params.id, tenantId: tf.tenantId });
    if (!form) return next(err('Form not found', 404));

    await logAction({
      action: 'DELETE', module: 'lead_forms',
      resourceId: form._id, resourceType: 'LeadForm',
      details: { message: `Deleted lead form: ${form.name}` },
      performedBy: req.user.id, tenantId: tf.tenantId,
    });

    res.json({ success: true, message: 'Form deleted' });
  } catch (e) { next(e); }
};

// ── POST /api/lead-forms/:id/duplicate ────────────────────────────────────────
exports.duplicateForm = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const original = await LeadForm.findOne({ _id: req.params.id, tenantId: tf.tenantId });
    if (!original) return next(err('Form not found', 404));

    const copy = original.toObject();
    delete copy._id;
    delete copy.publicToken;           // gets a fresh token from default
    delete copy.submissionsCount;
    delete copy.conversionsCount;
    delete copy.lastSubmissionAt;
    copy.name = `${original.name} (Copy)`;
    copy.status = 'inactive';
    copy.createdBy = req.user.id;

    const newForm = await LeadForm.create(copy);
    res.status(201).json({ success: true, data: newForm });
  } catch (e) { next(e); }
};

// ── PATCH /api/lead-forms/:id/archive ─────────────────────────────────────────
exports.archiveForm = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const form = await LeadForm.findOneAndUpdate(
      { _id: req.params.id, tenantId: tf.tenantId },
      { $set: { status: 'archived' } },
      { new: true }
    );
    if (!form) return next(err('Form not found', 404));
    res.json({ success: true, data: form });
  } catch (e) { next(e); }
};

// ── GET /api/lead-forms/:id/submissions ───────────────────────────────────────
exports.getSubmissions = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const form = await LeadForm.findOne({ _id: req.params.id, tenantId: tf.tenantId });
    if (!form) return next(err('Form not found', 404));

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      LeadFormSubmission.find({ form: form._id })
        .populate('lead', 'name phone email status leadId')
        .sort({ submittedAt: -1 })
        .skip(skip).limit(limit),
      LeadFormSubmission.countDocuments({ form: form._id }),
    ]);

    res.json({ success: true, count: submissions.length, total, page, limit, data: submissions });
  } catch (e) { next(e); }
};

// ── PUBLIC: GET /api/lead-forms/public/:token ─────────────────────────────────
// Returns form schema for public rendering (no auth required)
exports.getPublicForm = async (req, res, next) => {
  try {
    const form = await LeadForm.findOne({ publicToken: req.params.token, status: 'active' })
      .select('name description fields settings.thankYouMessage settings.redirectUrl');
    if (!form) return next(err('Form not found or inactive', 404));
    res.json({ success: true, data: form });
  } catch (e) { next(e); }
};

// ── PUBLIC: POST /api/lead-forms/public/:token/submit ─────────────────────────
// Receives form submission, creates lead, logs activity
exports.submitPublicForm = async (req, res, next) => {
  try {
    const form = await LeadForm.findOne({ publicToken: req.params.token, status: 'active' });
    if (!form) return next(err('Form not found or inactive', 404));

    const data = req.body;   // { fieldId: value }
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || '';

    // Duplicate prevention
    let isDuplicate = false;
    if (form.settings.preventDuplicates && form.settings.duplicateField !== 'none') {
      const checkField = form.settings.duplicateField; // 'email' or 'phone'
      // Find the field's value in submitted data by label mapping
      const matchField = form.fields.find(f => f.leadField === checkField);
      if (matchField) {
        const val = data[matchField.id];
        if (val) {
          const dupCheck = await Lead.findOne({ tenantId: form.tenantId, [checkField]: val });
          if (dupCheck) isDuplicate = true;
        }
      }
    }

    // Build lead data from field mappings
    const leadData = {
      tenantId: form.tenantId,
      source: form.settings.source || 'lead_form',
      status: form.settings.defaultStatus || 'new_lead',
      priority: form.settings.defaultPriority || 'medium',
      formId: form._id,
    };

    // Map form fields to lead fields
    for (const field of form.fields) {
      if (field.leadField && field.leadField !== 'none' && data[field.id] !== undefined) {
        leadData[field.leadField] = data[field.id];
      }
    }

    let lead = null;
    if (!isDuplicate) {
      // Auto-assignment
      if (form.settings.assignmentMode === 'specific' && form.settings.assignTo?.length) {
        leadData.assignedTo = form.settings.assignTo;
      } else if (form.settings.assignmentMode === 'round_robin' && form.settings.assignTo?.length) {
        const idx = form.settings.roundRobinIndex % form.settings.assignTo.length;
        leadData.assignedTo = [form.settings.assignTo[idx]];
        // Advance cursor
        await LeadForm.findByIdAndUpdate(form._id, {
          $inc: { 'settings.roundRobinIndex': 1 },
        });
      }

      lead = await Lead.create(leadData);

      try {
        await LeadActivity.create({
          lead: lead._id,
          tenantId: form.tenantId,
          type: 'form_submitted',
          description: `Lead submitted via form: ${form.name}`,
          metadata: { formId: form._id, formName: form.name },
        });
      } catch (_) {}
    }

    // Save submission record
    const submission = await LeadFormSubmission.create({
      form: form._id,
      tenantId: form.tenantId,
      data,
      lead: lead?._id,
      convertedToLead: !isDuplicate,
      isDuplicate,
      ipAddress: ip,
      userAgent: req.headers['user-agent'] || '',
      utmSource: req.query.utm_source || '',
      utmMedium: req.query.utm_medium || '',
      utmCampaign: req.query.utm_campaign || '',
    });

    // Update form stats
    const statsUpdate = { $inc: { submissionsCount: 1 }, lastSubmissionAt: new Date() };
    if (!isDuplicate) statsUpdate.$inc.conversionsCount = 1;
    await LeadForm.findByIdAndUpdate(form._id, statsUpdate);

    res.status(201).json({
      success: true,
      isDuplicate,
      message: form.settings.thankYouMessage || 'Thank you! We will contact you shortly.',
      redirectUrl: form.settings.redirectUrl || null,
    });
  } catch (e) { next(e); }
};
