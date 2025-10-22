import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { getConfig, updateConfig } from '../../lib/config';
import { CONFIG_TYPES, ERROR_MESSAGES } from '../../lib/constants';

const app = new Hono<{ Bindings: Env }>();

// GET /traffic/stats - 获取当前流量统计
app.get('/traffic/stats', async (c) => {
  try {
    // 获取 TrafficMonitor Durable Object 实例
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

    const response = await trafficMonitor.fetch('http://dummy/stats');
    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to get traffic statistics',
        details: result
      }, 500);
    }

    return c.json({
      success: true,
      ...(result as object),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting traffic stats:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /traffic/config - 获取流量监控配置
app.get('/traffic/config', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.TRAFFIC);
    
    // 也获取当前阈值
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

    const response = await trafficMonitor.fetch('http://dummy/threshold');
    let currentThreshold = config.alertThreshold;
    
    if (response.ok) {
      const result = await response.json();
      currentThreshold = (result as any).threshold || config.alertThreshold;
    }

    return c.json({
      success: true,
      config: {
        ...config,
        currentThreshold
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting traffic config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /traffic/config - 更新流量监控配置
app.put('/traffic/config', async (c) => {
  try {
    const newConfig = await c.req.json();
    
    // 基本验证
    if (newConfig.alertThreshold && (!Number.isInteger(newConfig.alertThreshold) || newConfig.alertThreshold < 1)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'alertThreshold must be a positive integer'
      }, 400);
    }

    if (typeof newConfig.autoEnableCache !== 'undefined' && typeof newConfig.autoEnableCache !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'autoEnableCache must be a boolean'
      }, 400);
    }

    if (newConfig.measurementWindow && (!Number.isInteger(newConfig.measurementWindow) || newConfig.measurementWindow < 60)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'measurementWindow must be an integer >= 60 seconds'
      }, 400);
    }

    // 更新配置
    const success = await updateConfig(c.env, CONFIG_TYPES.TRAFFIC, newConfig);
    
    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CONFIG_ERROR,
        message: 'Failed to update traffic configuration'
      }, 500);
    }

    // 如果 alertThreshold 正在更新，也更新到 TrafficMonitor
    if (newConfig.alertThreshold) {
      try {
        const id = c.env.TRAFFIC_MONITOR.idFromName('global');
        const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

        const thresholdUrl = new URL('http://dummy/threshold');
        thresholdUrl.searchParams.set('threshold', newConfig.alertThreshold.toString());

        await trafficMonitor.fetch(thresholdUrl.toString(), { method: 'PUT' });
      } catch (thresholdError) {
        console.warn('Failed to update threshold in TrafficMonitor:', thresholdError);
      }
    }

    return c.json({
      success: true,
      message: 'Traffic configuration updated successfully',
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating traffic config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /traffic/reset - 重置流量统计
app.post('/traffic/reset', async (c) => {
  try {
    // 获取 TrafficMonitor Durable Object 实例
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

    const response = await trafficMonitor.fetch('http://dummy/reset', { method: 'POST' });
    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to reset traffic statistics',
        details: result
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Traffic statistics reset successfully',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting traffic stats:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /traffic/auto-cache - 切换自动缓存模式
app.post('/traffic/auto-cache', async (c) => {
  try {
    const { enabled } = await c.req.json();
    
    if (typeof enabled !== 'boolean') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'enabled must be a boolean'
      }, 400);
    }

    // 获取 TrafficMonitor Durable Object 实例
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

    const response = await trafficMonitor.fetch('http://dummy/auto-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to toggle auto-cache',
        details: result
      }, 500);
    }

    return c.json({
      success: true,
      message: `Auto-cache ${enabled ? 'enabled' : 'disabled'}`,
      enabled,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error toggling auto-cache:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// GET /traffic/alerts - 获取警报状态
app.get('/traffic/alerts', async (c) => {
  try {
    // 获取 TrafficMonitor Durable Object 实例
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);

    // 这个端点需要添加到 TrafficMonitor
    // For now, we'll get the stats and determine alert status from there
    const response = await trafficMonitor.fetch('http://dummy/stats');
    const result = await response.json();

    if (!response.ok) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
        message: 'Failed to get alert status',
        details: result
      }, 500);
    }

    const alertActive = (result as any).currentWindow?.thresholdExceeded || false;
    const currentRequests = (result as any).currentWindow?.requests || 0;
    const threshold = (result as any).currentWindow?.threshold || 10000;

    return c.json({
      success: true,
      alerts: {
        active: alertActive,
        currentRequests,
        threshold,
        autoCacheEnabled: (result as any).stats?.autoCache || false,
        windowStart: (result as any).currentWindow?.start,
        message: alertActive 
          ? `Traffic threshold exceeded: ${currentRequests}/${threshold} requests`
          : `Traffic normal: ${currentRequests}/${threshold} requests`
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting alert status:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.DURABLE_OBJECT_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /traffic/health - 流量监控系统健康检查
app.get('/traffic/health', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.TRAFFIC);
    
    // 尝试从 TrafficMonitor 获取统计数据以验证它是否工作
    const id = c.env.TRAFFIC_MONITOR.idFromName('global');
    const trafficMonitor = c.env.TRAFFIC_MONITOR.get(id);
    
    let monitorHealthy = false;
    try {
      const response = await trafficMonitor.fetch('http://dummy/stats');
      monitorHealthy = response.ok;
    } catch {
      monitorHealthy = false;
    }

    return c.json({
      status: monitorHealthy ? 'healthy' : 'degraded',
      config: {
        alertThreshold: config.alertThreshold,
        autoEnableCache: config.autoEnableCache,
        measurementWindow: config.measurementWindow
      },
      trafficMonitorHealthy: monitorHealthy,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Traffic health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default app;