import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import {v4 as uuidv4} from 'uuid';

import {config, validateConfig} from './config';
import {requestLogger, errorLogger, logger} from './utils/logger';
import {AppError, ValidationError} from './types';

// Import routes
import authRoutes from './routes/auth';
import reportRoutes from './routes/reports';
import attachmentRoutes from './routes/attachments';

// Import middleware
import {authenticateToken} from './middleware/auth';

// Validate configuration on startup
validateConfig();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting (disabled in test environment)
if (process.env['NODE_ENV'] !== 'test') {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);
}

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));

// Request correlation ID middleware
app.use((req: any, res, next) => {
  req.id = req.headers['x-correlation-id'] as string || uuidv4();
  res.setHeader('X-Correlation-ID', req.id);
  next();
});

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/reports', authenticateToken, attachmentRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    errors: [{field: 'route', message: 'Endpoint not found'}],
  });
});

// Error logging middleware
app.use(errorLogger);

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    correlationId: (req as any).id,
    errorType: error.constructor.name,
    isValidationError: error instanceof ValidationError,
  });

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errors: [{field: 'general', message: error.message}],
    });
  }

  if (error instanceof ValidationError) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: error.errors,
    });
  }

  // Handle multer errors (file upload errors)
  if ((error as any).code === 'LIMIT_FILE_SIZE') {
    return res.status(422).json({
      success: false,
      message: 'File size exceeds maximum allowed size',
      errors: [{field: 'file', message: `File size exceeds maximum allowed size of ${(error as any).limit} bytes`}],
    });
  }

  if ((error as any).code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(422).json({
      success: false,
      message: 'Unexpected file field',
      errors: [{field: 'file', message: 'Only single file upload is allowed'}],
    });
  }

  // Handle other multer/file upload errors
  if (error.message && error.message.includes('File type') && error.message.includes('not allowed')) {
    return res.status(422).json({
      success: false,
      message: 'Unsupported file type',
      errors: [{field: 'file', message: error.message}],
    });
  }

  // Don't expose internal errors in production
  const message = config.server.nodeEnv === 'production'
    ? 'Internal server error'
    : error.message;

  return res.status(500).json({
    success: false,
    message,
    errors: [{field: 'general', message}],
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {promise, reason});
  process.exit(1);
});

// Uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {error: error.message, stack: error.stack});
  process.exit(1);
});

export default app;
