import { describe, it, expect } from 'vitest';
import {
  PROXY_ROUTES,
  ERROR_MESSAGES,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_GEO_CONFIG,
  DEFAULT_TRAFFIC_CONFIG
} from '../../src/lib/constants';

describe('Constants Unit Tests', () => {
  describe('PROXY_ROUTES', () => {
    it('should have correct proxy route definitions', () => {
      expect(PROXY_ROUTES).toBeDefined();
      expect(Array.isArray(PROXY_ROUTES)).toBe(true);
      expect(PROXY_ROUTES.length).toBe(3);

      const kvRoute = PROXY_ROUTES.find(route => route.pattern === '/kv/*');
      const bizRoute = PROXY_ROUTES.find(route => route.pattern === '/biz-client/*');
      const renderingRoute = PROXY_ROUTES.find(route => route.pattern === '/rendering-client/*');

      expect(kvRoute).toBeDefined();
      expect(kvRoute?.target).toBe('https://dokv.pwtk.cc');
      expect(kvRoute?.stripPrefix).toBe(false);

      expect(bizRoute).toBeDefined();
      expect(bizRoute?.target).toBe('https://biz-client.pwtk.cc');
      expect(bizRoute?.stripPrefix).toBe(false);

      expect(renderingRoute).toBeDefined();
      expect(renderingRoute?.target).toBe('https://rendering-client.pwtk.cc');
      expect(renderingRoute?.stripPrefix).toBe(false);
    });

    it('should have cache disabled for all routes by default', () => {
      PROXY_ROUTES.forEach(route => {
        expect(route.cacheEnabled).toBe(false);
      });
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have all required error messages', () => {
      expect(ERROR_MESSAGES).toBeDefined();
      expect(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED).toBeDefined();
      expect(ERROR_MESSAGES.GEO_BLOCKED).toBeDefined();
      expect(ERROR_MESSAGES.PROXY_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.CACHE_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.DURABLE_OBJECT_ERROR).toBeDefined();
    });

    it('should have meaningful error message content', () => {
      expect(typeof ERROR_MESSAGES.RATE_LIMIT_EXCEEDED).toBe('string');
      expect(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED.length).toBeGreaterThan(0);

      expect(typeof ERROR_MESSAGES.PROXY_ERROR).toBe('string');
      expect(ERROR_MESSAGES.PROXY_ERROR.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_CACHE_CONFIG', () => {
    it('should have default cache configuration', () => {
      expect(DEFAULT_CACHE_CONFIG).toBeDefined();
      expect(DEFAULT_CACHE_CONFIG.enabled).toBe(false); // 全局缓存默认关闭，只允许路径级配置
      expect(DEFAULT_CACHE_CONFIG.version).toBe(1);
      expect(Array.isArray(DEFAULT_CACHE_CONFIG.whitelist)).toBe(true);
      expect(DEFAULT_CACHE_CONFIG.whitelist).toContain('/kv/*');
      expect(DEFAULT_CACHE_CONFIG.whitelist).toContain('/biz-client/*');
    });
  });

  describe('DEFAULT_RATE_LIMIT_CONFIG', () => {
    it('should have default rate limit configuration', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG).toBeDefined();
      // 已移除全局限流，只保留窗口时间和路径限流配置
      expect(DEFAULT_RATE_LIMIT_CONFIG.windowSeconds).toBe(60);
      expect(typeof DEFAULT_RATE_LIMIT_CONFIG.pathLimits).toBe('object');
      expect(Object.keys(DEFAULT_RATE_LIMIT_CONFIG.pathLimits).length).toBe(0); // 默认无路径限流
    });
  });

  describe('DEFAULT_GEO_CONFIG', () => {
    it('should have default geo configuration', () => {
      expect(DEFAULT_GEO_CONFIG).toBeDefined();
      expect(DEFAULT_GEO_CONFIG.enabled).toBe(false);
      expect(['whitelist', 'blacklist']).toContain(DEFAULT_GEO_CONFIG.mode);
      expect(Array.isArray(DEFAULT_GEO_CONFIG.countries)).toBe(true);
    });
  });

  describe('DEFAULT_TRAFFIC_CONFIG', () => {
    it('should have default traffic configuration', () => {
      expect(DEFAULT_TRAFFIC_CONFIG).toBeDefined();
      expect(typeof DEFAULT_TRAFFIC_CONFIG.alertThreshold).toBe('number');
      expect(DEFAULT_TRAFFIC_CONFIG.alertThreshold).toBeGreaterThan(0);
      expect(typeof DEFAULT_TRAFFIC_CONFIG.autoEnableCache).toBe('boolean');
    });
  });
});