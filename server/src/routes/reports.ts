import {Router} from 'express';
import {body, param, query} from 'express-validator';
import {ReportsController} from '../controllers/reports';
import {ReportStatus, ReportPriority, UserRole} from '../types';
import {requireMinRole} from '../middleware/auth';

const router = Router();

/**
 * GET /api/reports
 * List all reports with filtering, pagination, and sorting
 */
router.get('/', [
  query('status').optional().isIn(Object.values(ReportStatus)).withMessage('Invalid status'),
  query('priority').optional().isIn(Object.values(ReportPriority)).withMessage('Invalid priority'),
  query('createdBy').optional().isUUID().withMessage('Invalid user ID'),
  query('tags').optional().isArray().withMessage('Tags must be an array'),
  query('page').optional().isInt({min: 1}).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({min: 1, max: 100}).withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'priority']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
], ReportsController.listReports);

/**
 * GET /api/reports/:id
 * Get report with complex formatting and optional views
 */
router.get('/:id', [
  param('id').isUUID().withMessage('Invalid report ID'),
  query('include').optional().isArray().withMessage('Include must be an array'),
  query('view').optional().isIn(['default', 'summary']).withMessage('Invalid view mode'),
  query('page').optional().isInt({min: 1}).withMessage('Page must be a positive integer'),
  query('size').optional().isInt({min: 1, max: 100}).withMessage('Size must be between 1 and 100'),
  query('sort').optional().isIn(['priority', 'createdAt']).withMessage('Invalid sort field'),
], ReportsController.getReport);

/**
 * PUT /api/reports/:id
 * Update report with idempotency and optimistic concurrency control
 */
router.put('/:id', [
  requireMinRole(UserRole.EDITOR),
  param('id').isUUID().withMessage('Invalid report ID'),
  body('title').optional().trim().isLength({min: 1, max: 200}).withMessage('Title must be between 1 and 200 characters'),
  body('description').optional().trim().isLength({max: 2000}).withMessage('Description must be less than 2000 characters'),
  body('status').optional().isIn(Object.values(ReportStatus)).withMessage('Invalid status'),
  body('priority').optional().isIn(Object.values(ReportPriority)).withMessage('Invalid priority'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('tags.*').optional().isString().trim().isLength({min: 1, max: 50}).withMessage('Each tag must be between 1 and 50 characters'),
  body('collaborators').optional().isArray().withMessage('Collaborators must be an array'),
  body('collaborators.*').optional().isUUID().withMessage('Invalid collaborator ID'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  body('version').optional().isInt({min: 1}).withMessage('Version must be a positive integer'),
], ReportsController.updateReport);

/**
 * POST /api/reports
 * Create new report with async side effects
 */
router.post('/', [
  requireMinRole(UserRole.EDITOR),
  body('title').trim().isLength({min: 1, max: 200}).withMessage('Title must be between 1 and 200 characters'),
  body('description').trim().isLength({max: 2000}).withMessage('Description must be less than 2000 characters'),
  body('priority').isIn(Object.values(ReportPriority)).withMessage('Invalid priority'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('tags.*').optional().isString().trim().isLength({min: 1, max: 50}).withMessage('Each tag must be between 1 and 50 characters'),
  body('collaborators').optional().isArray().withMessage('Collaborators must be an array'),
  body('collaborators.*').optional().isUUID().withMessage('Invalid collaborator ID'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
], ReportsController.createReport);

export default router;
