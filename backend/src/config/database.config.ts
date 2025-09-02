export const databaseConfig = {
  url: process.env.DATABASE_URL || 'postgresql://kanban_user:password@localhost:5432/kanban_db',
  poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
  poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  poolAcquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
  poolIdle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
  logging: process.env.DB_LOGGING === 'true',
  ssl: process.env.DB_SSL === 'true'
};