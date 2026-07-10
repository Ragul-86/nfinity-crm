require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const seed = async () => {
  await connectDB();

  const User = require('../models/User');
  const Notification = require('../models/Notification');

  // Remove existing demo user if any
  await User.deleteOne({ email: 'admin@ascendia.com' });

  const user = await User.create({
    name: 'Super Admin',
    email: 'admin@ascendia.com',
    password: 'admin123',
    role: 'super_admin',
    isActive: true,
    isEmailVerified: true,
  });

  // Seed demo notifications
  await Notification.deleteMany({ recipient: user._id });
  await Notification.insertMany([
    { recipient: user._id, type: 'task', title: 'Task Due Soon', message: 'Q4 Campaign Report is due in 2 hours', isRead: false },
    { recipient: user._id, type: 'sop_approval', title: 'SOP Pending Approval', message: '"Client Onboarding Process v2" needs your approval', isRead: false },
    { recipient: user._id, type: 'lead', title: 'New Lead Assigned', message: 'You have been assigned a new lead: TechCorp Solutions', isRead: true, createdAt: new Date(Date.now() - 7200000) },
    { recipient: user._id, type: 'campaign', title: 'Campaign Budget Alert', message: 'Google Ads "Brand Q4" has used 90% of its budget', isRead: true, createdAt: new Date(Date.now() - 86400000) },
    { recipient: user._id, type: 'system', title: 'Welcome to Ascendia CRM', message: 'Your account is set up and ready to go!', isRead: true, createdAt: new Date(Date.now() - 172800000) },
  ]);

  console.log('✅ Demo user created:');
  console.log('   Email:    admin@ascendia.com');
  console.log('   Password: admin123');
  console.log('   Role:     super_admin');
  console.log('✅ 5 demo notifications seeded');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
