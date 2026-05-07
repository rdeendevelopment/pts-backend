const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB } = require('./constants');

let connectionPromise = null;

async function connectMongo() {
  if (!MONGO_URI) {
    throw new Error('MongoDB connection string is not configured.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose
    .connect(MONGO_URI, MONGO_DB ? { dbName: MONGO_DB } : {})
    .then((instance) => {
      console.log('✅ MongoDB connected successfully.');
      return instance.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error('❌ Unable to connect to MongoDB:', error.message);
      throw error;
    });

  return connectionPromise;
}

module.exports = {
  connectMongo,
  mongoose,
};
