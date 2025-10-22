import type { UnifiedPathConfig, ProxyRoute, GlobalConfig, ResolvedConfig } from '../types/config';

/**
 * 配置继承解析器
 * 实现三层继承：精确路径 > 代理路由 > 全局配置
 */
export class ConfigResolver {
  /**
   * 解析路径的最终配置
   * 按照优先级顺序合并配置：精确路径配置 > 代理路由配置 > 全局配置
   * @param pathConfig 路径级别配置
   * @param proxyConfig 代理路由级别配置
   * @param globalConfig 全局默认配置
   * @returns 解析后的最终配置
   */
  static resolvePathConfig(
    pathConfig: UnifiedPathConfig,
    proxyConfig?: ProxyRoute,
    globalConfig?: GlobalConfig
  ): ResolvedConfig {
    // 默认的全局配置
    const defaultGlobalConfig: GlobalConfig = {
      defaultCacheEnabled: false,
      defaultCacheVersion: 1,
      defaultRateLimitEnabled: true,
      defaultRateLimit: 60,
      defaultRateLimitWindow: 60,
      defaultGeoEnabled: false,
      defaultGeoMode: 'whitelist',
      defaultGeoCountries: []
    };

    const global = globalConfig || defaultGlobalConfig;

    return {
      // 缓存配置继承
      cache: {
        enabled: pathConfig.cache?.enabled 
          ?? proxyConfig?.defaultCache?.enabled 
          ?? global.defaultCacheEnabled,
        version: pathConfig.cache?.version 
          ?? proxyConfig?.defaultCache?.version 
          ?? global.defaultCacheVersion
      },
      
      // 限流配置继承
      rateLimit: {
        enabled: pathConfig.rateLimit?.enabled 
          ?? proxyConfig?.defaultRateLimit?.enabled 
          ?? global.defaultRateLimitEnabled,
        limit: pathConfig.rateLimit?.limit 
          ?? proxyConfig?.defaultRateLimit?.limit 
          ?? global.defaultRateLimit,
        window: pathConfig.rateLimit?.window 
          ?? proxyConfig?.defaultRateLimit?.window 
          ?? global.defaultRateLimitWindow
      },
      
      // 地域封锁配置继承
      geo: {
        enabled: pathConfig.geo?.enabled 
          ?? proxyConfig?.defaultGeo?.enabled 
          ?? global.defaultGeoEnabled,
        mode: pathConfig.geo?.mode 
          ?? proxyConfig?.defaultGeo?.mode 
          ?? global.defaultGeoMode,
        countries: pathConfig.geo?.countries 
          ?? proxyConfig?.defaultGeo?.countries 
          ?? global.defaultGeoCountries
      }
    };
  }

  /**
   * 批量解析多个路径的配置
   * @param paths 路径列表
   * @param proxyRoutes 代理路由列表
   * @param globalConfig 全局配置
   * @returns 解析后的配置映射
   */
  static resolveMultiplePathConfigs(
    paths: UnifiedPathConfig[],
    proxyRoutes: ProxyRoute[] = [],
    globalConfig?: GlobalConfig
  ): Map<string, ResolvedConfig> {
    const resolved = new Map<string, ResolvedConfig>();
    
    // 创建代理路由查找映射
    const proxyMap = new Map<string, ProxyRoute>();
    proxyRoutes.forEach(proxy => proxyMap.set(proxy.id, proxy));

    for (const path of paths) {
      const proxy = path.proxyId ? proxyMap.get(path.proxyId) : undefined;
      const resolvedConfig = this.resolvePathConfig(path, proxy, globalConfig);
      resolved.set(path.path, resolvedConfig);
    }

    return resolved;
  }

  /**
   * 检查配置是否被路径级别覆盖
   * @param pathConfig 路径配置
   * @returns 覆盖状态
   */
  static getConfigOverrideStatus(pathConfig: UnifiedPathConfig): {
    cache: boolean;
    rateLimit: boolean;
    geo: boolean;
  } {
    return {
      cache: pathConfig.cache?.enabled !== undefined,
      rateLimit: pathConfig.rateLimit?.enabled !== undefined,
      geo: pathConfig.geo?.enabled !== undefined
    };
  }

