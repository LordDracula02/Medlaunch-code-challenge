import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LRUCache } from 'lru-cache';
import { logInfo, logError } from '../utils/logger';

// In-memory cache for idempotency keys (would be Redis in production)
const idempotencyCache = new LRUCache<string, { status: number; body: any }>({
  max: 500, // Max 500 entries
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

/**
 * Idempotency middleware for preventing duplicate requests
 * Implements idempotency key pattern for safe request retries
 * 
 * Usage: Include "Idempotency-Key" header with a UUID
 * - If key already exists, returns cached response
 * - If key is new, processes request and caches successful response
 * - Only caches 2xx responses, errors are not cached
 */
export const idempotencyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;

  // If no idempotency key provided, continue normally
  if (!idempotencyKey) {
    return next();
  }

  // Validate idempotency key format (must be UUID)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Idempotency-Key format. Must be a valid UUID.',
      errors: [{ field: 'Idempotency-Key', message: 'Invalid UUID format' }],
    });
  }

  // Check if we have a cached response for this key
  const cachedResponse = idempotencyCache.get(idempotencyKey);
  if (cachedResponse) {
    logInfo('Returning cached response for idempotency key', { idempotencyKey });
    return res.status(cachedResponse.status).json(cachedResponse.body);
  }

  // Override res.json to cache the response
  const originalJson = res.json;
  res.json = function (body?: any) {
    // Only cache successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(idempotencyKey, { status: res.statusCode, body });
      logInfo('Caching response for idempotency key', { 
        idempotencyKey, 
        statusCode: res.statusCode 
      });
    } else {
      logError('Not caching error response for idempotency key', new Error(`Status ${res.statusCode} for key ${idempotencyKey}`));
    }
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Generate a new idempotency key
 * Utility function for testing or client implementations
 */
export const generateIdempotencyKey = (): string => {
  return uuidv4();
};

/**
 * Clear idempotency cache (for testing)
 */
export const clearIdempotencyCache = (): void => {
  idempotencyCache.clear();
};
