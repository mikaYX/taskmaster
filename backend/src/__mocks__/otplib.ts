export const authenticator = {
  generateSecret: jest.fn(() => 'MOCK_SECRET'),
  keyuri: jest.fn(() => 'otpauth://totp/Mock'),
  verify: jest.fn(() => true),
};
