import {v4 as uuidv4} from 'uuid';
import {
  Report,
  User,
  Attachment,
  ReportStatus,
  ReportPriority,
  UserRole,
  UserTier,


  ReportMetrics,
  AuditLog,
  NotFoundError,
  ConflictError,
} from '../types';
import {BusinessRulesService} from './businessRules';
import {logInfo} from '../utils/logger';

// In-memory storage
class InMemoryStore {
  private reports: Map<string, Report> = new Map();

  private users: Map<string, User> = new Map();

  private attachments: Map<string, Attachment> = new Map();

  private auditLogs: AuditLog[] = [];

  // Initialize with some sample data
  constructor () {
    this.initializeSampleData();
  }

  private initializeSampleData (): void {
    // Create sample users with properly hashed passwords
    // Note: These are pre-hashed passwords for testing
    // In production, passwords should be hashed during user creation
    const sampleUsers: User[] = [
      {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: UserRole.ADMIN,
        tier: UserTier.PREMIUM,
        password: '$2a$12$rQZ8N0yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8O', // admin123
        storageUsed: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'user-2',
        email: 'editor@example.com',
        name: 'Editor User',
        role: UserRole.EDITOR,
        tier: UserTier.DEFAULT,
        password: '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // editor123
        storageUsed: 52428800, // 50MB
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: 'user-3',
        email: 'reader@example.com',
        name: 'Reader User',
        role: UserRole.READER,
        tier: UserTier.DEFAULT,
        password: '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // reader123
        storageUsed: 10485760, // 10MB
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03'),
      },
    ];

    sampleUsers.forEach(user => this.users.set(user.id, user));

    // Create sample reports
    const sampleReports: Report[] = [
      {
        id: 'report-1',
        title: 'Q1 Financial Report',
        description: 'Comprehensive financial analysis for Q1 2024',
        status: ReportStatus.ACTIVE,
        priority: ReportPriority.HIGH,
        createdBy: 'user-2',
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-20'),
        lastModifiedBy: 'user-2',
        lastModifiedAt: new Date('2024-01-20'),
        collaborators: ['user-1'],
        concurrentEditors: [],
        entries: [
          {
            id: 'entry-1',
            title: 'Revenue Analysis',
            content: 'Revenue increased by 15% compared to last quarter',
            priority: ReportPriority.HIGH,
            status: ReportStatus.ACTIVE,
            createdBy: 'user-2',
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
            tags: ['finance', 'revenue'],
            metadata: {department: 'finance'},
          },
          {
            id: 'entry-2',
            title: 'Cost Analysis',
            content: 'Operating costs reduced by 8% through efficiency improvements',
            priority: ReportPriority.MEDIUM,
            status: ReportStatus.ACTIVE,
            createdBy: 'user-2',
            createdAt: new Date('2024-01-16'),
            updatedAt: new Date('2024-01-16'),
            tags: ['finance', 'costs'],
            metadata: {department: 'operations'},
          },
        ],
        comments: [
          {
            id: 'comment-1',
            content: 'Excellent work on the revenue analysis',
            createdBy: 'user-1',
            createdAt: new Date('2024-01-17'),
            updatedAt: new Date('2024-01-17'),
          },
        ],
        tags: ['finance', 'quarterly', 'analysis'],
        metadata: {fiscalYear: 2024, quarter: 1},
        version: 1,
        isActive: true,
      },
      {
        id: 'report-2',
        title: 'Old Archived Report',
        description: 'This is an old report that should be archived',
        status: ReportStatus.ARCHIVED,
        priority: ReportPriority.LOW,
        createdBy: 'user-2',
        createdAt: new Date('2022-01-01'), // 2+ years old
        updatedAt: new Date('2022-01-01'),
        lastModifiedBy: 'user-2',
        lastModifiedAt: new Date('2022-01-01'),
        collaborators: [],
        concurrentEditors: [],
        entries: [],
        comments: [],
        tags: ['archived', 'old'],
        metadata: {},
        version: 1,
        isActive: true,
      },
    ];

    sampleReports.forEach(report => this.reports.set(report.id, report));

    logInfo('Sample data initialized', {
      usersCount: this.users.size,
      reportsCount: this.reports.size,
    });
  }

