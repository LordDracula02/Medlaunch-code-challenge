// User and Authentication Types
export enum UserRole {
  READER = 'reader',
  EDITOR = 'editor',
  ADMIN = 'admin'
}

export enum UserTier {
  DEFAULT = 'default',
  PREMIUM = 'premium'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tier: UserTier;
  password: string; // hashed
  createdAt: Date;
  updatedAt: Date;
  storageUsed: number; // in bytes
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  iat?: number;
  exp?: number;
}

// Report Types
export enum ReportStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

export enum ReportPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ReportEntry {
  id: string;
  title: string;
  content: string;
  priority: ReportPriority;
  status: ReportStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  metadata: Record<string, any>;
}

export interface ReportComment {
  id: string;
  content: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  parentId?: string; // for nested comments
}

export interface ReportMetrics {
  totalEntries: number;
  activeEntries: number;
  highPriorityEntries: number;
  averagePriority: number;
  lastUpdated: Date;
  trendIndicator: 'increasing' | 'decreasing' | 'stable';
}

export interface Report {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  priority: ReportPriority;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  collaborators: string[]; // user IDs
  concurrentEditors: string[]; // currently editing user IDs
  entries: ReportEntry[];
  comments: ReportComment[];
  tags: string[];
  metadata: Record<string, any>;
  version: number; // for optimistic concurrency control
  isActive: boolean; // soft delete
}

// Attachment Types
export interface Attachment {
  id: string;
  reportId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  storagePath: string;
  downloadUrl?: string;
  expiresAt?: Date;
  isActive: boolean;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
  pagination?: PaginationInfo;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface PaginationInfo {
  page: number;
  size: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Request Types
export interface CreateReportRequest {
  title: string;
  description: string;
  priority: ReportPriority;
  tags?: string[];
  collaborators?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateReportRequest {
  title?: string;
  description?: string;
  status?: ReportStatus;
  priority?: ReportPriority;
  tags?: string[];
  collaborators?: string[];
  metadata?: Record<string, any>;
}

export interface GetReportQuery {
  include?: string[]; // 'entries', 'comments', 'metrics', 'attachments'
  view?: 'default' | 'summary';
  page?: number;
  size?: number;
  sort?: string;
  filter?: string;
}

// Business Rule Types
export interface BusinessRuleContext {
  user: User;
  report: Report;
  action: 'read' | 'create' | 'update' | 'delete' | 'upload';
  resource?: any;
}

export interface BusinessRuleResult {
  allowed: boolean;
  reason?: string;
  constraints?: Record<string, any>;
}

// File Upload Types
export interface FileUploadConfig {
  maxSize: number;
  allowedTypes: string[];
  uploadPath: string;
  generateSignedUrl: boolean;
  urlExpiry: number;
}

// Audit Types
export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeState?: any;
  afterState?: any;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

// Error Types
export class AppError extends Error {
  constructor (
    public statusCode: number,
    public override message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor (public errors: Array<{ field: string; message: string }>) {
    super(422, 'Validation failed');
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor (message = 'Authentication required') {
    super(401, message);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor (message = 'Insufficient permissions') {
    super(403, message);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor (resource = 'Resource') {
    super(404, `${resource} not found`);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor (message = 'Resource conflict') {
    super(409, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
