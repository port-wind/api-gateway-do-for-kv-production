/**
 * 测试数据和常量
 */

export const TEST_ROUTES = {
  KV_ROUTE: '/kv/test',
  BIZ_CLIENT_ROUTE: '/biz-client/test',
  HEALTH: '/health',
  PROXY_HEALTH: '/proxy/health'
};

export const ADMIN_ENDPOINTS = {
  CACHE_CONFIG: '/admin/cache/config',
  CACHE_STATS: '/admin/cache/stats',
  CACHE_INVALIDATE: '/admin/cache/invalidate',
  RATE_LIMIT_CONFIG: '/admin/rate-limit/config',
  RATE_LIMIT_STATUS: (ip: string) => `/admin/rate-limit/status/${ip}`,
  RATE_LIMIT_RESET: (ip: string) => `/admin/rate-limit/reset/${ip}`,
  GEO_CONFIG: '/admin/geo/config',
  GEO_COUNTRIES: '/admin/geo/countries',
  TRAFFIC_STATS: '/admin/traffic/stats',
  TRAFFIC_CONFIG: '/admin/traffic/config',
  TRAFFIC_ALERTS: '/admin/traffic/alerts'
};

export const DEFAULT_CACHE_CONFIG = {
  version: 1,
  enabled: true,
  defaultTtl: 3600,
  whitelist: ['/kv/*', '/biz-client/*'],
  pathConfigs: {}
};

export const DEFAULT_RATE_LIMIT_CONFIG = {
  enabled: true,
  defaultLimit: 60,
  windowSeconds: 60,
  pathLimits: {}
};

export const DEFAULT_GEO_CONFIG = {
  enabled: false,
  mode: 'whitelist',
  countries: ['US', 'CN'],
  pathOverrides: {}
};

export const DEFAULT_TRAFFIC_CONFIG = {
  alertThreshold: 10000,
  autoEnableCache: false,
  measurementWindow: 60
};

export const TEST_IP = '127.0.0.1';

export const MOCK_COUNTRIES = ['US', 'CN', 'JP', 'DE', 'GB', 'FR'];