import {
  BusinessRuleContext,
  BusinessRuleResult,
  UserRole,
  ReportStatus,

  User,
  Report,
} from '../types';
import {config, getUserQuota} from '../config';
import {logBusinessRule} from '../utils/logger';

export class BusinessRulesService {



  /**
   * Rule 1: Report Lifecycle Management
   * Reports in 'ARCHIVED' status cannot be edited by anyone except ADMIN users
   */
  static checkReportLifecycleManagement (context: BusinessRuleContext): BusinessRuleResult {
    const {user, report, action} = context;

    if (action === 'update' && report.status === ReportStatus.ARCHIVED) {
      const allowed = user.role === UserRole.ADMIN;

      logBusinessRule('Report Lifecycle Management', context, {allowed});

              return {
          allowed,
          reason: allowed ? '' : 'Only ADMIN users can edit archived reports',
          constraints: {
            requiredRole: UserRole.ADMIN,
            currentStatus: report.status,
          },
        };
    }

    return {allowed: true};
  }

  /**
   * Rule 2: Attachment Quota System
   * Users can only upload attachments if their total storage usage is under quota
   */
  static checkAttachmentQuota (context: BusinessRuleContext): BusinessRuleResult {
    const {user, action, resource} = context;

    if (action === 'upload' && resource?.fileSize) {
      const userQuota = getUserQuota(user.tier);
      const newTotalUsage = user.storageUsed + resource.fileSize;
      const allowed = newTotalUsage <= userQuota;

      logBusinessRule('Attachment Quota System', context, {
        allowed,
        currentUsage: user.storageUsed,
        newUsage: newTotalUsage,
        quota: userQuota,
      });

              return {
          allowed,
          reason: allowed ? '' : `Storage quota exceeded. Current: ${user.storageUsed}, Quota: ${userQuota}`,
          constraints: {
            currentUsage: user.storageUsed,
            fileSize: resource.fileSize,
            quota: userQuota,
            tier: user.tier,
          },
        };
    }

    return {allowed: true};
  }

  /**
   * Rule 3: Report Collaboration Rules
   * Reports can only be edited by the creator or assigned collaborators, with a maximum of 3 concurrent editors
   */
  static checkReportCollaboration (context: BusinessRuleContext): BusinessRuleResult {
    const {user, report, action} = context;

    if (action === 'update') {
      // Check if user is creator or collaborator
      const isCreator = report.createdBy === user.id;
      const isCollaborator = report.collaborators.includes(user.id);
      const isAdmin = user.role === UserRole.ADMIN;

      if (!isCreator && !isCollaborator && !isAdmin) {
        logBusinessRule('Report Collaboration Rules', context, {
          allowed: false,
          reason: 'User is not creator, collaborator, or admin',
        });

        return {
          allowed: false,
          reason: 'Only the creator, assigned collaborators, or admins can edit this report',
          constraints: {
            creator: report.createdBy,
            collaborators: report.collaborators,
            userRole: user.role,
          },
        };
      }

      // Check concurrent editors limit
      const isCurrentlyEditing = report.concurrentEditors.includes(user.id);
      const wouldExceedLimit = !isCurrentlyEditing &&
        report.concurrentEditors.length >= config.businessRules.maxConcurrentEditors;

      if (wouldExceedLimit) {
        logBusinessRule('Report Collaboration Rules', context, {
          allowed: false,
          reason: 'Concurrent editors limit exceeded',
        });

        return {
          allowed: false,
          reason: `Maximum of ${config.businessRules.maxConcurrentEditors} concurrent editors allowed`,
          constraints: {
            currentEditors: report.concurrentEditors.length,
            maxEditors: config.businessRules.maxConcurrentEditors,
          },
        };
      }

      logBusinessRule('Report Collaboration Rules', context, {allowed: true});
      return {allowed: true};
    }

    return {allowed: true};
  }

  /**
   * Rule 4: Data Retention Policy
   * Reports older than 2 years are automatically marked as 'ARCHIVED' and become read-only for non-admin users
   */
  static checkDataRetentionPolicy (context: BusinessRuleContext): BusinessRuleResult {
    const {user, report, action} = context;

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const isOldReport = report.createdAt < twoYearsAgo;
    const isAdmin = user.role === UserRole.ADMIN;

    if (isOldReport && action === 'update' && !isAdmin) {
      logBusinessRule('Data Retention Policy', context, {
        allowed: false,
        reason: 'Old report, read-only for non-admin users',
      });

      return {
        allowed: false,
        reason: 'Reports older than 2 years are read-only for non-admin users',
        constraints: {
          reportAge: Math.floor((Date.now() - report.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          maxAge: config.businessRules.autoArchiveDays,
          userRole: user.role,
        },
      };
    }

    return {allowed: true};
  }

  /**
   * General Edit Permissions
   * Only EDITORs and ADMINs can edit reports (checked last after specific rules)
   */
  static checkGeneralEditPermissions (context: BusinessRuleContext): BusinessRuleResult {
    const {user, action} = context;

    if (action === 'update') {
      const allowed = user.role === UserRole.EDITOR || user.role === UserRole.ADMIN;

      if (!allowed) {
        logBusinessRule('General Edit Permissions', context, {allowed});
        
        return {
          allowed: false,
          reason: 'Insufficient permissions. Minimum role required: editor',
          constraints: {
            requiredRole: UserRole.EDITOR,
            userRole: user.role,
          },
        };
      }
    }

    return {allowed: true};
  }

  /**
   * Apply all business rules for a given context
   */
  static evaluateAllRules (context: BusinessRuleContext): BusinessRuleResult {
    const rules = [
      this.checkReportLifecycleManagement,
      this.checkAttachmentQuota,
      this.checkReportCollaboration,
      this.checkDataRetentionPolicy,
      this.checkGeneralEditPermissions, // Check general permissions last
    ];

    for (const rule of rules) {
      const result = rule.call(this, context);
      if (!result.allowed) {
        return result;
      }
    }

    return {allowed: true};
  }

  /**
   * Check if a report should be automatically archived based on age
   */
  static shouldAutoArchive (report: Report): boolean {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.businessRules.autoArchiveDays);

    return report.createdAt < cutoffDate && report.status !== ReportStatus.ARCHIVED;
  }

  /**
   * Get user's current storage usage percentage
   */
  static getStorageUsagePercentage (user: User): number {
    const quota = getUserQuota(user.tier);
    return (user.storageUsed / quota) * 100;
  }

  /**
   * Check if user can add more collaborators to a report
   */
  static canAddCollaborator (report: Report, newCollaboratorId: string): BusinessRuleResult {
    const isAlreadyCollaborator = report.collaborators.includes(newCollaboratorId);
    const isCreator = report.createdBy === newCollaboratorId;

    if (isAlreadyCollaborator || isCreator) {
      return {
        allowed: false,
        reason: 'User is already a collaborator or creator',
      };
    }

    // Limit collaborators to prevent abuse (optional rule)
    const maxCollaborators = 10;
    if (report.collaborators.length >= maxCollaborators) {
      return {
        allowed: false,
        reason: `Maximum of ${maxCollaborators} collaborators allowed`,
        constraints: {
          currentCollaborators: report.collaborators.length,
          maxCollaborators,
        },
      };
    }

    return {allowed: true};
  }
}
