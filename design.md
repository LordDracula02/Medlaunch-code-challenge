# Backend API Design Documentation

## Overview

This document outlines the design decisions, architecture, and implementation details for the Reports Management System backend API. The system is built with Node.js, TypeScript, and Express.js, following production-quality standards with comprehensive business rules and security measures.

## Schema and Data Model

### Core Entities

#### User
```typescript
interface User {
  id: string;                    // UUID primary key
  email: string;                 // Unique email address
  name: string;                  // Display name
  role: UserRole;                // READER, EDITOR, ADMIN
  tier: UserTier;                // DEFAULT, PREMIUM
  password: string;              // bcrypt hashed
  storageUsed: number;           // Current storage usage in bytes
  createdAt: Date;
  updatedAt: Date;
}
```

#### Report
```typescript
interface Report {
  id: string;                    // UUID primary key
  title: string;                 // Report title
  description: string;           // Report description
  status: ReportStatus;          // DRAFT, ACTIVE, ARCHIVED, DELETED
  priority: ReportPriority;      // LOW, MEDIUM, HIGH, CRITICAL
  createdBy: string;             // User ID of creator
  createdAt: Date;
  updatedAt: Date;
  lastModifiedBy: string;        // User ID of last modifier
  lastModifiedAt: Date;
  collaborators: string[];       // Array of user IDs
  concurrentEditors: string[];   // Currently editing user IDs
  entries: ReportEntry[];        // Nested entries collection
  comments: ReportComment[];     // Nested comments collection
  tags: string[];                // Array of tags
  metadata: Record<string, any>; // Flexible metadata object
  version: number;               // Optimistic concurrency control
  isActive: boolean;             // Soft delete flag
}
```

#### ReportEntry
```typescript
interface ReportEntry {
  id: string;                    // UUID
  title: string;                 // Entry title
  content: string;               // Entry content
  priority: ReportPriority;      // Entry priority
  status: ReportStatus;          // Entry status
  createdBy: string;             // User ID
  createdAt: Date;
  updatedAt: Date;
  tags: string[];                // Entry-specific tags
  metadata: Record<string, any>; // Entry metadata
}
```

#### Attachment
```typescript
interface Attachment {
  id: string;                    // UUID primary key
  reportId: string;              // Foreign key to report
  filename: string;              // Stored filename
  originalName: string;          // Original filename
  mimeType: string;              // File MIME type
  size: number;                  // File size in bytes
  uploadedBy: string;            // User ID
  uploadedAt: Date;
  storagePath: string;           // File system path
  downloadUrl?: string;          // Optional signed URL
  expiresAt?: Date;              // URL expiration
  isActive: boolean;             // Soft delete flag
}
```

### Data Storage Strategy

**In-Memory Storage**: For this implementation, we use in-memory storage with Map objects to simulate a NoSQL/document-oriented database. This approach:

- Provides fast access for development and testing
- Eliminates database setup complexity
- Demonstrates the data model and relationships
- Can be easily replaced with MongoDB, PostgreSQL, or other databases

**Persistence Considerations**: In production, this would be replaced with:
- MongoDB for document storage
- PostgreSQL with JSONB for hybrid approach
- Redis for caching and session management
- Cloud storage (AWS S3, Google Cloud Storage) for file attachments

## Authentication and Authorization Model

### JWT-Based Authentication