  // Report operations
  async createReport (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'isActive'>): Promise<Report> {
    const report: Report = {
      ...reportData,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      isActive: true,
    };

    this.reports.set(report.id, report);
    logInfo('Report created', {reportId: report.id, createdBy: report.createdBy});
    return report;
  }

  async getReport (id: string): Promise<Report | null> {
    const report = this.reports.get(id);
    if (!report || !report.isActive) {
      return null;
    }
    return report;
  }

  async updateReport (id: string, updates: Partial<Report>, userId: string): Promise<Report> {
    const report = this.reports.get(id);
    if (!report || !report.isActive) {
      throw new NotFoundError('Report');
    }

    // Optimistic concurrency control
    if (updates.version && updates.version !== report.version) {
      throw new ConflictError('Report has been modified by another user');
    }

    const updatedReport: Report = {
      ...report,
      ...updates,
      updatedAt: new Date(),
      lastModifiedBy: userId,
      lastModifiedAt: new Date(),
      version: report.version + 1,
    };

    this.reports.set(id, updatedReport);
    logInfo('Report updated', {reportId: id, updatedBy: userId});
    return updatedReport;
  }

  async deleteReport (id: string): Promise<void> {
    const report = this.reports.get(id);
    if (!report) {
      throw new NotFoundError('Report');
    }

    // Soft delete
    report.isActive = false;
    report.status = ReportStatus.DELETED;
    report.updatedAt = new Date();

    this.reports.set(id, report);
    logInfo('Report deleted', {reportId: id});
  }

