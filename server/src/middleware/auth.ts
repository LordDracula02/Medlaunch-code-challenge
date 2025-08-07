import {Request, Response, NextFunction} from 'express';
import {AuthService} from '../services/auth';
import {UserRole, AuthenticationError, AuthorizationError, User} from '../types';
import {logRequest, logRequestError} from '../utils/logger';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

/**
 * Middleware to authenticate JWT token and attach user to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    // Verify token
    const payload = AuthService.verifyToken(token);

    // In a real application, you would fetch the user from database
    // For this demo, we'll create a mock user object
    const user: User = {
      id: payload.userId,
      email: payload.email,
      name: payload.email.split('@')[0] || 'User', // Mock name from email
      role: payload.role,
      tier: payload.tier,
      password: '', // Not needed for authenticated requests
      storageUsed: 0, // Would be fetched from database
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    req.user = user;
    req.token = token;

    logRequest(req, 'User authenticated', {userId: user.id, role: user.role});
    next();
  } catch (error) {
    logRequestError(req, 'Authentication failed', error as Error);

    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        message: error.message,
        errors: [{field: 'authorization', message: error.message}],
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Authentication failed',
        errors: [{field: 'authorization', message: 'Invalid token'}],
      });
    }
  }
};

/**
 * Middleware to require specific role(s)
 */
export const requireRole = (requiredRoles: UserRole | UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      const hasRequiredRole = AuthService.hasAnyRole(req.user, roles);

      if (!hasRequiredRole) {
        throw new AuthorizationError(
          `Insufficient permissions. Required roles: ${roles.join(', ')}`,
        );
      }

      logRequest(req, 'Role authorization passed', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
      });
      next();
    } catch (error) {
      logRequestError(req, 'Role authorization failed', error as Error);

      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Authorization check failed',
        });
      }
    }
  };
};

/**
 * Middleware to require minimum role (hierarchical)
 */
export const requireMinRole = (minimumRole: UserRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const hasMinRole = AuthService.hasRole(req.user, minimumRole);

      if (!hasMinRole) {
        throw new AuthorizationError(
          `Insufficient permissions. Minimum role required: ${minimumRole}`,
        );
      }

      logRequest(req, 'Minimum role authorization passed', {
        userId: req.user.id,
        userRole: req.user.role,
        minimumRole,
      });
      next();
    } catch (error) {
      logRequestError(req, 'Minimum role authorization failed', error as Error);

      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Authorization check failed',
        });
      }
    }
  };
};

/**
 * Middleware to check if user can perform specific action
 */
export const canPerformAction = (action: 'read' | 'create' | 'update' | 'delete') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const canPerform = AuthService.canPerformAction(req.user, action);

      if (!canPerform) {
        throw new AuthorizationError(
          `Insufficient permissions to ${action} this resource`,
        );
      }

      logRequest(req, 'Action authorization passed', {
        userId: req.user.id,
        action,
      });
      next();
    } catch (error) {
      logRequestError(req, 'Action authorization failed', error as Error);

      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Authorization check failed',
        });
      }
    }
  };
};

/**
 * Middleware to check resource ownership or collaboration
 */
export const canAccessResource = (resourceOwnerField = 'createdBy') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      // Get resource from request (could be from params, body, or query)
      const resource = req.body || req.params || req.query;

      if (!resource || !resource[resourceOwnerField]) {
        // If no resource owner field, allow access (for creation endpoints)
        next();
        return;
      }

      const resourceOwnerId = resource[resourceOwnerField];
      const collaborators = resource.collaborators || [];

      const canAccess = AuthService.canAccessResource(
        req.user,
        resourceOwnerId,
        collaborators,
      );

      if (!canAccess) {
        throw new AuthorizationError(
          'You do not have permission to access this resource',
        );
      }

      logRequest(req, 'Resource access authorization passed', {
        userId: req.user.id,
        resourceOwnerId,
      });
      next();
    } catch (error) {
      logRequestError(req, 'Resource access authorization failed', error as Error);

      if (error instanceof AuthenticationError) {
        res.status(401).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else if (error instanceof AuthorizationError) {
        res.status(403).json({
          success: false,
          message: error.message,
          errors: [{field: 'authorization', message: error.message}],
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Authorization check failed',
        });
      }
    }
  };
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = AuthService.verifyToken(token);

      const user: User = {
        id: payload.userId,
        email: payload.email,
        name: payload.email.split('@')[0] || 'User',
        role: payload.role,
        tier: payload.tier,
        password: '',
        storageUsed: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      req.user = user;
      req.token = token;

      logRequest(req, 'Optional authentication successful', {userId: user.id});
    }

    next();
  } catch (error) {
    // Don't fail on optional auth, just continue without user
    logRequest(req, 'Optional authentication failed, continuing without user');
    next();
  }
};
