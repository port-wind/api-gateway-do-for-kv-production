import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { 
  queryTrafficStats, 
  getTopPaths, 
  getErrorStats, 
  getGeoStats,
  isAnalyticsEngineEnabled,
  getSamplingRate
} from '../../lib/analytics-engine';
import { ERROR_MESSAGES } from '../../lib/constants';

const app = new Hono<{ Bindings: Env }>();

// GET /analytics/stats - 获取实时统计数据
app.get('/analytics/stats', async (c) => {
  try {
    if (!isAnalyticsEngineEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Analytics Engine not enabled',
        message: 'Set USE_ANALYTICS_ENGINE=true to enable analytics'
      }, 503);
    }

    const timeRange = c.req.query('range') || '5 MINUTE';
    const stats = await queryTrafficStats(c.env, timeRange);
    
    return c.json({
      success: true,
      stats: stats.result,
      query: stats.query,
      timeRange,
      samplingRate: getSamplingRate(c.env),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    return c.json({
      success: false,
      error: 'Analytics query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /analytics/top-paths - 获取热门路径
app.get('/analytics/top-paths', async (c) => {
  try {
    if (!isAnalyticsEngineEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Analytics Engine not enabled',
        message: 'Set USE_ANALYTICS_ENGINE=true to enable analytics'
      }, 503);
    }

    const limit = parseInt(c.req.query('limit') || '10');
    const timeRange = c.req.query('range') || '1 HOUR';
    
    if (limit < 1 || limit > 100) {
      return c.json({
        success: false,
        error: 'Invalid limit',
        message: 'Limit must be between 1 and 100'
      }, 400);
    }

    const paths = await getTopPaths(c.env, limit, timeRange);
    
    return c.json({
      success: true,
      paths: paths.result,
      query: paths.query,
      limit,
      timeRange,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting top paths:', error);
    return c.json({
      success: false,
      error: 'Analytics query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /analytics/errors - 获取错误统计
app.get('/analytics/errors', async (c) => {
  try {
    if (!isAnalyticsEngineEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Analytics Engine not enabled',
        message: 'Set USE_ANALYTICS_ENGINE=true to enable analytics'
      }, 503);
    }

    const timeRange = c.req.query('range') || '1 HOUR';
    const errors = await getErrorStats(c.env, timeRange);
    
    return c.json({
      success: true,
      errors: errors.result,
      query: errors.query,
      timeRange,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting error stats:', error);
    return c.json({
      success: false,
      error: 'Analytics query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /analytics/geo - 获取地理位置统计
app.get('/analytics/geo', async (c) => {
  try {
    if (!isAnalyticsEngineEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Analytics Engine not enabled',
        message: 'Set USE_ANALYTICS_ENGINE=true to enable analytics'
      }, 503);
    }

    const timeRange = c.req.query('range') || '24 HOUR';
    const geo = await getGeoStats(c.env, timeRange);
    
    return c.json({
      success: true,
      countries: geo.result,
      query: geo.query,
      timeRange,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting geo stats:', error);
    return c.json({
      success: false,
      error: 'Analytics query failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /analytics/config - 获取分析配置
app.get('/analytics/config', async (c) => {
  try {
    const config = {
      enabled: isAnalyticsEngineEnabled(c.env),
      samplingRate: getSamplingRate(c.env),
      useAnalyticsEngine: c.env.USE_ANALYTICS_ENGINE === 'true',
      hasTrafficAnalytics: !!c.env.TRAFFIC_ANALYTICS,
      fallbackToTrafficMonitor: c.env.USE_ANALYTICS_ENGINE !== 'true'
    };

    return c.json({
      success: true,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting analytics config:', error);
    return c.json({
      success: false,
      error: 'Config retrieval failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /analytics/config - 更新分析配置
app.put('/analytics/config', async (c) => {
  try {
    const newConfig = await c.req.json();
    
    // 验证采样率
    if (newConfig.samplingRate !== undefined) {
      const rate = parseFloat(newConfig.samplingRate);
      if (isNaN(rate) || rate < 0 || rate > 1) {
        return c.json({
          success: false,
          error: 'Invalid sampling rate',
          message: 'Sampling rate must be between 0.0 and 1.0'
        }, 400);
      }
    }
    
    return c.json({
      success: false,
      error: 'Configuration update not implemented',
      message: 'Environment variables cannot be updated at runtime. Please update wrangler.toml and redeploy.'
    }, 501);
  } catch (error) {
    console.error('Error updating analytics config:', error);
    return c.json({
      success: false,
      error: 'Config update failed',
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// GET /analytics/health - 分析系统健康检查
app.get('/analytics/health', async (c) => {
  try {
    const enabled = isAnalyticsEngineEnabled(c.env);
    const samplingRate = getSamplingRate(c.env);
    
    let status = 'healthy';
    const checks = {
      analyticsEngineEnabled: enabled,
      trafficAnalyticsBinding: !!c.env.TRAFFIC_ANALYTICS,
      validSamplingRate: samplingRate >= 0 && samplingRate <= 1,
      environmentVariables: {
        USE_ANALYTICS_ENGINE: c.env.USE_ANALYTICS_ENGINE,
        TRAFFIC_SAMPLING_RATE: c.env.TRAFFIC_SAMPLING_RATE
      }
    };
    
    if (!enabled) {
      status = 'degraded';
    }
    
    if (!checks.trafficAnalyticsBinding) {
      status = 'unhealthy';
    }
    
    return c.json({
      status,
      checks,
      samplingRate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Analytics health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// GET /analytics/query - 自定义查询接口（用于调试）
app.post('/analytics/query', async (c) => {
  try {
    if (!isAnalyticsEngineEnabled(c.env)) {
      return c.json({
        success: false,
        error: 'Analytics Engine not enabled',
        message: 'Set USE_ANALYTICS_ENGINE=true to enable analytics'
      }, 503);
    }

    const { query } = await c.req.json();
    
    if (!query || typeof query !== 'string') {
      return c.json({
        success: false,
        error: 'Invalid query',
        message: 'Query must be a non-empty string'
      }, 400);
    }
    
    return c.json({
      success: false,
      error: 'Custom queries not implemented',
      message: 'Direct SQL queries require Cloudflare API integration',
      query: query.trim()
    }, 501);
  } catch (error) {
    console.error('Error executing custom query:', error);
    return c.json({
      success: false,
      error: 'Query execution failed',
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

export default app;