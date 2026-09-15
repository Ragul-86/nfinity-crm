/**
 * industryTemplates.js
 *
 * Default pipeline templates for each supported industry / business type.
 * Each template defines the pipeline name and its stages.
 *
 * Stage types:
 *   open  — active / in-progress stage (default)
 *   won   — deal closed successfully (Hired, Enrolled, Delivered, etc.)
 *   lost  — deal closed unsuccessfully (Rejected, Lost, Cancelled, etc.)
 *
 * This data is purely configuration — it is NOT stored in MongoDB directly.
 * Use createDefaultPipelinesForTenant() to persist pipelines for a workspace.
 */

const STAGE_COLORS = {
  open:    '#6366f1',   // indigo
  first:   '#6366f1',
  contact: '#3b82f6',  // blue
  qualify: '#8b5cf6',  // violet
  action:  '#f59e0b',  // amber
  review:  '#f97316',  // orange
  won:     '#10b981',  // emerald
  lost:    '#ef4444',  // red
  cancel:  '#ef4444',
};

function s(name, type = 'open', color) {
  return {
    name,
    type: type || 'open',
    color: color || (type === 'won' ? STAGE_COLORS.won : type === 'lost' ? STAGE_COLORS.lost : STAGE_COLORS.open),
    probability: type === 'won' ? 100 : type === 'lost' ? 0 : 0,
  };
}

