import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test async function', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });
});