import { Hono } from 'hono';
import type { Env } from '../types/env';
import { rateLimitMiddleware } from '../middleware/rate-limit';
import { geoBlockMiddleware } from '../middleware/geo-block';
import { cacheMiddleware } from '../middleware/cache';
import { proxyMiddleware } from '../middleware/proxy';
import { getEnabledProxyRoutes, findMatchingProxyRoute } from '../lib/proxy-routes';

const app = new Hono<{ Bindings: Env; Variables: { pathCollected?: boolean } }>();

// 动态代理处理器 - 处理所有可能的代理路径
app.all('*', async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  
  // 从 KV 获取匹配的代理路由
  const matchingRoute = await findMatchingProxyRoute(c.env, path);
  
  // 如果找到匹配的路由，应用中间件栈
  if (matchingRoute) {
    console.log(`Dynamic proxy route matched: ${path} -> ${matchingRoute.target}`);
    
    // 应用中间件栈：rate-limit -> geo-block -> cache -> proxy
    await rateLimitMiddleware(c, async () => {
      await geoBlockMiddleware(c, async () => {
        await cacheMiddleware(c, async () => {
          await proxyMiddleware(matchingRoute!)(c, next);
        });
      });
    });
    
    // 确保返回响应对象给 Hono 框架
    return c.res;
  }
  
  // 如果没有匹配的代理路由，继续到下一个处理器
  return next();
});


// 健康检查代理路由
app.get('/proxy/health', async (c) => {
  try {
    const routes = await getEnabledProxyRoutes(c.env);

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      routes: routes.map(route => ({
        id: route.id,
        pattern: route.pattern,
        target: route.target,
        enabled: route.enabled,
        priority: route.priority,
        cacheEnabled: route.cacheEnabled,
        rateLimitEnabled: route.rateLimitEnabled,
        geoEnabled: route.geoEnabled
      })),
      middleware: [
        'rate-limit',
        'geo-block',
        'cache',
        'proxy'
      ]
    };

    return c.json(healthData);
  } catch (error) {
    return c.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// 调试端点检查代理路由匹配
app.get('/proxy/debug/:path{.*}', async (c) => {
  const testPath = '/' + c.req.param('path');

  const matchingRoute = await findMatchingProxyRoute(c.env, testPath);
  const allRoutes = await getEnabledProxyRoutes(c.env);

  return c.json({
    testPath,
    matchingRoute: matchingRoute ? {
      id: matchingRoute.id,
      pattern: matchingRoute.pattern,
      target: matchingRoute.target,
      stripPrefix: matchingRoute.stripPrefix,
      enabled: matchingRoute.enabled,
      priority: matchingRoute.priority,
      cacheEnabled: matchingRoute.cacheEnabled
    } : null,
    allRoutes: allRoutes.map(r => ({ 
      id: r.id, 
      pattern: r.pattern, 
      target: r.target, 
      enabled: r.enabled,
      priority: r.priority 
    }))
  });
});

export default app;