const INDUSTRY_TEMPLATES = {
  'digital_marketing': {
    label: 'Digital Marketing / Marketing Agency',
    pipelines: [
      {
        name: 'Sales Pipeline',
        key: 'sales',
        isDefault: true,
        stages: [
          s('New Lead',       'open', '#6366f1'),
          s('Contacted',      'open', '#3b82f6'),
          s('Qualified',      'open', '#8b5cf6'),
          s('Discovery Call', 'open', '#06b6d4'),
          s('Proposal Sent',  'open', '#f59e0b'),
          s('Negotiation',    'open', '#f97316'),
          s('Won',            'won',  '#10b981'),
          s('Lost',           'lost', '#ef4444'),
        ],
      },
    ],
  },

  'web_development': {
    label: 'Web Development / IT Services',
    pipelines: [
      {
        name: 'Project Pipeline',
        key: 'project',
        isDefault: true,
        stages: [
          s('New Lead',              'open', '#6366f1'),
          s('Contacted',             'open', '#3b82f6'),
          s('Requirement Gathering', 'open', '#8b5cf6'),
          s('Proposal Sent',         'open', '#f59e0b'),
          s('Negotiation',           'open', '#f97316'),
          s('Development',           'open', '#06b6d4'),
          s('Testing',               'open', '#0ea5e9'),
          s('Delivered',             'won',  '#10b981'),
          s('Lost',                  'lost', '#ef4444'),
        ],
      },
    ],
  },

  'software_saas': {
    label: 'Software / SaaS',
    pipelines: [
      {
        name: 'SaaS Sales Pipeline',
        key: 'saas_sales',
        isDefault: true,
        stages: [
          s('New Lead',         'open', '#6366f1'),
          s('Contacted',        'open', '#3b82f6'),
          s('Qualified',        'open', '#8b5cf6'),
          s('Demo Scheduled',   'open', '#06b6d4'),
          s('Demo Completed',   'open', '#0ea5e9'),
          s('Trial',            'open', '#f59e0b'),
          s('Proposal',         'open', '#f97316'),
          s('Negotiation',      'open', '#fb923c'),
          s('Won',              'won',  '#10b981'),
          s('Lost',             'lost', '#ef4444'),
        ],
      },
    ],
  },

  'recruitment_hr': {
    label: 'Recruitment / HR',
    pipelines: [
      {
        name: 'Recruitment Pipeline',
        key: 'recruitment',
        isDefault: true,
        stages: [
          s('New Applicant',       'open', '#6366f1'),
          s('Screening',           'open', '#3b82f6'),
          s('Interview Scheduled', 'open', '#8b5cf6'),
          s('Interview Completed', 'open', '#06b6d4'),
          s('Shortlisted',         'open', '#f59e0b'),
          s('Offer Sent',          'open', '#f97316'),
          s('Hired',               'won',  '#10b981'),
          s('Rejected',            'lost', '#ef4444'),
        ],
      },
    ],
  },

  'internship_training': {
    label: 'Internship / Training',
    pipelines: [
      {
        name: 'Internship Pipeline',
        key: 'internship',
        isDefault: true,
        stages: [
          s('New Applicant',     'open', '#6366f1'),
          s('Application Review','open', '#3b82f6'),
          s('Screening',         'open', '#8b5cf6'),
          s('Interview',         'open', '#06b6d4'),
          s('Selected',          'open', '#f59e0b'),
          s('Offer Sent',        'open', '#f97316'),
          s('Joined',            'won',  '#10b981'),
          s('Rejected',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  'real_estate': {
    label: 'Real Estate',
    pipelines: [
      {
        name: 'Real Estate Pipeline',
        key: 'real_estate_sales',
        isDefault: true,
        stages: [
          s('New Lead',              'open', '#6366f1'),
          s('Contacted',             'open', '#3b82f6'),
          s('Qualified',             'open', '#8b5cf6'),
          s('Property Shortlisted',  'open', '#06b6d4'),
          s('Site Visit',            'open', '#f59e0b'),
          s('Negotiation',           'open', '#f97316'),
          s('Booking',               'open', '#fb923c'),
          s('Won',                   'won',  '#10b981'),
          s('Lost',                  'lost', '#ef4444'),
        ],
      },
    ],
  },

  'education_college': {
    label: 'Education / College',
    pipelines: [
      {
        name: 'Admissions Pipeline',
        key: 'admissions',
        isDefault: true,
        stages: [
          s('New Enquiry',      'open', '#6366f1'),
          s('Contacted',        'open', '#3b82f6'),
          s('Counselling',      'open', '#8b5cf6'),
          s('Course Selected',  'open', '#06b6d4'),
          s('Fee Discussion',   'open', '#f59e0b'),
          s('Payment Pending',  'open', '#f97316'),
          s('Enrolled',         'won',  '#10b981'),
          s('Lost',             'lost', '#ef4444'),
        ],
      },
    ],
  },

  'hospital_clinic': {
    label: 'Hospital / Clinic',
    pipelines: [
      {
        name: 'Patient Pipeline',
        key: 'patient',
        isDefault: true,
        stages: [
          s('New Enquiry',   'open', '#6366f1'),
          s('Contacted',     'open', '#3b82f6'),
          s('Appointment',   'open', '#8b5cf6'),
          s('Consultation',  'open', '#06b6d4'),
          s('Treatment',     'open', '#f59e0b'),
          s('Follow-up',     'open', '#f97316'),
          s('Completed',     'won',  '#10b981'),
          s('Cancelled',     'lost', '#ef4444'),
        ],
      },
    ],
  },

  'dental_clinic': {
    label: 'Dental Clinic',
    pipelines: [
      {
        name: 'Dental Patient Pipeline',
        key: 'dental_patient',
        isDefault: true,
        stages: [
          s('New Enquiry',     'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Appointment',     'open', '#8b5cf6'),
          s('Consultation',    'open', '#06b6d4'),
          s('Treatment Plan',  'open', '#f59e0b'),
          s('Treatment',       'open', '#f97316'),
          s('Follow-up',       'open', '#fb923c'),
          s('Completed',       'won',  '#10b981'),
          s('Cancelled',       'lost', '#ef4444'),
        ],
      },
    ],
  },

  'insurance': {
    label: 'Insurance',
    pipelines: [
      {
        name: 'Insurance Pipeline',
        key: 'insurance',
        isDefault: true,
        stages: [
          s('New Lead',          'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Requirement',       'open', '#8b5cf6'),
          s('Quote Sent',        'open', '#06b6d4'),
          s('Documents Pending', 'open', '#f59e0b'),
          s('Verification',      'open', '#f97316'),
          s('Policy Issued',     'won',  '#10b981'),
          s('Rejected',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  'loan_finance': {
    label: 'Loan / Finance',
    pipelines: [
      {
        name: 'Loan Pipeline',
        key: 'loan',
        isDefault: true,
        stages: [
          s('New Lead',              'open', '#6366f1'),
          s('Contacted',             'open', '#3b82f6'),
          s('Eligibility Check',     'open', '#8b5cf6'),
          s('Documents Pending',     'open', '#06b6d4'),
          s('Documents Submitted',   'open', '#f59e0b'),
          s('Verification',          'open', '#f97316'),
          s('Approved',              'open', '#fb923c'),
          s('Disbursed',             'won',  '#10b981'),
          s('Rejected',              'lost', '#ef4444'),
        ],
      },
    ],
  },

  'automobile_dealer': {
    label: 'Automobile Dealer',
    pipelines: [
      {
        name: 'Auto Sales Pipeline',
        key: 'auto_sales',
        isDefault: true,
        stages: [
          s('New Enquiry',      'open', '#6366f1'),
          s('Contacted',        'open', '#3b82f6'),
          s('Vehicle Selected', 'open', '#8b5cf6'),
          s('Test Drive',       'open', '#06b6d4'),
          s('Quote Sent',       'open', '#f59e0b'),
          s('Negotiation',      'open', '#f97316'),
          s('Booking',          'open', '#fb923c'),
          s('Delivered',        'won',  '#10b981'),
          s('Lost',             'lost', '#ef4444'),
        ],
      },
    ],
  },

  'travel_tourism': {
    label: 'Travel / Tourism',
    pipelines: [
      {
        name: 'Travel Sales Pipeline',
        key: 'travel_sales',
        isDefault: true,
        stages: [
          s('New Enquiry',   'open', '#6366f1'),
          s('Contacted',     'open', '#3b82f6'),
          s('Requirement',   'open', '#8b5cf6'),
          s('Package Shared','open', '#06b6d4'),
          s('Quote Sent',    'open', '#f59e0b'),
          s('Negotiation',   'open', '#f97316'),
          s('Booking',       'won',  '#10b981'),
          s('Cancelled',     'lost', '#ef4444'),
        ],
      },
    ],
  },

  'hotel': {
    label: 'Hotel',
    pipelines: [
      {
        name: 'Hotel Booking Pipeline',
        key: 'hotel_booking',
        isDefault: true,
        stages: [
          s('New Enquiry',       'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Availability Check','open', '#8b5cf6'),
          s('Quote Sent',        'open', '#06b6d4'),
          s('Booking Pending',   'open', '#f59e0b'),
          s('Confirmed',         'won',  '#10b981'),
          s('Cancelled',         'lost', '#ef4444'),
        ],
      },
    ],
  },

  'construction': {
    label: 'Construction',
    pipelines: [
      {
        name: 'Construction Pipeline',
        key: 'construction',
        isDefault: true,
        stages: [
          s('New Lead',        'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Requirement',     'open', '#8b5cf6'),
          s('Site Visit',      'open', '#06b6d4'),
          s('Estimate',        'open', '#f59e0b'),
          s('Proposal Sent',   'open', '#f97316'),
          s('Negotiation',     'open', '#fb923c'),
          s('Contract Signed', 'open', '#a3e635'),
          s('Project Started', 'open', '#22c55e'),
          s('Completed',       'won',  '#10b981'),
          s('Lost',            'lost', '#ef4444'),
        ],
      },
    ],
  },

  'architecture_interior': {
    label: 'Architecture / Interior Design',
    pipelines: [
      {
        name: 'Design Project Pipeline',
        key: 'design_project',
        isDefault: true,
        stages: [
          s('New Lead',        'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Requirement',     'open', '#8b5cf6'),
          s('Site Visit',      'open', '#06b6d4'),
          s('Design',          'open', '#f59e0b'),
          s('Proposal Sent',   'open', '#f97316'),
          s('Negotiation',     'open', '#fb923c'),
          s('Project Started', 'open', '#22c55e'),
          s('Completed',       'won',  '#10b981'),
          s('Lost',            'lost', '#ef4444'),
        ],
      },
    ],
  },

  'legal_services': {
    label: 'Legal Services',
    pipelines: [
      {
        name: 'Legal Pipeline',
        key: 'legal',
        isDefault: true,
        stages: [
          s('New Enquiry',     'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Case Evaluation', 'open', '#8b5cf6'),
          s('Consultation',    'open', '#06b6d4'),
          s('Engagement',      'open', '#f59e0b'),
          s('Case Active',     'open', '#f97316'),
          s('Completed',       'won',  '#10b981'),
          s('Closed',          'lost', '#6b7280'),
        ],
      },
    ],
  },

  'accounting_ca': {
    label: 'Accounting / CA',
    pipelines: [
      {
        name: 'Accounting Pipeline',
        key: 'accounting',
        isDefault: true,
        stages: [
          s('New Lead',          'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Requirement',       'open', '#8b5cf6'),
          s('Consultation',      'open', '#06b6d4'),
          s('Proposal Sent',     'open', '#f59e0b'),
          s('Documents Pending', 'open', '#f97316'),
          s('Work Started',      'open', '#fb923c'),
          s('Completed',         'won',  '#10b981'),
          s('Lost',              'lost', '#ef4444'),
        ],
      },
    ],
  },

  'ecommerce_product': {
    label: 'E-Commerce / Product Sales',
    pipelines: [
      {
        name: 'Sales Pipeline',
        key: 'ecommerce_sales',
        isDefault: true,
        stages: [
          s('New Lead',          'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Product Selected',  'open', '#8b5cf6'),
          s('Order Pending',     'open', '#06b6d4'),
          s('Payment Pending',   'open', '#f59e0b'),
          s('Order Confirmed',   'open', '#f97316'),
          s('Delivered',         'won',  '#10b981'),
          s('Cancelled',         'lost', '#ef4444'),
        ],
      },
    ],
  },

  'b2b_manufacturing': {
    label: 'B2B Manufacturing',
    pipelines: [
      {
        name: 'B2B Sales Pipeline',
        key: 'b2b_sales',
        isDefault: true,
        stages: [
          s('New Enquiry',   'open', '#6366f1'),
          s('Contacted',     'open', '#3b82f6'),
          s('Requirement',   'open', '#8b5cf6'),
          s('Sample',        'open', '#06b6d4'),
          s('Quotation',     'open', '#f59e0b'),
          s('Negotiation',   'open', '#f97316'),
          s('Purchase Order','open', '#fb923c'),
          s('Production',    'open', '#22c55e'),
          s('Delivered',     'won',  '#10b981'),
          s('Lost',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  'wholesale_distribution': {
    label: 'Wholesale / Distribution',
    pipelines: [
      {
        name: 'Wholesale Pipeline',
        key: 'wholesale',
        isDefault: true,
        stages: [
          s('New Lead',     'open', '#6366f1'),
          s('Contacted',    'open', '#3b82f6'),
          s('Requirement',  'open', '#8b5cf6'),
          s('Quotation',    'open', '#06b6d4'),
          s('Negotiation',  'open', '#f59e0b'),
          s('Order',        'open', '#f97316'),
          s('Fulfilment',   'open', '#fb923c'),
          s('Completed',    'won',  '#10b981'),
          s('Cancelled',    'lost', '#ef4444'),
        ],
      },
    ],
  },

  'logistics_transport': {
    label: 'Logistics / Transport',
    pipelines: [
      {
        name: 'Logistics Pipeline',
        key: 'logistics',
        isDefault: true,
        stages: [
          s('New Enquiry', 'open', '#6366f1'),
          s('Contacted',   'open', '#3b82f6'),
          s('Requirement', 'open', '#8b5cf6'),
          s('Quote Sent',  'open', '#06b6d4'),
          s('Booking',     'open', '#f59e0b'),
          s('Pickup',      'open', '#f97316'),
          s('In Transit',  'open', '#fb923c'),
          s('Delivered',   'won',  '#10b981'),
          s('Cancelled',   'lost', '#ef4444'),
        ],
      },
    ],
  },

  'event_management': {
    label: 'Event Management',
    pipelines: [
      {
        name: 'Event Pipeline',
        key: 'event',
        isDefault: true,
        stages: [
          s('New Enquiry',    'open', '#6366f1'),
          s('Contacted',      'open', '#3b82f6'),
          s('Requirement',    'open', '#8b5cf6'),
          s('Proposal Sent',  'open', '#06b6d4'),
          s('Negotiation',    'open', '#f59e0b'),
          s('Booking',        'open', '#f97316'),
          s('Planning',       'open', '#fb923c'),
          s('Event Completed','won',  '#10b981'),
          s('Cancelled',      'lost', '#ef4444'),
        ],
      },
    ],
  },

  'photography_videography': {
    label: 'Photography / Videography',
    pipelines: [
      {
        name: 'Booking Pipeline',
        key: 'photo_booking',
        isDefault: true,
        stages: [
          s('New Enquiry',    'open', '#6366f1'),
          s('Contacted',      'open', '#3b82f6'),
          s('Requirement',    'open', '#8b5cf6'),
          s('Package Selected','open', '#06b6d4'),
          s('Quote Sent',     'open', '#f59e0b'),
          s('Booking',        'open', '#f97316'),
          s('Shoot',          'open', '#fb923c'),
          s('Delivery',       'open', '#22c55e'),
          s('Completed',      'won',  '#10b981'),
          s('Cancelled',      'lost', '#ef4444'),
        ],
      },
    ],
  },

  'beauty_salon_spa': {
    label: 'Beauty Salon / Spa',
    pipelines: [
      {
        name: 'Salon Pipeline',
        key: 'salon',
        isDefault: true,
        stages: [
          s('New Enquiry',      'open', '#6366f1'),
          s('Contacted',        'open', '#3b82f6'),
          s('Service Selected', 'open', '#8b5cf6'),
          s('Appointment',      'open', '#06b6d4'),
          s('Service Completed','open', '#f59e0b'),
          s('Follow-up',        'open', '#f97316'),
          s('Completed',        'won',  '#10b981'),
          s('Cancelled',        'lost', '#ef4444'),
        ],
      },
    ],
  },

  'gym_fitness': {
    label: 'Gym / Fitness',
    pipelines: [
      {
        name: 'Membership Pipeline',
        key: 'gym_membership',
        isDefault: true,
        stages: [
          s('New Enquiry', 'open', '#6366f1'),
          s('Contacted',   'open', '#3b82f6'),
          s('Trial',       'open', '#8b5cf6'),
          s('Follow-up',   'open', '#06b6d4'),
          s('Membership',  'won',  '#10b981'),
          s('Cancelled',   'lost', '#ef4444'),
        ],
      },
    ],
  },

  'coaching_consulting': {
    label: 'Coaching / Consulting',
    pipelines: [
      {
        name: 'Consulting Pipeline',
        key: 'consulting',
        isDefault: true,
        stages: [
          s('New Lead',      'open', '#6366f1'),
          s('Contacted',     'open', '#3b82f6'),
          s('Discovery',     'open', '#8b5cf6'),
          s('Assessment',    'open', '#06b6d4'),
          s('Proposal Sent', 'open', '#f59e0b'),
          s('Negotiation',   'open', '#f97316'),
          s('Won',           'won',  '#10b981'),
          s('Lost',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  'repair_service_centre': {
    label: 'Repair / Service Centre',
    pipelines: [
      {
        name: 'Repair Pipeline',
        key: 'repair',
        isDefault: true,
        stages: [
          s('New Request',      'open', '#6366f1'),
          s('Contacted',        'open', '#3b82f6'),
          s('Diagnosis',        'open', '#8b5cf6'),
          s('Estimate',         'open', '#06b6d4'),
          s('Approval',         'open', '#f59e0b'),
          s('Repair',           'open', '#f97316'),
          s('Ready for Pickup', 'open', '#fb923c'),
          s('Completed',        'won',  '#10b981'),
          s('Cancelled',        'lost', '#ef4444'),
        ],
      },
    ],
  },

  'cleaning_services': {
    label: 'Cleaning Services',
    pipelines: [
      {
        name: 'Cleaning Pipeline',
        key: 'cleaning',
        isDefault: true,
        stages: [
          s('New Enquiry', 'open', '#6366f1'),
          s('Contacted',   'open', '#3b82f6'),
          s('Requirement', 'open', '#8b5cf6'),
          s('Quote Sent',  'open', '#06b6d4'),
          s('Booking',     'open', '#f59e0b'),
          s('Service',     'open', '#f97316'),
          s('Completed',   'won',  '#10b981'),
          s('Cancelled',   'lost', '#ef4444'),
        ],
      },
    ],
  },

  'home_services': {
    label: 'Home Services',
    pipelines: [
      {
        name: 'Home Services Pipeline',
        key: 'home_services',
        isDefault: true,
        stages: [
          s('New Request', 'open', '#6366f1'),
          s('Contacted',   'open', '#3b82f6'),
          s('Requirement', 'open', '#8b5cf6'),
          s('Quote Sent',  'open', '#06b6d4'),
          s('Scheduled',   'open', '#f59e0b'),
          s('Service',     'open', '#f97316'),
          s('Completed',   'won',  '#10b981'),
          s('Cancelled',   'lost', '#ef4444'),
        ],
      },
    ],
  },

  'jewellery': {
    label: 'Jewellery',
    pipelines: [
      {
        name: 'Jewellery Sales Pipeline',
        key: 'jewellery_sales',
        isDefault: true,
        stages: [
          s('New Enquiry',     'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Product Selected','open', '#8b5cf6'),
          s('Quote Sent',      'open', '#06b6d4'),
          s('Negotiation',     'open', '#f59e0b'),
          s('Booking',         'open', '#f97316'),
          s('Purchase',        'won',  '#10b981'),
          s('Cancelled',       'lost', '#ef4444'),
        ],
      },
    ],
  },

  'fashion_boutique': {
    label: 'Fashion / Boutique',
    pipelines: [
      {
        name: 'Fashion Sales Pipeline',
        key: 'fashion_sales',
        isDefault: true,
        stages: [
          s('New Enquiry',     'open', '#6366f1'),
          s('Contacted',       'open', '#3b82f6'),
          s('Product Selected','open', '#8b5cf6'),
          s('Order',           'open', '#06b6d4'),
          s('Payment Pending', 'open', '#f59e0b'),
          s('Confirmed',       'open', '#f97316'),
          s('Delivered',       'won',  '#10b981'),
          s('Cancelled',       'lost', '#ef4444'),
        ],
      },
    ],
  },

  'edtech': {
    label: 'Education / EdTech',
    pipelines: [
      {
        name: 'EdTech Sales Pipeline',
        key: 'edtech_sales',
        isDefault: true,
        stages: [
          s('New Lead',   'open', '#6366f1'),
          s('Contacted',  'open', '#3b82f6'),
          s('Demo',       'open', '#8b5cf6'),
          s('Counselling','open', '#06b6d4'),
          s('Trial',      'open', '#f59e0b'),
          s('Payment',    'open', '#f97316'),
          s('Enrolled',   'won',  '#10b981'),
          s('Lost',       'lost', '#ef4444'),
        ],
      },
    ],
  },

  'ngo_donation': {
    label: 'NGO / Donation',
    pipelines: [
      {
        name: 'Donation Pipeline',
        key: 'donation',
        isDefault: true,
        stages: [
          s('New Lead',          'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Interested',        'open', '#8b5cf6'),
          s('Donation Pledge',   'open', '#06b6d4'),
          s('Payment Pending',   'open', '#f59e0b'),
          s('Donation Received', 'won',  '#10b981'),
          s('Not Interested',    'lost', '#ef4444'),
        ],
      },
    ],
  },

  'franchise': {
    label: 'Franchise',
    pipelines: [
      {
        name: 'Franchise Pipeline',
        key: 'franchise',
        isDefault: true,
        stages: [
          s('New Enquiry',       'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Qualification',     'open', '#8b5cf6'),
          s('Presentation',      'open', '#06b6d4'),
          s('Business Evaluation','open','#f59e0b'),
          s('Proposal Sent',     'open', '#f97316'),
          s('Negotiation',       'open', '#fb923c'),
          s('Agreement',         'open', '#22c55e'),
          s('Won',               'won',  '#10b981'),
          s('Lost',              'lost', '#ef4444'),
        ],
      },
    ],
  },

  'export_import': {
    label: 'Export / Import',
    pipelines: [
      {
        name: 'Trade Pipeline',
        key: 'trade',
        isDefault: true,
        stages: [
          s('New Enquiry',  'open', '#6366f1'),
          s('Requirement',  'open', '#3b82f6'),
          s('Quote Sent',   'open', '#8b5cf6'),
          s('Negotiation',  'open', '#06b6d4'),
          s('Order',        'open', '#f59e0b'),
          s('Documentation','open', '#f97316'),
          s('Shipment',     'open', '#fb923c'),
          s('Delivered',    'won',  '#10b981'),
          s('Cancelled',    'lost', '#ef4444'),
        ],
      },
    ],
  },

  'real_estate_rental': {
    label: 'Real Estate Rental',
    pipelines: [
      {
        name: 'Rental Pipeline',
        key: 'rental',
        isDefault: true,
        stages: [
          s('New Enquiry',       'open', '#6366f1'),
          s('Contacted',         'open', '#3b82f6'),
          s('Property Shortlisted','open','#8b5cf6'),
          s('Property Visit',    'open', '#06b6d4'),
          s('Documents',         'open', '#f59e0b'),
          s('Agreement',         'open', '#f97316'),
          s('Move-in',           'won',  '#10b981'),
          s('Cancelled',         'lost', '#ef4444'),
        ],
      },
    ],
  },

  'recruitment_agency': {
    label: 'Recruitment Agency',
    pipelines: [
      {
        name: 'Agency Recruitment Pipeline',
        key: 'agency_recruitment',
        isDefault: true,
        stages: [
          s('New Requirement',   'open', '#6366f1'),
          s('Candidate Sourcing','open', '#3b82f6'),
          s('Screening',         'open', '#8b5cf6'),
          s('Interview',         'open', '#06b6d4'),
          s('Selected',          'open', '#f59e0b'),
          s('Offer',             'open', '#f97316'),
          s('Joined',            'won',  '#10b981'),
          s('Rejected',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  'marketing_advertising': {
    label: 'Marketing / Advertising Agency',
    pipelines: [
      {
        name: 'Agency Sales Pipeline',
        key: 'agency_sales',
        isDefault: true,
        stages: [
          s('New Lead',      'open', '#6366f1'),
          s('Contacted',     'open', '#3b82f6'),
          s('Requirement',   'open', '#8b5cf6'),
          s('Strategy',      'open', '#06b6d4'),
          s('Proposal Sent', 'open', '#f59e0b'),
          s('Negotiation',   'open', '#f97316'),
          s('Won',           'won',  '#10b981'),
          s('Lost',          'lost', '#ef4444'),
        ],
      },
    ],
  },

  // Generic fallback — used when no specific industry matches
  'general': {
    label: 'General / Other',
    pipelines: [
      {
        name: 'Sales Pipeline',
        key: 'sales',
        isDefault: true,
        stages: [
          s('New Lead',       'open', '#6366f1'),
          s('Contacted',      'open', '#3b82f6'),
          s('Qualified',      'open', '#8b5cf6'),
          s('Proposal Sent',  'open', '#f59e0b'),
          s('Negotiation',    'open', '#f97316'),
          s('Won',            'won',  '#10b981'),
          s('Lost',           'lost', '#ef4444'),
        ],
      },
    ],
  },
};

/**
 * Get template for a given industry key.
 * Falls back to 'general' if not found.
 */
function getTemplate(industryKey) {
  return INDUSTRY_TEMPLATES[industryKey] || INDUSTRY_TEMPLATES['general'];
}

/**
 * List all industry keys and labels.
 */
function listIndustries() {
  return Object.entries(INDUSTRY_TEMPLATES).map(([key, t]) => ({ key, label: t.label }));
}

/**
 * Create default pipelines for a tenant from their industry template.
 * Idempotent — skips pipelines whose names already exist in the tenant.
 *
 * @param {string|ObjectId} tenantId
 * @param {string} industryKey - from INDUSTRY_TEMPLATES keys
 * @param {string|ObjectId} [createdBy] - user who created them
 * @returns {Promise<Array>} - created Pipeline documents
 */
async function createDefaultPipelinesForTenant(tenantId, industryKey, createdBy) {
  const Pipeline = require('../models/Pipeline');
  const template = getTemplate(industryKey || 'general');

  const created = [];

  // Check if tenant already has any pipelines
  const existingCount = await Pipeline.countDocuments({ tenantId });

  for (let i = 0; i < template.pipelines.length; i++) {
    const tpl = template.pipelines[i];

    // Skip if a pipeline with the same name already exists
    const existing = await Pipeline.findOne({ tenantId, name: tpl.name });
    if (existing) continue;

    const stages = tpl.stages.map((stage, idx) => ({
      name: stage.name,
      key: stage.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      order: idx,
      type: stage.type || 'open',
      color: stage.color || '#6366f1',
      probability: stage.probability || (stage.type === 'won' ? 100 : 0),
    }));

    const pipeline = await Pipeline.create({
      tenantId,
      name: tpl.name,
      key: tpl.key,
      industry: industryKey || 'general',
      isDefault: tpl.isDefault && existingCount === 0 && i === 0,
      isActive: true,
      stages,
      createdBy: createdBy || null,
    });

    created.push(pipeline);
  }

  return created;
}

module.exports = {
  INDUSTRY_TEMPLATES,
  getTemplate,
  listIndustries,
  createDefaultPipelinesForTenant,
};
