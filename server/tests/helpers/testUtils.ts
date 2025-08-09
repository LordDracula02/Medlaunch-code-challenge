import request from 'supertest';
import app from '../../src/app';
import { UserRole, UserTier } from '../../src/types';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tier: UserTier;
  token?: string;
}

// Test user credentials for different roles
export const TEST_USERS = {
  admin: {
    email: 'admin@test.com',
    password: 'AdminPass123!@#',
    name: 'Test Admin',
    role: UserRole.ADMIN,
    tier: UserTier.PREMIUM,
  },
  editor: {
    email: 'editor@test.com',
    password: 'EditorPass123!@#',
    name: 'Test Editor',
    role: UserRole.EDITOR,
    tier: UserTier.DEFAULT,
  },
  premium_editor: {
    email: 'premium@test.com',
    password: 'PremiumPass123!@#',
    name: 'Premium Editor',
    role: UserRole.EDITOR,
    tier: UserTier.PREMIUM,
  },
  reader: {
    email: 'reader@test.com',
    password: 'ReaderPass123!@#',
    name: 'Test Reader',
    role: UserRole.READER,
    tier: UserTier.DEFAULT,
  },
};

/**
 * Generate unique email for tests to avoid conflicts
 */
export function generateUniqueEmail(base: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${base}-${timestamp}-${random}@test.com`;
}

/**
 * Register a test user and return their token
 */
export async function registerAndLoginUser(userType: keyof typeof TEST_USERS): Promise<TestUser> {
  const userData = TEST_USERS[userType];
  const uniqueEmail = generateUniqueEmail(userType);

  // Register user
  const registerResponse = await request(app)
    .post('/api/auth/register')
    .send({
      email: uniqueEmail,
      name: userData.name,
      password: userData.password,
      role: userData.role,
      tier: userData.tier,
    });

  if (registerResponse.status !== 201) {
    throw new Error(`Failed to register user: ${registerResponse.body.message}`);
  }

  // Login user
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      email: uniqueEmail,
      password: userData.password,
    });

  if (loginResponse.status !== 200) {
    throw new Error(`Failed to login user: ${loginResponse.body.message}`);
  }

  return {
    id: loginResponse.body.data.user.id,
    email: uniqueEmail,
    name: userData.name,
    role: userData.role,
    tier: userData.tier,
    token: loginResponse.body.data.accessToken,
  };
}

/**
 * Create a test report and return its ID
 */
export async function createTestReport(token: string, reportData?: any) {
  const defaultReportData = {
    title: 'Test Report',
    description: 'Test report description',
    priority: 'medium',
    tags: ['test'],
    collaborators: [],
    metadata: {
      department: 'testing',
      testType: 'automated',
    },
  };

  const response = await request(app)
    .post('/api/reports')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...defaultReportData, ...reportData });

  if (response.status !== 201) {
    throw new Error(`Failed to create test report: ${response.body.message}`);
  }

  return response.body.data.report;
}

/**
 * Create a test file buffer for upload testing
 */
export function createTestFile(_filename: string, sizeInBytes: number = 1024): Buffer {
  const content = 'A'.repeat(sizeInBytes);
  return Buffer.from(content);
}

/**
 * Wait for a specified amount of time (for async operations)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData() {
  // This would clean up any test data if needed
  // For in-memory store, this happens automatically between test runs
}

/**
 * Expect a successful API response
 */
export function expectSuccess(response: any, expectedStatus: number = 200) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toBeDefined();
}

/**
 * Expect an error API response
 */
export function expectError(response: any, expectedStatus: number, expectedMessage?: string) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body.success).toBe(false);
  expect(response.body.errors).toBeDefined();
  
  if (expectedMessage) {
    expect(response.body.message).toContain(expectedMessage);
  }
}