**Token Structure**:
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  iat: number;    // Issued at
  exp: number;    // Expiration
}
```

**Security Features**:
- 15-minute access token expiration
- 7-day refresh token expiration
- bcrypt password hashing (12 salt rounds)
- Strong password validation
- Token blacklisting capability (for logout)

### Role-Based Access Control

**Role Hierarchy**:
1. **READER**: Can only read reports and attachments
2. **EDITOR**: Can read, create, and update reports and attachments
3. **ADMIN**: Full access to all resources and operations

**Permission Matrix**:
| Action | READER | EDITOR | ADMIN |
|--------|--------|--------|-------|
| Read Reports | ✅ | ✅ | ✅ |
| Create Reports | ❌ | ✅ | ✅ |
| Update Reports | ❌ | ✅ | ✅ |
| Delete Reports | ❌ | ❌ | ✅ |
| Upload Attachments | ❌ | ✅ | ✅ |
| Manage Users | ❌ | ❌ | ✅ |

### Business Rule Integration

Authentication is tightly integrated with business rules:
- Storage quota enforcement during file uploads
- Report lifecycle management based on user roles
- Collaboration permissions for report editing
- Data retention policy enforcement

## Concurrency Control Approach

### Optimistic Concurrency Control

**Implementation**:
- Each report has a `version` field
- Clients must include the current version in update requests
- Server increments version on each update
- Conflicts are detected when version mismatch occurs

**Benefits**:
- No database locks required
- High performance for read-heavy workloads
- Natural conflict detection
- Works well with REST APIs

**Example Flow**:
1. Client reads report (version: 1)
2. Client modifies report locally
3. Client sends PUT request with version: 1
4. Server checks version, updates if match, increments to version: 2
5. If another client updated in between, conflict is detected

### Concurrent Editor Management

**Business Rule**: Maximum 3 concurrent editors per report

**Implementation**:
- `concurrentEditors` array tracks active editors
- Editors are added when update begins
- Editors are removed when update completes or times out
- Business rule validation prevents exceeding limit

## File Storage and Access Security

### Storage Architecture

**Local File System** (Current Implementation):
- Files stored in `./uploads` directory
- Unique filenames generated using UUID
- Original filenames preserved in database
- File paths stored in database for retrieval

**Production Considerations**:
- Cloud storage (AWS S3, Google Cloud Storage)
- CDN integration for global access
- File encryption at rest
- Virus/malware scanning integration
- Automatic file lifecycle management

### Security Measures

**File Upload Validation**:
- File type validation (MIME type checking)
- File size limits (10MB default)
- Filename sanitization
- Storage quota enforcement per user

**Access Control**:
- Files tied to specific reports
- User must have access to report to download attachment
- Signed URLs with expiration (optional)
- Audit logging for all file operations

**Malware Protection** (Production Enhancement):
```typescript
// Example integration with virus scanning service
async function scanFileForMalware(filePath: string): Promise<boolean> {
  // Integration with ClamAV, AWS GuardDuty, or similar
  const scanResult = await virusScanner.scan(filePath);
  return scanResult.isClean;
}
```

## Asynchronous Side Effect Strategy

### Implementation Approach

**Immediate Side Effects**:
- Audit logging for all operations
- User storage usage updates
- Business rule validation

**Deferred Side Effects**:
- Notification sending to collaborators
- Cache invalidation
- Search index updates
- Analytics event tracking

### Error Handling and Retry Logic

**Strategy**: Fail-fast with graceful degradation

**Implementation**:
```typescript
// Side effects don't block main operation
setImmediate(async () => {
  try {
    await triggerAsyncSideEffect(report, user);
  } catch (error) {
    // Log error but don't fail the request
    logRequestError(req, 'Async side effect failed', error);
  }
});
```

**Production Enhancements**:
- Message queue integration (RabbitMQ, AWS SQS)
- Dead letter queues for failed operations
- Exponential backoff retry logic
- Circuit breaker pattern for external services

### Side Effect Examples

**Report Creation**:
1. Send notification to collaborators
2. Update search index
3. Trigger analytics event
4. Invalidate related caches

**Report Update**:
1. Send change notification
2. Update last modified timestamp
3. Trigger workflow automation
4. Update audit trail

## Code Quality Practices

### TypeScript Configuration

**Strict Mode Enabled**:
- `noImplicitAny`: Prevents implicit any types
- `strictNullChecks`: Null safety enforcement
- `noUnusedLocals`: Unused variable detection
- `exactOptionalPropertyTypes`: Precise optional types

**Benefits**:
- Compile-time error detection
- Better IDE support and autocomplete
- Self-documenting code
- Reduced runtime errors

### Linting and Static Analysis

**ESLint Configuration**:
- TypeScript-specific rules
- Consistent code style enforcement
- Security best practices
- Performance optimization hints

**Pre-commit Hooks**:
- Automatic linting on commit
- Type checking validation
- Test suite execution
- Code formatting with Prettier

### Testing Philosophy

**Testing Strategy**:
- Unit tests for business logic
- Integration tests for API endpoints
- End-to-end tests for critical workflows
- Performance tests for scalability validation

**Test Coverage Goals**:
- 90%+ code coverage
- 100% business rule coverage
- All API endpoints tested
- Error scenarios validated

### Error Handling

**Structured Error Responses**:
```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
  pagination?: PaginationInfo;
}
```

**Error Categories**:
- Validation errors (400): Invalid input data
- Authentication errors (401): Missing or invalid credentials
- Authorization errors (403): Insufficient permissions
- Not found errors (404): Resource doesn't exist
- Conflict errors (409): Optimistic concurrency conflicts
- Server errors (500): Internal system errors

## Scaling and Observability Considerations

### Horizontal Scaling Strategy

**Stateless Design**:
- No server-side session storage
- JWT tokens for authentication
- In-memory storage can be replaced with distributed databases
- File storage abstraction allows cloud migration

**Load Balancing**:
- Multiple server instances behind load balancer
- Session affinity not required
- Health check endpoints for load balancer integration

### Performance Optimization

**Database Optimization**:
- Indexes on frequently queried fields
- Pagination for large result sets
- Selective field inclusion via query parameters
- Caching for frequently accessed data

**API Optimization**:
- Response compression (gzip)
- Conditional requests (ETags)
- Partial response support
- Batch operations for multiple resources

### Monitoring and Observability

**Structured Logging**:
- Winston logger with JSON format
- Correlation IDs for request tracking
- Log levels (error, warn, info, debug)
- Performance metrics logging

**Metrics Collection**:
- Request/response times
- Error rates by endpoint
- Business rule evaluation metrics
- Storage usage statistics

**Health Checks**:
- Application health endpoint
- Database connectivity checks
- External service dependencies
- Custom business logic health indicators

### Production Deployment

**Containerization**:
- Docker containerization
- Multi-stage builds for optimization
- Environment-specific configurations
- Health check integration

**Infrastructure**:
- Kubernetes orchestration
- Auto-scaling based on metrics
- Blue-green deployments
- Rolling updates with zero downtime

## Security Considerations

### Input Validation and Sanitization

**Validation Layers**:
1. **Client-side**: Immediate user feedback
2. **API-level**: express-validator middleware
3. **Business logic**: Custom validation rules
4. **Database**: Schema constraints (when applicable)

**Sanitization**:
- HTML entity encoding
- SQL injection prevention
- XSS protection
- File upload validation

### Security Headers

**Helmet.js Configuration**:
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)

### Rate Limiting

**Implementation**:
- 100 requests per 15 minutes per IP
- Configurable limits per endpoint
- User-based rate limiting (future enhancement)
- DDoS protection integration

## Future Enhancements

### Planned Improvements

1. **Database Integration**: Replace in-memory storage with MongoDB/PostgreSQL
2. **Real-time Features**: WebSocket integration for live collaboration
3. **Advanced Search**: Full-text search with Elasticsearch
4. **Workflow Automation**: Business process automation
5. **API Versioning**: Semantic versioning for API evolution
6. **GraphQL Support**: Alternative to REST API
7. **Microservices**: Service decomposition for scalability

### Production Readiness Checklist

- [ ] Database migration scripts
- [ ] Backup and recovery procedures
- [ ] Monitoring and alerting setup
- [ ] CI/CD pipeline configuration
- [ ] Security audit and penetration testing
- [ ] Performance testing and optimization
- [ ] Documentation and runbooks
- [ ] Disaster recovery plan

## Conclusion

This backend API demonstrates production-quality development practices with comprehensive business rules, security measures, and scalability considerations. The modular architecture allows for easy extension and maintenance, while the strict TypeScript configuration ensures code quality and reliability.

The implementation successfully addresses all requirements from the original challenge while providing a solid foundation for future enhancements and production deployment. 