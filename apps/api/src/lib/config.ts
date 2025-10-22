import type { Env } from '../types/env';
import type { 
  ConfigType, 
  CacheConfig, 
  RateLimitConfig, 
  GeoConfig, 
  TrafficConfig,
  PathCacheConfig
} from '../types/config';
import { 
  CACHE_PREFIXES,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_GEO_CONFIG,
  DEFAULT_TRAFFIC_CONFIG,
  DEFAULT_ENV_VALUES
} from './constants';

/** 
 * 从 KV 存储中获取配置，并回退到默认值
 */
export async function getConfig<T extends ConfigType>(
  env: Env, 
  type: T
): Promise<T extends 'cache' ? CacheConfig : 
           T extends 'rate-limit' ? RateLimitConfig :
           T extends 'geo' ? GeoConfig :
           T extends 'traffic' ? TrafficConfig : never> {
  try {
    const key = `${CACHE_PREFIXES.CONFIG}${type}`;
    const stored = await env.API_GATEWAY_STORAGE.get(key, 'json');
    
    if (stored !== null && typeof stored === 'object') {
      // 与默认值合并以确保所有属性都存在
      const defaultConfig = getDefaultConfig(type);
      return { ...defaultConfig, ...stored } as any;
    }
    
    // 如果未找到或无效，返回默认值
    return getDefaultConfig(type) as any;
  } catch (error) {
    console.error(`Error loading ${type} config:`, error);
    return getDefaultConfig(type) as any;
  }
}

/**
 * 更新 KV 存储中的配置
 */
export async function updateConfig<T extends ConfigType>(
  env: Env,
  type: T,
  config: T extends 'cache' ? CacheConfig : 
           T extends 'rate-limit' ? RateLimitConfig :
           T extends 'geo' ? GeoConfig :
           T extends 'traffic' ? TrafficConfig : never
): Promise<boolean> {
  try {
    const key = `${CACHE_PREFIXES.CONFIG}${type}`;
    await env.API_GATEWAY_STORAGE.put(key, JSON.stringify(config));
    return true;
  } catch (error) {
    console.error(`Error updating ${type} config:`, error);
    return false;
  }
}

/**
 * 从缓存配置中获取特定路径的配置
 */
export function getPathConfig(config: CacheConfig, path: string): PathCacheConfig | null {
  // 首先检查精确路径匹配
  if (config.pathConfigs[path]) {
    return config.pathConfigs[path];
  }
  
  // 检查模式匹配 (简单的通配符支持)
  for (const [pattern, pathConfig] of Object.entries(config.pathConfigs)) {
    if (matchesPattern(path, pattern)) {
      return pathConfig;
    }
  }
  
  return null;
}

/**
 * 检查一个路径是否被白名单用于缓存
 */
export function isPathWhitelisted(config: CacheConfig, path: string): boolean {
  return config.whitelist.some(pattern => matchesPattern(path, pattern));
}

/**
 * 简单的模式匹配，支持通配符
 */
function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === path) return true;
  
  // 将模式转换为正则表达式 (简单的通配符支持)
  const regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special characters
    .replace(/\\\*/g, '.*'); // Convert * to .*
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * 获取给定类型的默认配置
 */
function getDefaultConfig(type: ConfigType) {
  switch (type) {
    case 'cache':
      return DEFAULT_CACHE_CONFIG;
    case 'rate-limit':
      return DEFAULT_RATE_LIMIT_CONFIG;
    case 'geo':
      return DEFAULT_GEO_CONFIG;
    case 'traffic':
      return DEFAULT_TRAFFIC_CONFIG;
    default:
      throw new Error(`Unknown config type: ${type}`);
  }
}

/**
 * 获取环境变量值，并回退到默认值
 */
export function getEnvValues(env: Env) {
  return {
    rateLimit: parseInt(env.DEFAULT_RATE_LIMIT || String(DEFAULT_ENV_VALUES.RATE_LIMIT)),
    rateWindow: parseInt(env.DEFAULT_RATE_WINDOW || String(DEFAULT_ENV_VALUES.RATE_WINDOW)),
    cacheVersion: parseInt(env.DEFAULT_CACHE_VERSION || String(DEFAULT_ENV_VALUES.CACHE_VERSION)),
    trafficThreshold: parseInt(env.TRAFFIC_THRESHOLD || String(DEFAULT_ENV_VALUES.TRAFFIC_THRESHOLD))
  };
}

/**
 * 验证配置对象
 */
export function validateConfig(type: ConfigType, config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  
  switch (type) {
    case 'cache':
      return validateCacheConfig(config);
    case 'rate-limit':
      return validateRateLimitConfig(config);
    case 'geo':
      return validateGeoConfig(config);
    case 'traffic':
      return validateTrafficConfig(config);
    default:
      return false;
  }
}

function validateCacheConfig(config: any): config is CacheConfig {
  return (
    typeof config.version === 'number' &&
    typeof config.enabled === 'boolean' &&
    Array.isArray(config.whitelist) &&
    typeof config.pathConfigs === 'object'
  );
}

function validateRateLimitConfig(config: any): config is RateLimitConfig {
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.defaultLimit === 'number' &&
    typeof config.windowSeconds === 'number' &&
    typeof config.pathLimits === 'object'
  );
}

function validateGeoConfig(config: any): config is GeoConfig {
  return (
    typeof config.enabled === 'boolean' &&
    (config.mode === 'whitelist' || config.mode === 'blacklist') &&
    Array.isArray(config.countries) &&
    typeof config.pathOverrides === 'object'
  );
}

function validateTrafficConfig(config: any): config is TrafficConfig {
  return (
    typeof config.alertThreshold === 'number' &&
    typeof config.autoEnableCache === 'boolean' &&
    typeof config.measurementWindow === 'number'
  );
}

/**
 * 重置配置到默认值
 */
export async function resetConfig(env: Env, type: ConfigType): Promise<boolean> {
  const defaultConfig = getDefaultConfig(type);
  return await updateConfig(env, type, defaultConfig as any);
}