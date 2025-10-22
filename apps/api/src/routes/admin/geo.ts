import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { getConfig, updateConfig } from '../../lib/config';
import { CONFIG_TYPES, ERROR_MESSAGES } from '../../lib/constants';

const app = new Hono<{ Bindings: Env }>();

// GET /geo/config - 获取地域封锁配置
app.get('/geo/config', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.GEO);
    
    return c.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting geo config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /geo/config - 更新地域封锁配置
app.put('/geo/config', async (c) => {
  try {
    const newConfig = await c.req.json();
    
    // 基本验证
    if (typeof newConfig.enabled !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'enabled must be a boolean'
      }, 400);
    }

    if (newConfig.mode && !['whitelist', 'blacklist'].includes(newConfig.mode)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'mode must be either "whitelist" or "blacklist"'
      }, 400);
    }

    if (newConfig.countries && !Array.isArray(newConfig.countries)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'countries must be an array'
      }, 400);
    }

    // 验证国家代码 (基本检查 2 字母代码)
    if (newConfig.countries) {
      const invalidCountries = newConfig.countries.filter((country: any) => 
        typeof country !== 'string' || country.length !== 2 || !/^[A-Z]{2}$/.test(country)
      );
      
      if (invalidCountries.length > 0) {
        return c.json({
          success: false,
          error: ERROR_MESSAGES.INVALID_CONFIG,
          message: `Invalid country codes: ${invalidCountries.join(', ')}. Use 2-letter uppercase codes (e.g., "US", "CN")`
        }, 400);
      }
    }

    if (newConfig.pathOverrides && typeof newConfig.pathOverrides !== 'object') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'pathOverrides must be an object'
      }, 400);
    }

    const success = await updateConfig(c.env, CONFIG_TYPES.GEO, newConfig);
    
    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CONFIG_ERROR,
        message: 'Failed to update geo-blocking configuration'
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Geo-blocking configuration updated successfully',
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating geo config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /geo/test - 测试地域封锁规则
app.post('/geo/test', async (c) => {
  try {
    const { country, path } = await c.req.json();
    
    if (!country || typeof country !== 'string') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'country code is required and must be a string'
      }, 400);
    }

    const testPath = path || '/';
    const config = await getConfig(c.env, CONFIG_TYPES.GEO);

    if (!config.enabled) {
      return c.json({
        success: true,
        result: 'allowed',
        reason: 'geo-blocking is disabled',
        country,
        path: testPath,
        timestamp: new Date().toISOString()
      });
    }

    // 检查特定路径的覆盖
    let allowedCountries = config.countries;
    let appliedRule = 'default';

    for (const [pathPattern, countries] of Object.entries(config.pathOverrides)) {
      const regex = new RegExp(`^${pathPattern.replace(/\*/g, '.*')}$`);
      if (regex.test(testPath)) {
        allowedCountries = countries;
        appliedRule = `path override: ${pathPattern}`;
        break;
      }
    }

    let isAllowed: boolean;
    let reason: string;

    if (config.mode === 'whitelist') {
      isAllowed = allowedCountries.includes(country);
      reason = isAllowed 
        ? `country ${country} is in whitelist` 
        : `country ${country} is not in whitelist`;
    } else {
      isAllowed = !allowedCountries.includes(country);
      reason = isAllowed 
        ? `country ${country} is not in blacklist` 
        : `country ${country} is in blacklist`;
    }

    return c.json({
      success: true,
      result: isAllowed ? 'allowed' : 'blocked',
      reason,
      appliedRule,
      config: {
        mode: config.mode,
        countries: allowedCountries
      },
      country,
      path: testPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing geo rules:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// GET /geo/countries - 获取常用国家代码列表
app.get('/geo/countries', async (c) => {
  // 常用国家代码列表
  // TODO: 可以优化为从数据库中获取
  const commonCountries = [
    { code: 'US', name: 'United States' },
    { code: 'CN', name: 'China' },
    { code: 'JP', name: 'Japan' },
    { code: 'DE', name: 'Germany' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'FR', name: 'France' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'BR', name: 'Brazil' },
    { code: 'IN', name: 'India' },
    { code: 'KR', name: 'South Korea' },
    { code: 'RU', name: 'Russia' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'SG', name: 'Singapore' }
  ];

  return c.json({
    success: true,
    countries: commonCountries,
    note: 'This is a list of common country codes. Use 2-letter ISO 3166-1 alpha-2 codes.',
    timestamp: new Date().toISOString()
  });
});

// GET /geo/paths - 获取有地域配置的路径
app.get('/geo/paths', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.GEO);
    const searchQuery = c.req.query('q') || '';
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    // 转换为路径配置数组
    const pathConfigs = Object.entries(config.pathOverrides).map(([path, countries]) => ({
      path,
      countries,
      mode: config.mode,
      enabled: true
    }));

    // 搜索过滤
    const filteredPaths = searchQuery 
      ? pathConfigs.filter(p => p.path.toLowerCase().includes(searchQuery.toLowerCase()))
      : pathConfigs;

    // 分页
    const total = filteredPaths.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedPaths = filteredPaths.slice(startIndex, startIndex + limit);

    return c.json({
      success: true,
      data: paginatedPaths,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting geo paths:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /geo/paths/batch - 批量更新路径地域配置
app.post('/geo/paths/batch', async (c) => {
  try {
    const { operations } = await c.req.json() as {
      operations: Array<{
        type: 'set' | 'delete';
        path: string;
        countries?: string[];
      }>
    };

    if (!Array.isArray(operations)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'operations must be an array'
      }, 400);
    }

    const config = await getConfig(c.env, CONFIG_TYPES.GEO);
    let changeCount = 0;

    operations.forEach(operation => {
      switch (operation.type) {
        case 'set':
          if (operation.countries && Array.isArray(operation.countries)) {
            // 验证国家代码格式
            const validCountries = operation.countries.filter(country => 
              typeof country === 'string' && 
              country.length === 2 && 
              /^[A-Z]{2}$/.test(country)
            );
            
            if (validCountries.length === operation.countries.length) {
              config.pathOverrides[operation.path] = operation.countries;
              changeCount++;
            }
          }
          break;
        case 'delete':
          if (config.pathOverrides[operation.path]) {
            delete config.pathOverrides[operation.path];
            changeCount++;
          }
          break;
      }
    });

    if (changeCount > 0) {
      const success = await updateConfig(c.env, CONFIG_TYPES.GEO, config);
      
      if (!success) {
        return c.json({
          success: false,
          error: ERROR_MESSAGES.CONFIG_ERROR,
          message: 'Failed to update geo-blocking configuration'
        }, 500);
      }
    }

    return c.json({
      success: true,
      message: `Batch update completed: ${changeCount} paths modified`,
      changeCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error batch updating geo paths:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// GET /geo/health - 地域封锁系统健康检查
app.get('/geo/health', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.GEO);
    
    return c.json({
      status: 'healthy',
      enabled: config.enabled,
      mode: config.mode,
      countries: config.countries.length,
      pathOverrides: Object.keys(config.pathOverrides).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Geo-blocking health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default app;