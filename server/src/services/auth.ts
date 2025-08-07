import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {v4 as uuidv4} from 'uuid';
import {
  User,
  JWTPayload,
  UserRole,
  UserTier,
  AuthenticationError,

} from '../types';
import {config} from '../config';
import {logInfo, logError} from '../utils/logger';

export class AuthService {
  private static readonly SALT_ROUNDS = 12;

  /**
   * Hash a password using bcrypt
   */
  static async hashPassword (password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.SALT_ROUNDS);
    } catch (error) {
      logError('Password hashing failed', error as Error);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Compare a password with its hash
   */
  static async comparePassword (password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logError('Password comparison failed', error as Error);
      return false;
    }
  }

  /**
   * Generate JWT token for a user
   */
  static generateToken (user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    };

    try {
      const token = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
        issuer: 'backend-api',
        audience: 'reports-app',
      } as jwt.SignOptions);

      logInfo('JWT token generated', {userId: user.id, role: user.role});
      return token;
    } catch (error) {
      logError('JWT token generation failed', error as Error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken (user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    };

    try {
      const token = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.refreshExpiresIn,
        issuer: 'backend-api',
        audience: 'reports-app',
      } as jwt.SignOptions);

      logInfo('Refresh token generated', {userId: user.id});
      return token;
    } catch (error) {
      logError('Refresh token generation failed', error as Error);
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Verify and decode JWT token
   */
  static verifyToken (token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'backend-api',
        audience: 'reports-app',
      } as jwt.VerifyOptions) as JWTPayload;

      logInfo('JWT token verified', {userId: decoded.userId});
      return decoded;
    } catch (error) {
      logError('JWT token verification failed', error as Error);
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  /**
   * Check if user has required role
   */
  static hasRole (user: User, requiredRole: UserRole): boolean {
    const roleHierarchy = {
      [UserRole.READER]: 1,
      [UserRole.EDITOR]: 2,
      [UserRole.ADMIN]: 3,
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }

  /**
   * Check if user has any of the required roles
   */
  static hasAnyRole (user: User, requiredRoles: UserRole[]): boolean {
    return requiredRoles.some(role => this.hasRole(user, role));
  }

  /**
   * Check if user can perform action on resource
   */
  static canPerformAction (
    user: User,
    action: 'read' | 'create' | 'update' | 'delete',

  ): boolean {
    // Admins can do everything
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Editors can read, create, and update
    if (user.role === UserRole.EDITOR) {
      return ['read', 'create', 'update'].includes(action);
    }

    // Readers can only read
    if (user.role === UserRole.READER) {
      return action === 'read';
    }

    return false;
  }

  /**
   * Check if user can access specific resource
   */
  static canAccessResource (
    user: User,
    resourceOwnerId: string,
    resourceCollaborators: string[] = [],
  ): boolean {
    // Admins can access everything
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Users can access their own resources
    if (user.id === resourceOwnerId) {
      return true;
    }

    // Users can access resources they're collaborating on
    if (resourceCollaborators.includes(user.id)) {
      return true;
    }

    return false;
  }

  /**
   * Generate a secure random string for idempotency keys
   */
  static generateIdempotencyKey (): string {
    return uuidv4();
  }

  /**
   * Validate email format
   */
  static isValidEmail (email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength (password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a new user with hashed password
   */
  static async createUser (userData: {
    email: string;
    name: string;
    password: string;
    role?: UserRole;
    tier?: UserTier;
  }): Promise<Omit<User, 'password'> & { password: string }> {
    // Validate email
    if (!this.isValidEmail(userData.email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(userData.password);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password
    const hashedPassword = await this.hashPassword(userData.password);

    // Create user object
    const user: User = {
      id: uuidv4(),
      email: userData.email.toLowerCase(),
      name: userData.name,
      password: hashedPassword,
      role: userData.role || UserRole.READER,
      tier: userData.tier || UserTier.DEFAULT,
      storageUsed: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logInfo('User created', {userId: user.id, email: user.email, role: user.role});
    return user;
  }
}
