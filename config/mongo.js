const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB } = require('./constants');

let connectionPromise = null;
let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('disconnected', () => {
    connectionPromise = null;
    console.warn('⚠️ MongoDB disconnected.');
  });

  mongoose.connection.on('error', (error) => {
    connectionPromise = null;
    console.error('❌ MongoDB connection error:', error?.message || error);
  });
}

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
  registerConnectionListeners();

  const options = {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 1),
    retryWrites: process.env.MONGO_RETRY_WRITES === 'false' ? false : true,
    ...(MONGO_DB ? { dbName: MONGO_DB } : {}),
  };

  connectionPromise = mongoose
    .connect(MONGO_URI, options)
    .then((instance) => {
      console.log('✅ MongoDB connected successfully.');
      return instance.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error('❌ Unable to connect to MongoDB:', error?.message || error);
      if (error?.cause) {
        console.error('❌ MongoDB connection cause:', error.cause);
      }
      throw error;
    });

  return connectionPromise;
}

module.exports = {
  connectMongo,
  mongoose,
};
