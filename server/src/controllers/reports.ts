import {Request, Response} from 'express';
import {validationResult} from 'express-validator';
import {
  Report,
  ReportStatus,

  CreateReportRequest,
  UpdateReportRequest,
  GetReportQuery,
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
  BusinessRuleContext,
  ApiResponse,
  PaginationInfo,
} from '../types';
import {dataStore} from '../services/dataStore';
import {BusinessRulesService} from '../services/businessRules';

import {logInfo, logRequest, logRequestError} from '../utils/logger';

export class ReportsController {

  /**
   * GET /api/reports
   * List all reports with filtering, pagination, and sorting
   */
  static async listReports (req: Request, res: Response): Promise<Response> {
    try {
      // Validate parameters
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const queryParams = req.query as any;
      const user = req.user!;

      // Build filters
      const filters: any = {};
      if (queryParams.status) filters.status = queryParams.status;
      if (queryParams.priority) filters.priority = queryParams.priority;
      if (queryParams.createdBy) filters.createdBy = queryParams.createdBy;
      if (queryParams.tags) filters.tags = Array.isArray(queryParams.tags) ? queryParams.tags : [queryParams.tags];

      // Get reports from data store
      let reports = await dataStore.listReports(filters);

      // Apply business rules for read access
      reports = reports.filter(report => {
        const businessContext: BusinessRuleContext = {
          user,
          report,
          action: 'read',
        };
        const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
        return businessRuleResult.allowed;
      });

      // Apply sorting
      if (queryParams.sortBy) {
        const sortBy = queryParams.sortBy;
        const sortOrder = queryParams.sortOrder === 'desc' ? -1 : 1;
        
        reports.sort((a, b) => {
          let aValue: any, bValue: any;
          
          switch (sortBy) {
            case 'createdAt':
              aValue = a.createdAt.getTime();
              bValue = b.createdAt.getTime();
              break;
            case 'updatedAt':
              aValue = a.updatedAt.getTime();
              bValue = b.updatedAt.getTime();
              break;
            case 'title':
              aValue = a.title.toLowerCase();
              bValue = b.title.toLowerCase();
              break;
            case 'priority':
              const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
              aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
              bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
              break;
            default:
              return 0;
          }
          
          return (aValue < bValue ? -1 : aValue > bValue ? 1 : 0) * sortOrder;
        });
      }

      // Apply pagination
      let pagination: PaginationInfo | undefined;
      if (queryParams.page && queryParams.limit) {
        const page = parseInt(queryParams.page as unknown as string);
        const limit = parseInt(queryParams.limit as unknown as string);
        const total = reports.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const end = start + limit;
        
        reports = reports.slice(start, end);
        
        pagination = {
          page,
          size: limit,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        };
      }

      // Build response
      const response: ApiResponse<Report[]> = {
        success: true,
        message: 'Reports retrieved successfully',
        data: reports,
        ...(pagination && {pagination}),
      };

      logRequest(req, 'Reports listed successfully', {count: reports.length, userId: user.id});
      return res.status(200).json(response);
    } catch (error) {
      logRequestError(req, 'Failed to list reports', error as Error);
      
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve reports',
        errors: [{field: 'general', message: 'Internal server error'}],
      });
    }
  }

  /**
   * GET /api/reports/:id
   * Get report with complex formatting, computed metrics, and optional views
   */
  static async getReport (req: Request, res: Response): Promise<void> {
    try {
      // Validate parameters
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const {id} = req.params;
      const queryParams: GetReportQuery = req.query as any;
      const user = req.user!;

      // Get report from data store
      const report = await dataStore.getReport(id!);
      if (!report) {
        throw new NotFoundError('Report');
      }

      // Check business rules for read access
      const businessContext: BusinessRuleContext = {
        user,
        report,
        action: 'read',
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Access denied');
      }

      // Determine what to include based on query parameters
      const include = queryParams.include
        ? (Array.isArray(queryParams.include) ? queryParams.include : [queryParams.include])
        : ['entries', 'comments', 'metrics'];

      // Build response data
      let responseData: any = {
        id: report.id,
        title: report.title,
        description: report.description,
        status: report.status,
        priority: report.priority,
        createdBy: report.createdBy,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        lastModifiedBy: report.lastModifiedBy,
        lastModifiedAt: report.lastModifiedAt,
        collaborators: report.collaborators,
        tags: report.tags,
        metadata: report.metadata,
        version: report.version,
      };

      // Add computed metrics if requested
      if (include.includes('metrics')) {
        const metrics = await dataStore.getReportMetrics(id!);
        responseData.metrics = metrics;
      }

      // Add entries if requested
      if (include.includes('entries')) {
        let entries = report.entries;

        // Apply pagination to entries
        if (queryParams.page && queryParams.size) {
          const page = parseInt(queryParams.page as unknown as string);
          const size = parseInt(queryParams.size as unknown as string);
          const start = (page - 1) * size;
          const end = start + size;
          entries = entries.slice(start, end);
        }

        // Apply sorting to entries
        if (queryParams.sort) {
          const sortField = queryParams.sort as string;
          entries.sort((a, b) => {
            if (sortField === 'priority') {
              const priorityOrder = {low: 1, medium: 2, high: 3, critical: 4};
              return priorityOrder[b.priority] - priorityOrder[a.priority];
            }
            if (sortField === 'createdAt') {
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0;
          });
        }

        responseData.entries = entries;
      }

      // Add comments if requested
      if (include.includes('comments')) {
        responseData.comments = report.comments;
      }

      // Add attachments if requested
      if (include.includes('attachments')) {
        const attachments = await dataStore.getAttachmentsByReport(id!);
        responseData.attachments = attachments;
      }

      // Handle different view modes
      if (queryParams.view === 'summary') {
        // Return compact summary view
        responseData = {
          id: report.id,
          title: report.title,
          status: report.status,
          priority: report.priority,
          summary: report.description.substring(0, 200) + (report.description.length > 200 ? '...' : ''),
          metrics: responseData.metrics,
          lastUpdated: report.updatedAt,
          tags: report.tags,
        };
      }

      // Build pagination info for entries
      let pagination: PaginationInfo | undefined;
      if (include.includes('entries') && queryParams.page && queryParams.size) {
        const page = parseInt(queryParams.page as unknown as string);
        const size = parseInt(queryParams.size as unknown as string);
        const total = report.entries.length;
        const totalPages = Math.ceil(total / size);

        pagination = {
          page,
          size,
          limit: size,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        };
      }

      logRequest(req, 'Report retrieved successfully', {reportId: id, view: queryParams.view});

      const response: ApiResponse = {
        success: true,
        data: responseData,
        ...(pagination && {pagination}),
      };

      res.status(200).json(response);
    } catch (error) {
      logRequestError(req, 'Failed to get report', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
          errors: [{field: 'id', message: error.message}],
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
          message: 'Failed to retrieve report',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * PUT /api/reports/:id
   * Update report with idempotency and optimistic concurrency control
   */
  static async updateReport (req: Request, res: Response): Promise<void> {
    try {
      // Validate parameters and body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const {id} = req.params;
      const updateData: UpdateReportRequest = req.body;
      const user = req.user!;

      // Get current report
      const currentReport = await dataStore.getReport(id!);
      if (!currentReport) {
        throw new NotFoundError('Report');
      }

      // Check business rules for update access
      const businessContext: BusinessRuleContext = {
        user,
        report: currentReport,
        action: 'update',
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Update not allowed');
      }

      // Store before state for audit
      const beforeState = {...currentReport};

      // Prepare update data with optimistic concurrency control
      const updates: Partial<Report> = {
        ...updateData,
        version: currentReport.version, // For optimistic concurrency control
      };

      // Update report
      const updatedReport = await dataStore.updateReport(id!, updates, user.id);

      // Log audit trail
      await dataStore.addAuditLog({
        userId: user.id,
        action: 'update',
        resourceType: 'report',
        resourceId: id!,
        beforeState,
        afterState: updatedReport,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      logRequest(req, 'Report updated successfully', {reportId: id, updatedBy: user.id});

      res.status(200).json({
        success: true,
        message: 'Report updated successfully',
        data: {
          report: {
            id: updatedReport.id,
            title: updatedReport.title,
            status: updatedReport.status,
            priority: updatedReport.priority,
            version: updatedReport.version,
            updatedAt: updatedReport.updatedAt,
            collaborators: updatedReport.collaborators,
            concurrentEditors: updatedReport.concurrentEditors,
          },
        },
      });
    } catch (error) {
      logRequestError(req, 'Failed to update report', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
          errors: [{field: 'id', message: error.message}],
        });
      } else if (error instanceof ConflictError) {
        res.status(409).json({
          success: false,
          message: error.message,
          errors: [{field: 'version', message: 'Report has been modified by another user'}],
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
          message: 'Failed to update report',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * POST /api/reports
   * Create new report with async side effects
   */
  static async createReport (req: Request, res: Response): Promise<void> {
    try {
      // Validate body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const createData: CreateReportRequest = req.body;
      const user = req.user!;

      // Check business rules for create access
      const businessContext: BusinessRuleContext = {
        user,
        report: {} as Report, // Empty report for creation
        action: 'create',
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Creation not allowed');
      }

      // Create report
      const report = await dataStore.createReport({
        title: createData.title,
        description: createData.description,
        status: ReportStatus.DRAFT,
        priority: createData.priority,
        createdBy: user.id,
        lastModifiedBy: user.id,
        lastModifiedAt: new Date(),
        collaborators: createData.collaborators || [],
        concurrentEditors: [],
        entries: [],
        comments: [],
        tags: createData.tags || [],
        metadata: createData.metadata || {},
      });

      // Log audit trail
      await dataStore.addAuditLog({
        userId: user.id,
        action: 'create',
        resourceType: 'report',
        resourceId: report.id,
        afterState: report,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      // Trigger async side effect with retry logic, circuit breaker, and dead letter queue
      // Enhanced with production-grade resilience patterns
      const {executeAsyncSideEffect} = require('../utils/retry');
      const correlationId = req.headers['x-correlation-id'] as string || (req as any).id || 'async-side-effect';
      
      setImmediate(async () => {
        await executeAsyncSideEffect(
          () => ReportsController.triggerAsyncSideEffect(report, user, correlationId),
          'report_creation_side_effect',
          { reportId: report.id, userId: user.id },
          correlationId,
          { maxRetries: 3, backoffMs: 1000, jitter: true }
        );
      });

      logRequest(req, 'Report created successfully', {reportId: report.id, createdBy: user.id});

      // Set Location header for HTTP 201 compliance
      res.setHeader('Location', `/api/reports/${report.id}`);
      res.status(201).json({
        success: true,
        message: 'Report created successfully',
        data: {
          report: {
            id: report.id,
            title: report.title,
            status: report.status,
            priority: report.priority,
            createdAt: report.createdAt,
          },
        },
      });
    } catch (error) {
      logRequestError(req, 'Failed to create report', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
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
          message: 'Failed to create report',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * POST /api/reports/:id/attachment
   * Upload file attachment to report
   */
  static async uploadAttachment (req: Request, res: Response): Promise<void> {
    try {
      // Validate parameters
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const {id} = req.params;
      const user = req.user!;
      const file = req.file;

      if (!file) {
        throw new ValidationError([{field: 'file', message: 'No file uploaded'}]);
      }

      // Get report
      const report = await dataStore.getReport(id!);
      if (!report) {
        throw new NotFoundError('Report');
      }

      // Check business rules for upload access
      const businessContext: BusinessRuleContext = {
        user,
        report,
        action: 'upload',
        resource: {fileSize: file.size},
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Upload not allowed');
      }

      // Create attachment record
      const attachment = await dataStore.createAttachment({
        reportId: id!,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: user.id,
        storagePath: file.path,
      });

      // Update user storage usage
      const currentUser = await dataStore.getUser(user.id);
      if (currentUser) {
        const newStorageUsed = currentUser.storageUsed + file.size;
        await dataStore.updateUserStorage(user.id, newStorageUsed);
      }

      // Log audit trail
      await dataStore.addAuditLog({
        userId: user.id,
        action: 'upload_attachment',
        resourceType: 'attachment',
        resourceId: attachment.id,
        afterState: attachment,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      logRequest(req, 'Attachment uploaded successfully', {
        attachmentId: attachment.id,
        reportId: id,
        uploadedBy: user.id,
      });

      // Set Location header for HTTP 201 compliance
      res.setHeader('Location', `/api/reports/${id}/attachments/${attachment.id}`);
      res.status(201).json({
        success: true,
        message: 'Attachment uploaded successfully',
        data: {
          attachment: {
            id: attachment.id,
            filename: attachment.filename,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            uploadedAt: attachment.uploadedAt,
          },
        },
      });
    } catch (error) {
      logRequestError(req, 'Failed to upload attachment', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
          errors: [{field: 'id', message: error.message}],
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
          message: 'Failed to upload attachment',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * GET /api/reports/:id/attachments/:attachmentId/download
   * Download file attachment
   */
  static async downloadAttachment (req: Request, res: Response): Promise<void> {
    try {
      // Validate parameters
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const {id: reportId, attachmentId} = req.params;
      const user = req.user!;

      // Get report to verify access
      const report = await dataStore.getReport(reportId!);
      if (!report) {
        throw new NotFoundError('Report');
      }

      // Check business rules for read access to report
      const businessContext: BusinessRuleContext = {
        user,
        report,
        action: 'read',
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Access denied');
      }

      // Get attachment
      const attachment = await dataStore.getAttachment(attachmentId!);
      if (!attachment || !attachment.isActive) {
        throw new NotFoundError('Attachment');
      }

      // Verify attachment belongs to this report
      if (attachment.reportId !== reportId) {
        throw new NotFoundError('Attachment');
      }

      // Log download activity
      await dataStore.addAuditLog({
        userId: user.id,
        action: 'download_attachment',
        resourceType: 'attachment',
        resourceId: attachmentId!,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      logRequest(req, 'Attachment download requested', {
        attachmentId: attachment.id,
        reportId,
        downloadedBy: user.id,
      });

      // Set appropriate headers for file download
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
      res.setHeader('Content-Length', attachment.size.toString());

      // Stream the file
      const fs = require('fs');
      const path = require('path');
      
      try {
        const filePath = path.resolve(attachment.storagePath);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          throw new NotFoundError('File not found on disk');
        }

        // Create read stream and pipe to response
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error: Error) => {
          logRequestError(req, 'File stream error', error);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error streaming file',
              errors: [{field: 'file', message: 'Unable to stream file'}],
            });
          }
        });

      } catch (fileError) {
        throw new NotFoundError('File not accessible');
      }

    } catch (error) {
      logRequestError(req, 'Failed to download attachment', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
          errors: [{field: 'attachment', message: error.message}],
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
          message: 'Failed to download attachment',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * POST /api/reports/:id/attachments/:attachmentId/signed-url
   * Generate signed URL for file download
   */
  static async generateSignedUrl (req: Request, res: Response): Promise<void> {
    try {
      // Validate parameters
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          errors.array().map(err => ({field: (err as any).path || 'unknown', message: err.msg})),
        );
      }

      const {id: reportId, attachmentId} = req.params;
      const user = req.user!;

      // Get report to verify access
      const report = await dataStore.getReport(reportId!);
      if (!report) {
        throw new NotFoundError('Report');
      }

      // Check business rules for read access
      const businessContext: BusinessRuleContext = {
        user,
        report,
        action: 'read',
      };

      const businessRuleResult = BusinessRulesService.evaluateAllRules(businessContext);
      if (!businessRuleResult.allowed) {
        throw new AuthorizationError(businessRuleResult.reason || 'Access denied');
      }

      // Get attachment
      const attachment = await dataStore.getAttachment(attachmentId!);
      if (!attachment || !attachment.isActive) {
        throw new NotFoundError('Attachment');
      }

      // Verify attachment belongs to this report
      if (attachment.reportId !== reportId) {
        throw new NotFoundError('Attachment');
      }

      // Generate signed URL (simplified implementation)
      const jwt = require('jsonwebtoken');
      const {config} = require('../config');
      
      const expiresAt = new Date(Date.now() + config.fileUpload.signedUrlExpiry * 1000);
      
      const signedToken = jwt.sign(
        {
          attachmentId: attachment.id,
          reportId,
          userId: user.id,
          exp: Math.floor(expiresAt.getTime() / 1000),
        },
        config.jwt.secret
      );

      const signedUrl = `${req.protocol}://${req.get('host')}/api/reports/${reportId}/attachments/${attachmentId}/download?token=${signedToken}`;

      // Update attachment with signed URL info
      await dataStore.updateAttachment(attachmentId!, {
        downloadUrl: signedUrl,
        expiresAt,
      });

      // Log signed URL generation
      await dataStore.addAuditLog({
        userId: user.id,
        action: 'generate_signed_url',
        resourceType: 'attachment',
        resourceId: attachmentId!,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
      });

      logRequest(req, 'Signed URL generated', {
        attachmentId: attachment.id,
        reportId,
        requestedBy: user.id,
        expiresAt,
      });

      res.status(201).json({
        success: true,
        message: 'Signed URL generated successfully',
        data: {
          signedUrl,
          expiresAt: expiresAt.toISOString(),
          validFor: `${config.fileUpload.signedUrlExpiry} seconds`,
        },
      });

    } catch (error) {
      logRequestError(req, 'Failed to generate signed URL', error as Error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors,
        });
      } else if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          message: error.message,
          errors: [{field: 'attachment', message: error.message}],
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
          message: 'Failed to generate signed URL',
          errors: [{field: 'general', message: 'Internal server error'}],
        });
      }
    }
  }

  /**
   * Simulate async side effect for report creation
   */
  private static async triggerAsyncSideEffect (report: Report, user: any, correlationId?: string): Promise<void> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    // Log the side effect using direct logger instead of logRequest
    logInfo('Async side effect triggered', {
      correlationId: correlationId || 'async-side-effect',
      reportId: report.id,
      userId: user.id,
      effect: 'notification_sent',
    });

    // In a real application, this would:
    // 1. Send notification to collaborators
    // 2. Invalidate cache
    // 3. Update search index
    // 4. Send analytics event
    // 5. Trigger workflow automation
  }
}
