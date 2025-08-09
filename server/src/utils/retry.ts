import { logError, logInfo } from './logger';

interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  jitter?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

interface CircuitBreakerState {
  failures: number;
  isOpen: boolean;
  lastFailureTime: number;
}

// In-memory circuit breaker state (would be Redis in production)
const circuitBreakerStates: Map<string, CircuitBreakerState> = new Map();

/**
 * Execute async operations with retry logic, exponential backoff, and circuit breaker
 * Implements resilience patterns for production-grade async side effects
 * 
 * @param operation - The async operation to execute
 * @param operationName - Unique name for circuit breaker tracking
 * @param context - Context data for logging
 * @param correlationId - Request correlation ID for tracing
 * @param options - Retry configuration options
 * @returns Promise that resolves to operation result or undefined if all retries fail
 */
export async function executeAsyncSideEffect<T>(
  operation: () => Promise<T>,
  operationName: string,
  context: Record<string, any> = {},
  correlationId: string = 'unknown',
  options?: RetryOptions,
): Promise<T | undefined> {
  const maxRetries = options?.maxRetries ?? 3;
  const backoffMs = options?.backoffMs ?? 1000;
  const jitter = options?.jitter ?? true;
  const circuitBreakerThreshold = options?.circuitBreakerThreshold ?? 5;
  const circuitBreakerResetMs = options?.circuitBreakerResetMs ?? 30000; // 30 seconds

  let circuitBreakerState = circuitBreakerStates.get(operationName);
  if (!circuitBreakerState) {
    circuitBreakerState = { failures: 0, isOpen: false, lastFailureTime: 0 };
    circuitBreakerStates.set(operationName, circuitBreakerState);
  }

  // Circuit Breaker Logic
  if (circuitBreakerState.isOpen) {
    const now = Date.now();
    if (now - circuitBreakerState.lastFailureTime > circuitBreakerResetMs) {
      // Attempt to close the circuit (half-open state)
      logInfo(`Circuit breaker for ${operationName} is attempting to close (half-open)`, { 
        correlationId, 
        context 
      });
      circuitBreakerState.isOpen = false;
      circuitBreakerState.failures = 0; // Reset failures for half-open
    } else {
      logError(`Circuit breaker for ${operationName} is OPEN, skipping operation`, new Error(`Circuit breaker open for ${operationName}`));
      return undefined; // Fail fast
    }
  }

  // Retry loop with exponential backoff
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await operation();
      
      // If successful, reset circuit breaker state
      circuitBreakerState.failures = 0;
      circuitBreakerState.isOpen = false;
      
      logInfo(`Async operation ${operationName} succeeded`, { 
        correlationId, 
        context, 
        attempt: i + 1 
      });
      
      return result;
    } catch (error) {
      logError(`Async operation ${operationName} failed (attempt ${i + 1}/${maxRetries + 1})`, error as Error);

      // Increment failure count for circuit breaker
      circuitBreakerState.failures++;
      circuitBreakerState.lastFailureTime = Date.now();

      // Open circuit breaker if threshold reached
      if (circuitBreakerState.failures >= circuitBreakerThreshold && !circuitBreakerState.isOpen) {
        circuitBreakerState.isOpen = true;
        logError(`Circuit breaker for ${operationName} is now OPEN due to ${circuitBreakerState.failures} failures`, new Error(`Circuit breaker opened for ${operationName}`));
      }

      // If not the last retry, wait with exponential backoff
      if (i < maxRetries) {
        let delay = backoffMs * Math.pow(2, i); // Exponential backoff
        
        if (jitter) {
          // Add random jitter to prevent thundering herd
          delay = delay * (0.5 + Math.random());
        }
        
        logInfo(`Retrying ${operationName} in ${delay}ms...`, { correlationId, context });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // All retries exhausted
        logError(`Async operation ${operationName} failed after ${maxRetries + 1} attempts. Moving to Dead Letter Queue (simulated).`, new Error(`Operation ${operationName} exhausted retries`));
        
        // Simulate sending to a Dead Letter Queue (DLQ)
        // In a real system, this would involve a message broker (e.g., RabbitMQ, AWS SQS)
        // or a dedicated error logging service.
        await simulateDeadLetterQueue(operationName, context, correlationId);
        
        return undefined;
      }
    }
  }
  
  return undefined;
}

/**
 * Simulate Dead Letter Queue for failed operations
 * In production, this would send the failed operation to a message queue for manual review
 */
async function simulateDeadLetterQueue(
  operationName: string, 
  _context: Record<string, any>, 
  correlationId: string
): Promise<void> {
  logError('Operation sent to Dead Letter Queue (simulated)', new Error(`DLQ: ${operationName} - ${correlationId}`));

  // In production, you would:
  // 1. Send to message broker (RabbitMQ, AWS SQS, etc.)
  // 2. Store in error table for manual investigation
  // 3. Trigger alerting system for critical failures
  // 4. Create support tickets for high-priority operations
}

/**
 * Get circuit breaker status for monitoring
 */
export function getCircuitBreakerStatus(operationName: string): CircuitBreakerState | null {
  return circuitBreakerStates.get(operationName) || null;
}

/**
 * Reset circuit breaker for testing or manual intervention
 */
export function resetCircuitBreaker(operationName: string): void {
  circuitBreakerStates.delete(operationName);
  logInfo(`Circuit breaker for ${operationName} has been manually reset`);
}

/**
 * Clear all circuit breaker states (for testing)
 */
export function clearAllCircuitBreakers(): void {
  circuitBreakerStates.clear();
}
