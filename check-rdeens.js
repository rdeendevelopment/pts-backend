const mongoose = require('mongoose');
const { connectMongo } = require('./config/mongo');

async function check() {
  await connectMongo();
  const { CoreProject, ProjectBudget } = require('./src/app/MongoModels');
  
  const project = await CoreProject.findOne({ title: { $regex: 'Rdeens.*Website' } }).lean();
  if (!project) {
    console.log('Rdeens project not found');
    await mongoose.connection.close();
    return;
  }
  
  console.log('=== Rdeens Project ===');
  console.log('Title:', project.title);
  console.log('Type:', project.projectType);
  console.log('Retainer Hours:', project.retainerHoursPerMonth);
  console.log('Is Retain:', project.isRetain);
  console.log('Hours:', project.hours);
  
  const budgets = await ProjectBudget.find({ projectId: project._id }).lean();
  console.log('\n=== Budgets ===');
  if (budgets.length === 0) {
    console.log('NO BUDGETS FOUND');
  } else {
    budgets.forEach(b => {
      console.log(`- ${b.name}: ${b.allocatedMinutes/60}h (status: ${b.status})`);
    });
  }
  
  await mongoose.connection.close();
}

check().catch(console.error);
