// Configure test environment
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-only';
process.env['JWT_EXPIRES_IN'] = '1h';

// Set test timeouts
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Any global setup needed before all tests
});

afterAll(async () => {
  // Any global cleanup needed after all tests
});

// Reset modules between test files to avoid interference
beforeEach(() => {
  jest.clearAllMocks();
});

export {};