  async listReports (filters?: {
    status?: ReportStatus;
    priority?: ReportPriority;
    createdBy?: string;
    tags?: string[];
  }): Promise<Report[]> {
    let reports = Array.from(this.reports.values()).filter(r => r.isActive);

    if (filters) {
      if (filters.status) {
        reports = reports.filter(r => r.status === filters.status);
      }
      if (filters.priority) {
        reports = reports.filter(r => r.priority === filters.priority);
      }
      if (filters.createdBy) {
        reports = reports.filter(r => r.createdBy === filters.createdBy);
      }
      if (filters.tags) {
        reports = reports.filter(r => filters.tags!.some(tag => r.tags.includes(tag)));
      }
    }

    return reports.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // User operations
  async createUser (userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const user: User = {
      ...userData,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(user.id, user);
    logInfo('User created', {userId: user.id, email: user.email});
    return user;
  }

  async getUser (id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail (email: string): Promise<User | null> {
    return Array.from(this.users.values()).find(u => u.email === email) || null;
  }

  async updateUser (id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    };

    this.users.set(id, updatedUser);
    logInfo('User updated', {userId: id});
    return updatedUser;
  }

  async updateUserStorage (id: string, newStorageUsed: number): Promise<void> {
    const user = this.users.get(id);
    if (!user) {
      throw new NotFoundError('User');
    }

    user.storageUsed = newStorageUsed;
    user.updatedAt = new Date();

    this.users.set(id, user);
    logInfo('User storage updated', {userId: id, newStorageUsed});
  }

  // Attachment operations
  async createAttachment (attachmentData: Omit<Attachment, 'id' | 'uploadedAt' | 'isActive'>): Promise<Attachment> {
    const attachment: Attachment = {
      ...attachmentData,
      id: uuidv4(),
      uploadedAt: new Date(),
      isActive: true,
    };

    this.attachments.set(attachment.id, attachment);
    logInfo('Attachment created', {attachmentId: attachment.id, reportId: attachment.reportId});
    return attachment;
  }

  async getAttachment (id: string): Promise<Attachment | null> {
    const attachment = this.attachments.get(id);
    if (!attachment || !attachment.isActive) {
      return null;
    }
    return attachment;
  }

  async getAttachmentsByReport (reportId: string): Promise<Attachment[]> {
    return Array.from(this.attachments.values())
      .filter(a => a.reportId === reportId && a.isActive)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async updateAttachment (id: string, updates: Partial<Attachment>): Promise<Attachment> {
    const attachment = this.attachments.get(id);
    if (!attachment || !attachment.isActive) {
      throw new NotFoundError('Attachment');
    }

    const updatedAttachment: Attachment = { ...attachment, ...updates };
    this.attachments.set(id, updatedAttachment);
    logInfo('Attachment updated', { attachmentId: id });
    return updatedAttachment;
  }

  async deleteAttachment (id: string): Promise<void> {
    const attachment = this.attachments.get(id);
    if (!attachment) {
      throw new NotFoundError('Attachment');
    }

    attachment.isActive = false;
    this.attachments.set(id, attachment);
    logInfo('Attachment deleted', {attachmentId: id});
  }

  // Audit logging
  async addAuditLog (log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      ...log,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.auditLogs.push(auditLog);

    // Keep only last 1000 audit logs to prevent memory issues
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
  }

  async getAuditLogs (filters?: {
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    let logs = [...this.auditLogs];

    if (filters) {
      if (filters.userId) {
        logs = logs.filter(l => l.userId === filters.userId);
      }
      if (filters.resourceType) {
        logs = logs.filter(l => l.resourceType === filters.resourceType);
      }
      if (filters.resourceId) {
        logs = logs.filter(l => l.resourceId === filters.resourceId);
      }
      if (filters.action) {
        logs = logs.filter(l => l.action === filters.action);
      }
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      logs = logs.slice(0, filters.limit);
    }

    return logs;
  }

  // Utility methods
  async getReportMetrics (reportId: string): Promise<ReportMetrics> {
    const report = await this.getReport(reportId);
    if (!report) {
      throw new NotFoundError('Report');
    }

    const totalEntries = report.entries.length;
    const activeEntries = report.entries.filter(e => e.status === ReportStatus.ACTIVE).length;
    const highPriorityEntries = report.entries.filter(e => e.priority === ReportPriority.HIGH || e.priority === ReportPriority.CRITICAL).length;

    const priorityValues = {
      [ReportPriority.LOW]: 1,
      [ReportPriority.MEDIUM]: 2,
      [ReportPriority.HIGH]: 3,
      [ReportPriority.CRITICAL]: 4,
    };

    const averagePriority = totalEntries > 0
      ? report.entries.reduce((sum, entry) => sum + priorityValues[entry.priority], 0) / totalEntries
      : 0;

    // Simple trend indicator based on recent activity
    const recentEntries = report.entries.filter(e => e.updatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    );
    const trendIndicator = recentEntries.length > 3 ? 'increasing'
      : recentEntries.length > 0 ? 'stable' : 'decreasing';

    return {
      totalEntries,
      activeEntries,
      highPriorityEntries,
      averagePriority,
      lastUpdated: report.updatedAt,
      trendIndicator,
    };
  }

  // Auto-archive old reports
  async autoArchiveOldReports (): Promise<void> {
    const reports = Array.from(this.reports.values()).filter(r => r.isActive);
    let archivedCount = 0;

    for (const report of reports) {
      if (BusinessRulesService.shouldAutoArchive(report)) {
        report.status = ReportStatus.ARCHIVED;
        report.updatedAt = new Date();
        this.reports.set(report.id, report);
        archivedCount++;
      }
    }

    if (archivedCount > 0) {
      logInfo('Auto-archived old reports', {archivedCount});
    }
  }

  // Get storage statistics
  async getStorageStats (): Promise<{
    totalUsers: number;
    totalReports: number;
    totalAttachments: number;
    totalStorageUsed: number;
  }> {
    const totalUsers = this.users.size;
    const totalReports = Array.from(this.reports.values()).filter(r => r.isActive).length;
    const totalAttachments = Array.from(this.attachments.values()).filter(a => a.isActive).length;
    const totalStorageUsed = Array.from(this.users.values()).reduce((sum, user) => sum + user.storageUsed, 0);

    return {
      totalUsers,
      totalReports,
      totalAttachments,
      totalStorageUsed,
    };
  }
}

// Export singleton instance
export const dataStore = new InMemoryStore();