  /**
   * 获取配置的来源信息
   * @param pathConfig 路径配置
   * @param proxyConfig 代理配置
   * @param globalConfig 全局配置
   * @returns 各配置项的来源
   */
  static getConfigSources(
    pathConfig: UnifiedPathConfig,
    proxyConfig?: ProxyRoute,
    globalConfig?: GlobalConfig
  ): {
    cache: 'path' | 'proxy' | 'global';
    rateLimit: 'path' | 'proxy' | 'global';
    geo: 'path' | 'proxy' | 'global';
  } {
    return {
      cache: pathConfig.cache?.enabled !== undefined 
        ? 'path' 
        : (proxyConfig?.defaultCache?.enabled !== undefined ? 'proxy' : 'global'),
      
      rateLimit: pathConfig.rateLimit?.enabled !== undefined 
        ? 'path' 
        : (proxyConfig?.defaultRateLimit?.enabled !== undefined ? 'proxy' : 'global'),
      
      geo: pathConfig.geo?.enabled !== undefined 
        ? 'path' 
        : (proxyConfig?.defaultGeo?.enabled !== undefined ? 'proxy' : 'global')
    };
  }

  /**
   * 创建路径配置的继承预览
   * 显示每个配置项将从哪里继承值
   * @param pathConfig 路径配置
   * @param proxyConfig 代理配置
   * @param globalConfig 全局配置
   * @returns 配置预览信息
   */
  static getConfigPreview(
    pathConfig: UnifiedPathConfig,
    proxyConfig?: ProxyRoute,
    globalConfig?: GlobalConfig
  ): {
    resolved: ResolvedConfig;
    sources: ReturnType<typeof ConfigResolver.getConfigSources>;
    overrides: ReturnType<typeof ConfigResolver.getConfigOverrideStatus>;
  } {
    return {
      resolved: this.resolvePathConfig(pathConfig, proxyConfig, globalConfig),
      sources: this.getConfigSources(pathConfig, proxyConfig, globalConfig),
      overrides: this.getConfigOverrideStatus(pathConfig)
    };
  }

  /**
   * 验证配置值的合法性
   * @param config 要验证的配置
   * @returns 验证结果
   */
  static validateConfig(config: Partial<UnifiedPathConfig>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 验证缓存配置
    if (config.cache) {
      if (config.cache.enabled !== undefined && typeof config.cache.enabled !== 'boolean') {
        errors.push('cache.enabled must be a boolean');
      }
      if (config.cache.version !== undefined && (typeof config.cache.version !== 'number' || config.cache.version < 1)) {
        errors.push('cache.version must be a positive number');
      }
    }

    // 验证限流配置
    if (config.rateLimit) {
      if (config.rateLimit.enabled !== undefined && typeof config.rateLimit.enabled !== 'boolean') {
        errors.push('rateLimit.enabled must be a boolean');
      }
      if (config.rateLimit.limit !== undefined && (typeof config.rateLimit.limit !== 'number' || config.rateLimit.limit < 1)) {
        errors.push('rateLimit.limit must be a positive number');
      }
      if (config.rateLimit.window !== undefined && (typeof config.rateLimit.window !== 'number' || config.rateLimit.window < 1)) {
        errors.push('rateLimit.window must be a positive number');
      }
    }

    // 验证地域封锁配置
    if (config.geo) {
      if (config.geo.enabled !== undefined && typeof config.geo.enabled !== 'boolean') {
        errors.push('geo.enabled must be a boolean');
      }
      if (config.geo.mode !== undefined && !['whitelist', 'blacklist'].includes(config.geo.mode)) {
        errors.push('geo.mode must be either "whitelist" or "blacklist"');
      }
      if (config.geo.countries !== undefined && !Array.isArray(config.geo.countries)) {
        errors.push('geo.countries must be an array');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// 导出单例实例
export const configResolver = new ConfigResolver();