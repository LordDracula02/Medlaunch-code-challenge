import {Router, Request, Response} from 'express';
import {body, validationResult} from 'express-validator';
import {AuthService} from '../services/auth';
import {dataStore} from '../services/dataStore';
import {UserRole, UserTier, AuthenticationError, ValidationError} from '../types';
import {logRequest, logRequestError} from '../utils/logger';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('name')
    .trim()
    .isLength({min: 2, max: 50})
    .withMessage('Name must be between 2 and 50 characters'),
  body('password')
    .isLength({min: 8})
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('role')
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage('Invalid role'),
  body('tier')
    .optional()
    .isIn(Object.values(UserTier))
    .withMessage('Invalid tier'),
], async (req: Request, res: Response) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
      );
    }

    const {email, name, password, role, tier} = req.body;

    // Check if user already exists
    const existingUser = await dataStore.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
        errors: [{field: 'email', message: 'Email already registered'}],
      });
    }

    // Create user
    const user = await AuthService.createUser({
      email,
      name,
      password,
      role: role || UserRole.READER,
      tier: tier || UserTier.DEFAULT,
    });

    // Save user to data store
    const savedUser = await dataStore.createUser(user);

    // Generate tokens
    const accessToken = AuthService.generateToken(savedUser);
    const refreshToken = AuthService.generateRefreshToken(savedUser);

    logRequest(req, 'User registered successfully', {userId: savedUser.id, email});

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          name: savedUser.name,
          role: savedUser.role,
          tier: savedUser.tier,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logRequestError(req, 'User registration failed', error as Error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed',
      errors: [{field: 'general', message: 'Internal server error'}],
    });
  }
});

/**
 * POST /api/auth/login
 * Login user and return tokens
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
], async (req: Request, res: Response) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
      );
    }

    const {email, password} = req.body;

    // Find user by email
    const user = await dataStore.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        errors: [{field: 'credentials', message: 'Email or password is incorrect'}],
      });
    }

    // Verify password
    const isValidPassword = await AuthService.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        errors: [{field: 'credentials', message: 'Email or password is incorrect'}],
      });
    }

    // Generate tokens
    const accessToken = AuthService.generateToken(user);
    const refreshToken = AuthService.generateRefreshToken(user);

    logRequest(req, 'User logged in successfully', {userId: user.id, email});

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tier: user.tier,
          storageUsed: user.storageUsed,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logRequestError(req, 'User login failed', error as Error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Login failed',
      errors: [{field: 'general', message: 'Internal server error'}],
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
], async (req: Request, res: Response) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
      );
    }

    const {refreshToken} = req.body;

    // Verify refresh token
    const payload = AuthService.verifyToken(refreshToken);

    // Get user from database
    const user = await dataStore.getUser(payload.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        errors: [{field: 'refreshToken', message: 'Token is invalid'}],
      });
    }

    // Generate new tokens
    const newAccessToken = AuthService.generateToken(user);
    const newRefreshToken = AuthService.generateRefreshToken(user);

    logRequest(req, 'Token refreshed successfully', {userId: user.id});

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    logRequestError(req, 'Token refresh failed', error as Error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors,
      });
    }

    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        errors: [{field: 'refreshToken', message: 'Token is invalid or expired'}],
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      errors: [{field: 'general', message: 'Internal server error'}],
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client should discard tokens)
 */
router.post('/logout', (req: Request, res: Response) => {
  // In a real application, you might want to blacklist the token
  // For this demo, we'll just return success
  logRequest(req, 'User logged out', {userId: req.user?.id});

  res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      errors: [{field: 'authorization', message: 'No valid token provided'}],
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        tier: req.user.tier,
        storageUsed: req.user.storageUsed,
      },
    },
  });
});

export default router;
