import request from 'supertest';
import app from '../src/app';
import { expectSuccess, expectError } from './helpers/testUtils';

describe('Authentication Endpoints', () => {
  
  describe('POST /api/auth/register', () => {
    
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@test.com',
        name: 'New User',
        password: 'SecurePass123!@#',
        role: 'editor',
        tier: 'default',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectSuccess(response, 201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.name).toBe(userData.name);
      expect(response.body.data.user.role).toBe(userData.role);
      expect(response.body.data.user.tier).toBe(userData.tier);
      expect(response.body.data.user.password).toBeUndefined(); // Password should not be returned
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'SecurePass123!@#',
        role: 'editor',
        tier: 'default',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectError(response, 422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('valid email'),
          }),
        ])
      );
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'weak',
        role: 'editor',
        tier: 'default',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectError(response, 422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: expect.stringContaining('8 characters'),
          }),
        ])
      );
    });

    it('should reject registration with invalid role', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass123!@#',
        role: 'invalid_role',
        tier: 'default',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expectError(response, 422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'role',
            message: expect.stringContaining('Invalid role'),
          }),
        ])
      );
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        email: 'duplicate@test.com',
        name: 'First User',
        password: 'SecurePass123!@#',
        role: 'editor',
        tier: 'default',
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Second registration with same email should fail
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, name: 'Second User' });

      expectError(response, 409);
      expect(response.body.message).toContain('already exists');
    });

    it('should reject registration with missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          // Missing name, password, role, tier
        });

      expectError(response, 422);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    let testUserEmail: string;
    
    beforeEach(async () => {
      // Register a user for login tests
      testUserEmail = `logintest-${Date.now()}-${Math.random().toString(36).substring(2, 15)}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUserEmail,
          name: 'Login Test User',
          password: 'LoginPass123!@#',
          role: 'editor',
          tier: 'default',
        });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'LoginPass123!@#',
        });

      expectSuccess(response, 200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.user.email).toBe(testUserEmail);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'LoginPass123!@#',
        });

      expectError(response, 401);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'WrongPassword123!@#',
        });

      expectError(response, 401);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login with malformed email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'LoginPass123!@#',
        });

      expectError(response, 422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('valid email'),
          }),
        ])
      );
    });

    it('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expectError(response, 422);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/auth/me', () => {
    let userToken: string;
    let testUserEmail: string;

    beforeEach(async () => {
      // Register and login a user
      testUserEmail = `metest-${Date.now()}-${Math.random().toString(36).substring(2, 15)}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUserEmail,
          name: 'Me Test User',
          password: 'MePass123!@#',
          role: 'editor',
          tier: 'premium',
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'MePass123!@#',
        });

      userToken = loginResponse.body.data.accessToken;
    });

    it('should return current user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expectSuccess(response, 200);
      expect(response.body.data.user.email).toBe(testUserEmail);
      expect(response.body.data.user.name).toBe('Me Test User');
      expect(response.body.data.user.role).toBe('editor');
      expect(response.body.data.user.tier).toBe('premium');
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expectError(response, 401);
      expect(response.body.message).toContain('Access token required');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expectError(response, 401);
      expect(response.body.message).toContain('Invalid or expired token');
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');

      expectError(response, 401);
      expect(response.body.message).toContain('Access token required');
    });
  });

  describe('JWT Token Validation', () => {
    
    it('should generate tokens with proper expiration', async () => {
      // Register and login
      const tokenTestEmail = `tokentest-${Date.now()}-${Math.random().toString(36).substring(2, 15)}@example.com`;
      await request(app)
        .post('/api/auth/register')
        .send({
          email: tokenTestEmail,
          name: 'Token Test',
          password: 'TokenPass123!@#',
          role: 'editor',
          tier: 'default',
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: tokenTestEmail,
          password: 'TokenPass123!@#',
        });

      expectSuccess(loginResponse, 200);
      
      const { accessToken, refreshToken } = loginResponse.body.data;
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      expect(accessToken.split('.').length).toBe(3); // JWT has 3 parts
      expect(refreshToken.split('.').length).toBe(3);
    });
  });
});
