import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

// Create base logger configuration
const loggerConfig = {
  level: logLevel,
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pretty printing
  // In production, use JSON format for better parsing
  ...(isDevelopment ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      }
    }
  } : {
    // JSON format for production
    formatters: {
      level: (label: string) => ({ level: label.toUpperCase() }),
    }
  })
};

// Create the base logger
const baseLogger = pino(loggerConfig);

export function createLogger(component: string) {
  return baseLogger.child({ component });
}

// Export the base logger for any direct usage
export { baseLogger as logger };