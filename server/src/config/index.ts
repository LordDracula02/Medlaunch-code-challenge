import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env['PORT'] || '3000', 10),
    nodeEnv: process.env['NODE_ENV'] || 'development',
    corsOrigins: process.env['ALLOWED_ORIGINS']?.split(',') || ['http://localhost:3000'],
  },

  jwt: {
    secret: process.env['JWT_SECRET'] || 'fallback-secret-key-change-in-production',
    expiresIn: process.env['JWT_EXPIRES_IN'] || '15m',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
  },

  fileUpload: {
    maxSize: parseInt(process.env['MAX_FILE_SIZE'] || '524288000', 10), // 500MB (matches premium quota)
    allowedTypes: process.env['ALLOWED_FILE_TYPES']?.split(',') || [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'text/plain',
    ],
    uploadPath: process.env['UPLOAD_PATH'] || './uploads',
    signedUrlExpiry: parseInt(process.env['SIGNED_URL_EXPIRY'] || '3600', 10), // 1 hour
  },

  storage: {
    defaultUserQuota: parseInt(process.env['DEFAULT_USER_QUOTA'] || '104857600', 10), // 100MB
    premiumUserQuota: parseInt(process.env['PREMIUM_USER_QUOTA'] || '524288000', 10), // 500MB
  },

  rateLimit: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100', 10),
  },

  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    file: process.env['LOG_FILE'] || './logs/app.log',
  },

  businessRules: {
    maxConcurrentEditors: parseInt(process.env['MAX_CONCURRENT_EDITORS'] || '3', 10),
    autoArchiveDays: parseInt(process.env['AUTO_ARCHIVE_DAYS'] || '730', 10), // 2 years
  },
};

// Validation function to ensure all required config is present
export function validateConfig (): void {
  // Validate JWT secret is not the default in production
  if (config.server.nodeEnv === 'production' && config.jwt.secret === 'fallback-secret-key-change-in-production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
}

// Helper function to get absolute path for uploads
export function getUploadPath (): string {
  return path.resolve(config.fileUpload.uploadPath);
}

// Helper function to get user quota based on tier
export function getUserQuota (tier: string): number {
  return tier === 'premium' ? config.storage.premiumUserQuota : config.storage.defaultUserQuota;
}
