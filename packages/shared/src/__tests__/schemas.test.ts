import { describe, expect, it } from 'vitest';
import { hasPermission, isPlanAtLeast, loginSchema, registerSchema } from '../index';

describe('registerSchema', () => {
  it('accepts a valid payload and normalises the email', () => {
    const result = registerSchema.parse({
      name: 'Jane',
      email: '  Jane@Example.COM ',
      password: 'Password123',
      companyName: 'Acme',
    });
    expect(result.email).toBe('jane@example.com');
  });

  it('rejects weak passwords', () => {
    const result = registerSchema.safeParse({
      name: 'Jane',
      email: 'jane@example.com',
      password: 'short',
      companyName: 'Acme',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('plans & roles', () => {
  it('orders plans', () => {
    expect(isPlanAtLeast('GROWTH', 'STARTER')).toBe(true);
    expect(isPlanAtLeast('FREE', 'STARTER')).toBe(false);
  });
  it('maps permissions to roles', () => {
    expect(hasPermission('COMPANY_ADMIN', 'billing:manage')).toBe(true);
    expect(hasPermission('COMPANY_USER', 'content:write')).toBe(false);
  });
});
