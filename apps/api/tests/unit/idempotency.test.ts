import { describe, it, expect } from 'vitest';
import {
  generateIdempotentId,
  isValidIdempotentId,
  extractTimestamp,
  hashIP,
} from '../../src/lib/idempotency';

describe('Idempotency', () => {
  describe('generateIdempotentId', () => {
    it('应该生成有效的幂等 ID', async () => {
      const id = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id).toMatch(/^\d{13}-[0-9a-f]{8}$/);
      expect(id.startsWith('1730956800000-')).toBe(true);
    });
    
    it('相同输入应该生成相同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id1).toBe(id2);
    });
    
    it('不同时间戳应该生成不同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800001, // 不同时间戳
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      expect(id1).not.toBe(id2);
    });
    
    it('不同 IP 应该生成不同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800000,
        '192.168.1.2', // 不同 IP
        '/api/users',
        'req-123'
      );
      
      expect(id1).not.toBe(id2);
    });
    
    it('不同路径应该生成不同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/posts', // 不同路径
        'req-123'
      );
      
      expect(id1).not.toBe(id2);
    });
    
    it('不同请求 ID 应该生成不同的 ID', async () => {
      const id1 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const id2 = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users',
        'req-456' // 不同请求 ID
      );
      
      expect(id1).not.toBe(id2);
    });
    
    it('应该处理特殊字符', async () => {
      const id = await generateIdempotentId(
        1730956800000,
        '192.168.1.1',
        '/api/users?name=张三&age=20',
        'req-123'
      );
      
      expect(id).toMatch(/^\d{13}-[0-9a-f]{8}$/);
    });
  });
  
  describe('isValidIdempotentId', () => {
    it('应该验证有效的 ID', () => {
      expect(isValidIdempotentId('1730956800000-a1b2c3d4')).toBe(true);
      expect(isValidIdempotentId('1234567890123-abcdef01')).toBe(true);
    });
    
    it('应该拒绝无效的 ID', () => {
      // 完全无效
      expect(isValidIdempotentId('invalid')).toBe(false);
      
      // 只有时间戳
      expect(isValidIdempotentId('1730956800000')).toBe(false);
      
      // 哈希部分不是十六进制
      expect(isValidIdempotentId('1730956800000-xyz')).toBe(false);
      
      // 哈希部分太短
      expect(isValidIdempotentId('1730956800000-a1b2c3')).toBe(false);
      
      // 哈希部分太长
      expect(isValidIdempotentId('1730956800000-a1b2c3d4e5')).toBe(false);
      
      // 时间戳不是数字
      expect(isValidIdempotentId('abc-a1b2c3d4')).toBe(false);
      
      // 时间戳位数不对
      expect(isValidIdempotentId('123-a1b2c3d4')).toBe(false);
    });
  });
  
  describe('extractTimestamp', () => {
    it('应该从 ID 中提取时间戳', () => {
      const timestamp = extractTimestamp('1730956800000-a1b2c3d4');
      expect(timestamp).toBe(1730956800000);
    });
    
    it('无效 ID 应该返回 null', () => {
      expect(extractTimestamp('invalid')).toBe(null);
      expect(extractTimestamp('1730956800000')).toBe(null);
      expect(extractTimestamp('abc-a1b2c3d4')).toBe(null);
    });
    
    it('应该处理不同的时间戳', () => {
      expect(extractTimestamp('1234567890123-abcdef01')).toBe(1234567890123);
      expect(extractTimestamp('9999999999999-12345678')).toBe(9999999999999);
    });
  });
  
  describe('hashIP', () => {
    it('应该生成 16 位十六进制哈希', async () => {
      const hash = await hashIP('192.168.1.1');
      
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(hash.length).toBe(16);
    });
    
    it('相同 IP 应该生成相同的哈希', async () => {
      const hash1 = await hashIP('192.168.1.1');
      const hash2 = await hashIP('192.168.1.1');
      
      expect(hash1).toBe(hash2);
    });
    
    it('不同 IP 应该生成不同的哈希', async () => {
      const hash1 = await hashIP('192.168.1.1');
      const hash2 = await hashIP('192.168.1.2');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('应该处理 IPv6 地址', async () => {
      const hash = await hashIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
    
    it('应该处理 localhost', async () => {
      const hash = await hashIP('127.0.0.1');
      
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });
  
  describe('性能测试', () => {
    it('generateIdempotentId 应该在 5ms 内完成', async () => {
      const start = performance.now();
      
      await generateIdempotentId(
        Date.now(),
        '192.168.1.1',
        '/api/users',
        'req-123'
      );
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });
    
    it('hashIP 应该在 5ms 内完成', async () => {
      const start = performance.now();
      
      await hashIP('192.168.1.1');
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });
    
    it('批量生成应该保持性能', async () => {
      const start = performance.now();
      
      // 生成 100 个 ID
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          generateIdempotentId(
            Date.now() + i,
            `192.168.1.${i}`,
            '/api/test',
            `req-${i}`
          )
        );
      }
      
      await Promise.all(promises);
      
      const duration = performance.now() - start;
      const avgDuration = duration / 100;
      
      console.log(`平均生成时间: ${avgDuration.toFixed(2)}ms`);
      expect(avgDuration).toBeLessThan(5);
    });
  });
});

