import winston from 'winston';
import expressWinston from 'express-winston';
import path from 'path';
import fs from 'fs';
import {config} from '../config';

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, {recursive: true});
}

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({stack: true}),
  winston.format.json(),
  winston.format.printf(({timestamp, level, message, ...meta}) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }),
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {service: 'backend-api'},
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: config.logging.file,
    }),
  ],
});

// Express middleware for request logging
export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}}',
  expressFormat: true,
  colorize: false,
  ignoreRoute: (req, _res) => {
    // Ignore health check endpoints
    return req.url === '/health' || req.url === '/favicon.ico';
  },
});

// Express middleware for error logging
export const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}} - Error: {{err.message}}',
});

// Helper functions for structured logging
export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error, meta?: any) => {
  logger.error(message, {error: error?.message, stack: error?.stack, ...meta});
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

// Request-specific logging with correlation ID
export const logRequest = (req: any, message: string, meta?: any) => {
  const correlationId = req.headers['x-correlation-id'] || req.id || 'unknown';
  logger.info(message, {correlationId, ...meta});
};

export const logRequestError = (req: any, message: string, error?: Error, meta?: any) => {
  const correlationId = req.headers['x-correlation-id'] || req.id || 'unknown';
  logger.error(message, {correlationId, error: error?.message, stack: error?.stack, ...meta});
};

// Business rule logging
export const logBusinessRule = (rule: string, context: any, result: any) => {
  logger.info('Business rule evaluation', {
    rule,
    context: {
      userId: context.user?.id,
      action: context.action,
      resourceId: context.report?.id,
    },
    result,
  });
};

// Audit logging
export const logAudit = (action: string, userId: string, resourceType: string, resourceId: string, details?: any) => {
  logger.info('Audit log', {
    action,
    userId,
    resourceType,
    resourceId,
    details,
  });
};

// Performance logging
export const logPerformance = (operation: string, duration: number, meta?: any) => {
  logger.info('Performance metric', {
    operation,
    duration,
    ...meta,
  });
};
