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
    // Force IPv4 to avoid Node.js Happy Eyeballs AggregateError on macOS
    family: 4,
    ...(MONGO_DB ? { dbName: MONGO_DB } : {}),
  };

  const maxRetries = Number(process.env.MONGO_CONNECT_RETRIES || 3);
  const retryDelayMs = Number(process.env.MONGO_CONNECT_RETRY_DELAY_MS || 1500);

  async function attemptConnect(attemptsLeft) {
    try {
      const instance = await mongoose.connect(MONGO_URI, options);
      console.log('✅ MongoDB connected successfully.');
      return instance.connection;
    } catch (error) {
      if (attemptsLeft > 1) {
        console.warn(`⚠️ MongoDB connect failed, retrying in ${retryDelayMs}ms... (${attemptsLeft - 1} attempt(s) left)`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return attemptConnect(attemptsLeft - 1);
      }
      console.error('❌ Unable to connect to MongoDB:', error?.message || error);
      if (error?.cause) {
        console.error('❌ MongoDB connection cause:', error.cause);
      }
      throw error;
    }
  }

  connectionPromise = attemptConnect(maxRetries).catch((error) => {
    connectionPromise = null;
    throw error;
  });

  return connectionPromise;
}

module.exports = {
  connectMongo,
  mongoose,
};
