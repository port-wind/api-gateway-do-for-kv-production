import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { getConfig, updateConfig } from '../../lib/config';
import { CONFIG_TYPES, ERROR_MESSAGES } from '../../lib/constants';

const app = new Hono<{ Bindings: Env }>();

// GET /rate-limit/config - 获取限流配置
app.get('/rate-limit/config', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT);

    return c.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting rate limit config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /rate-limit/config - 更新限流配置
// ⚠️ 已移除全局限流配置，此端点仅用于更新 windowSeconds
app.put('/rate-limit/config', async (c) => {
  try {
    const newConfig = await c.req.json();

    // 基本验证（仅验证 windowSeconds）
    if (newConfig.windowSeconds && (!Number.isInteger(newConfig.windowSeconds) || newConfig.windowSeconds < 1)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'windowSeconds must be a positive integer'
      }, 400);
    }

    // 获取当前配置并更新
    const currentConfig = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT);
    const updatedConfig = {
      ...currentConfig,
      windowSeconds: newConfig.windowSeconds || currentConfig.windowSeconds,
      pathLimits: newConfig.pathLimits || currentConfig.pathLimits
    };

    const success = await updateConfig(c.env, CONFIG_TYPES.RATE_LIMIT, updatedConfig);

    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CONFIG_ERROR,
        message: 'Failed to update rate limit configuration'
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Rate limit configuration updated successfully',
      config: updatedConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating rate limit config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /rate-limit/reset/:ip - 重置指定 IP 的限流
app.post('/rate-limit/reset/:ip', async (c) => {
  try {
    const ip = c.req.param('ip');

    if (!ip || ip === 'undefined') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'IP address is required'
      }, 400);
    }

    // 获取 RateLimiter Durable Object 实例
    const id = c.env.RATE_LIMITER.idFromName(ip);
    const rateLimiter = c.env.RATE_LIMITER.get(id);

    // 重置限流
    const resetUrl = new URL('http://dummy/reset');
    resetUrl.searchParams.set('ip', ip);

    const response = await rateLimiter.fetch(resetUrl.toString());
    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to reset rate limit',
        details: result
      }, 500);
    }

    return c.json({
      success: true,
      message: `Rate limit reset for IP: ${ip}`,
      ip,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /rate-limit/status/:ip - 获取指定 IP 的限流状态
app.get('/rate-limit/status/:ip', async (c) => {
  try {
    const ip = c.req.param('ip');

    if (!ip || ip === 'undefined') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'IP address is required'
      }, 400);
    }

    // 获取 RateLimiter Durable Object 实例
    const id = c.env.RATE_LIMITER.idFromName(ip);
    const rateLimiter = c.env.RATE_LIMITER.get(id);

    // 获取当前限流状态
    const statusUrl = new URL('http://dummy/status');
    statusUrl.searchParams.set('ip', ip);

    const response = await rateLimiter.fetch(statusUrl.toString());
    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to get rate limit status',
        details: result
      }, 500);
    }

    return c.json({
      success: true,
      ip,
      status: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /rate-limit/paths - 获取有限流配置的路径
app.get('/rate-limit/paths', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT);
    const searchQuery = c.req.query('q') || '';
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    // 转换为路径配置数组
    const pathConfigs = Object.entries(config.pathLimits).map(([path, limitValue]) => ({
      path,
      limit: limitValue,
      window: config.windowSeconds,
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
    console.error('Error getting rate limit paths:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /rate-limit/paths/batch - 批量更新路径限流
app.post('/rate-limit/paths/batch', async (c) => {
  try {
    const { operations } = await c.req.json() as {
      operations: Array<{
        type: 'set' | 'delete';
        path: string;
        limit?: number;
      }>
    };

    if (!Array.isArray(operations)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'operations must be an array'
      }, 400);
    }

    const config = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT);
    let changeCount = 0;

    operations.forEach(operation => {
      switch (operation.type) {
        case 'set':
          if (operation.limit && operation.limit > 0) {
            config.pathLimits[operation.path] = operation.limit;
            changeCount++;
          }
          break;
        case 'delete':
          if (config.pathLimits[operation.path]) {
            delete config.pathLimits[operation.path];
            changeCount++;
          }
          break;
      }
    });

    if (changeCount > 0) {
      const success = await updateConfig(c.env, CONFIG_TYPES.RATE_LIMIT, config);

      if (!success) {
        return c.json({
          success: false,
          error: ERROR_MESSAGES.CONFIG_ERROR,
          message: 'Failed to update rate limit configuration'
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
    console.error('Error batch updating rate limit paths:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// GET /rate-limit/health - 限流系统健康检查
app.get('/rate-limit/health', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.RATE_LIMIT);

    return c.json({
      status: 'healthy',
      windowSeconds: config.windowSeconds,
      pathLimitsCount: Object.keys(config.pathLimits).length,
      message: '全局限流已移除，仅支持路径级别和代理路由级别的限流',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Rate limit health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default app;