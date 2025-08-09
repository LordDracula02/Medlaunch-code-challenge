import {Router} from 'express';
import {param} from 'express-validator';
import multer from 'multer';
import path from 'path';
import {v4 as uuidv4} from 'uuid';
import {ReportsController} from '../controllers/reports';
import {config, getUploadPath} from '../config';
import {requireMinRole} from '../middleware/auth';
import {UserRole} from '../types';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = getUploadPath();
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter function
const fileFilter = (_req: any, file: any, cb: multer.FileFilterCallback) => {
  // Check file type
  if (!config.fileUpload.allowedTypes.includes(file.mimetype)) {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
    return;
  }

  // Note: file.size is not available in fileFilter, size limits are handled by multer limits
  cb(null, true);
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.fileUpload.maxSize,
    files: 1, // Only allow one file per request
  },
});

/**
 * POST /api/reports/:id/attachment
 * Upload file attachment to report
 */
router.post('/:id/attachment', [
  requireMinRole(UserRole.EDITOR),
  param('id').isUUID().withMessage('Invalid report ID'),
  upload.single('file'),
], ReportsController.uploadAttachment);

/**
 * GET /api/reports/:id/attachments/:attachmentId/download
 * Download file attachment
 */
router.get('/:id/attachments/:attachmentId/download', [
  requireMinRole(UserRole.READER),
  param('id').isUUID().withMessage('Invalid report ID'),
  param('attachmentId').isUUID().withMessage('Invalid attachment ID'),
], ReportsController.downloadAttachment);

/**
 * POST /api/reports/:id/attachments/:attachmentId/signed-url
 * Generate signed URL for file download
 */
router.post('/:id/attachments/:attachmentId/signed-url', [
  requireMinRole(UserRole.READER),
  param('id').isUUID().withMessage('Invalid report ID'),
  param('attachmentId').isUUID().withMessage('Invalid attachment ID'),
], ReportsController.generateSignedUrl);

export default router;
