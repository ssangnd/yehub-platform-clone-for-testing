export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'admin@sociallistening.com',
  password: process.env.TEST_USER_PASSWORD || 'password123',
};

export const API_URL = process.env.API_URL || 'http://localhost:3000/v1';

export const SMTP4DEV_URL = process.env.SMTP4DEV_URL || 'http://localhost:5555';
