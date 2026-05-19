const mongoose = require('mongoose');
const { connectMongo } = require('./config/mongo');

async function check() {
  await connectMongo();
  const { CoreProject, ProjectBudget } = require('./src/app/MongoModels');
  
  const project = await CoreProject.findOne({ title: 'Omakase - Web' }).lean();
  console.log('=== Omakase Project ===');
  console.log('Title:', project.title);
  console.log('Type:', project.projectType);
  console.log('Retainer Hours:', project.retainerHoursPerMonth);
  console.log('Is Retain:', project.isRetain);
  
  const budgets = await ProjectBudget.find({ projectId: project._id }).lean();
  console.log('\n=== Budgets ===');
  budgets.forEach(b => {
    console.log(`- ${b.name}: ${b.allocatedMinutes/60}h (status: ${b.status})`);
  });
  
  await mongoose.connection.close();
}

check().catch(console.error);
