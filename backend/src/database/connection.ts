import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { appConfig } from '../config/app.config';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: appConfig.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });

if (!appConfig.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Failed to disconnect from database:', error);
    throw error;
  }
}

process.on('beforeExit', async () => {
  await disconnectDatabase();
});