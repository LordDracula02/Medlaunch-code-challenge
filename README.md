# Backend API - Reports Management System

A production-quality Node.js backend API built with TypeScript and Express.js for managing reports with complex business rules, authentication, and file upload capabilities.

## 🚀 Features

- **Four Core Endpoints**: GET, PUT, POST for reports, and file upload
- **Complex Data Formatting**: Nested collections, computed metrics, multiple views
- **Business Rules Engine**: Custom business logic for lifecycle management, quotas, collaboration
- **Authentication & Authorization**: JWT-based with role-based access control
- **File Upload**: Secure file handling with validation and storage quotas
- **Audit Logging**: Comprehensive audit trail for all operations
- **Production Ready**: Security headers, rate limiting, error handling, logging

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Authentication**: JWT with bcrypt
- **Validation**: express-validator
- **File Upload**: Multer
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd backend-api
npm install
```

### 2. Environment Setup

Copy the environment example file and configure it:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# File Upload Configuration
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf,text/plain
UPLOAD_PATH=./uploads
SIGNED_URL_EXPIRY=3600

# Storage Quotas (in bytes)
DEFAULT_USER_QUOTA=104857600
PREMIUM_USER_QUOTA=524288000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Run the Application

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

## 🔐 Authentication

### User Registration

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "SecurePass123!",
    "role": "editor",
    "tier": "default"
  }'
```

### User Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### Using Authentication

Include the JWT token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/reports/report-id
```

## 📚 API Endpoints

### 1. GET /api/reports/:id

Retrieve a report with complex formatting and optional views.

**Parameters:**
- `include`: Array of fields to include (`entries`, `comments`, `metrics`, `attachments`)
- `view`: View mode (`default` or `summary`)
- `page`: Page number for pagination
- `size`: Page size for pagination
- `sort`: Sort field (`priority` or `createdAt`)

**Example:**
```bash
# Get full report
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/reports/report-id"

# Get summary view with metrics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/reports/report-id?view=summary&include=metrics"

# Get entries with pagination
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/reports/report-id?include=entries&page=1&size=10&sort=priority"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report-id",
    "title": "Q1 Financial Report",
    "description": "Comprehensive financial analysis",
    "status": "active",
    "priority": "high",
    "metrics": {
      "totalEntries": 5,
      "activeEntries": 4,
      "highPriorityEntries": 2,
      "averagePriority": 2.4,
      "trendIndicator": "increasing"
    },
    "entries": [...],
    "comments": [...],
    "tags": ["finance", "quarterly"],
    "version": 1
  },
  "pagination": {
    "page": 1,
    "size": 10,
    "total": 5,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 2. PUT /api/reports/:id

Update a report with idempotency and optimistic concurrency control.

**Example:**
```bash
curl -X PUT http://localhost:3000/api/reports/report-id \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Q1 Financial Report",
    "status": "active",
    "priority": "critical",
    "tags": ["finance", "quarterly", "updated"],
    "version": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Report updated successfully",
  "data": {
    "report": {
      "id": "report-id",
      "title": "Updated Q1 Financial Report",
      "status": "active",
      "priority": "critical",
      "version": 2,
      "updatedAt": "2024-01-20T10:30:00Z"
    }
  }
}
```

### 3. POST /api/reports

Create a new report with async side effects.

**Example:**
```bash
curl -X POST http://localhost:3000/api/reports \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Marketing Report",
    "description": "Marketing performance analysis for Q1",
    "priority": "medium",
    "tags": ["marketing", "analysis"],
    "collaborators": ["user-2", "user-3"],
    "metadata": {
      "department": "marketing",
      "quarter": 1
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Report created successfully",
  "data": {
    "report": {
      "id": "new-report-id",
      "title": "New Marketing Report",
      "status": "draft",
      "priority": "medium",
      "createdAt": "2024-01-20T10:30:00Z"
    }
  }
}
```

### 4. POST /api/reports/:id/attachment

Upload a file attachment to a report.

**Example:**
```bash
curl -X POST http://localhost:3000/api/reports/report-id/attachment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/document.pdf"
```

**Response:**
```json
{
  "success": true,
  "message": "Attachment uploaded successfully",
  "data": {
    "attachment": {
      "id": "attachment-id",
      "filename": "unique-filename.pdf",
      "originalName": "document.pdf",
      "mimeType": "application/pdf",
      "size": 1024000,
      "uploadedAt": "2024-01-20T10:30:00Z"
    }
  }
}
```

## 🏗️ Custom Business Rules

The system implements four custom business rules:

### 1. Report Lifecycle Management
- **Rule**: Reports in 'ARCHIVED' status cannot be edited by anyone except ADMIN users
- **Impact**: Affects PUT endpoint validation and authorization logic

### 2. Attachment Quota System
- **Rule**: Users can only upload attachments if their total storage usage is under quota (100MB for default users, 500MB for premium users)
- **Impact**: Affects file upload validation and user role permissions

### 3. Report Collaboration Rules
- **Rule**: Reports can only be edited by the creator or assigned collaborators, with a maximum of 3 concurrent editors
- **Impact**: Affects concurrency control and authorization

### 4. Data Retention Policy
- **Rule**: Reports older than 2 years are automatically marked as 'ARCHIVED' and become read-only for non-admin users
- **Impact**: Affects GET endpoint filtering and business logic

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Type checking
npm run type-check
```

## 📊 Sample Data

The application comes with pre-loaded sample data:

**Users:**
- `admin@example.com` - Admin user (Premium tier)
- `editor@example.com` - Editor user (Default tier, 50MB used)
- `reader@example.com` - Reader user (Default tier, 10MB used)

**Reports:**
- Q1 Financial Report (Active, with entries and comments)
- Old Archived Report (2+ years old, archived)

## 🔧 Development

### Project Structure

```
src/
├── config/          # Configuration management
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── routes/          # Route definitions
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── app.ts           # Express application setup
└── server.ts        # Server entry point
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## 🚀 Production Deployment

1. Set `NODE_ENV=production`
2. Configure a strong `JWT_SECRET`
3. Set up proper CORS origins
4. Configure file storage (consider cloud storage)
5. Set up monitoring and logging
6. Use a process manager like PM2

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For questions or issues, please open an issue on the repository. 