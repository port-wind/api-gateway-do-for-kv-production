import { Hono } from 'hono';
import type { Env } from '../../types/env';
import { getConfig, updateConfig } from '../../lib/config';
import { invalidateCache, invalidateCacheKey, getCacheStats, getFromCache, getCacheRemainingTTL, warmCache, deleteCacheEntry } from '../../lib/cache-manager';
import { CONFIG_TYPES, ERROR_MESSAGES, CACHE_PREFIXES } from '../../lib/constants';
import { getProxyRoutesFromKV } from '../../lib/proxy-routes';

const app = new Hono<{ Bindings: Env }>();

// GET /cache/config - 获取缓存配置
app.get('/cache/config', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);

    return c.json({
      success: true,
      config: {
        ...config
        // 移除 proxyRoutes 字段，代理路由现在通过 /admin/proxy-routes 管理
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// PUT /cache/config - 更新缓存配置
app.put('/cache/config', async (c) => {
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

    if (newConfig.version && (!Number.isInteger(newConfig.version) || newConfig.version < 1)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'version must be a positive integer'
      }, 400);
    }

    const success = await updateConfig(c.env, CONFIG_TYPES.CACHE, newConfig);

    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CONFIG_ERROR,
        message: 'Failed to update cache configuration'
      }, 500);
    }

    return c.json({
      success: true,
      message: 'Cache configuration updated successfully',
      config: newConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating cache config:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /cache/invalidate - 使缓存失效
app.post('/cache/invalidate', async (c) => {
  try {
    const { pattern, key } = await c.req.json();

    let invalidatedCount = 0;

    if (key) {
      // 使特定键失效
      const success = await invalidateCacheKey(c.env, key);
      invalidatedCount = success ? 1 : 0;
    } else if (pattern) {
      // 根据模式使缓存失效
      invalidatedCount = await invalidateCache(c.env, pattern);
    } else {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'Either pattern or key must be provided'
      }, 400);
    }

    return c.json({
      success: true,
      message: `Cache invalidation completed`,
      invalidatedCount,
      pattern: pattern || undefined,
      key: key || undefined,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /cache/stats - 获取缓存统计
app.get('/cache/stats', async (c) => {
  try {
    const stats = await getCacheStats(c.env);

    return c.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /cache/health - 缓存系统健康检查
app.get('/cache/health', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);
    const stats = await getCacheStats(c.env);

    return c.json({
      status: 'healthy',
      enabled: config.enabled,
      version: config.version,
      whitelistPaths: config.whitelist.length,
      pathConfigs: Object.keys(config.pathConfigs).length,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache health check error:', error);
    return c.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// GET /cache/paths - 获取所有已配置的路径（支持搜索）
app.get('/cache/paths', async (c) => {
  try {
    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);
    const searchQuery = c.req.query('q') || '';
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');

    // 获取所有路径配置
    let pathEntries = Object.entries(config.pathConfigs);

    // 搜索过滤
    if (searchQuery) {
      pathEntries = pathEntries.filter(([path]) =>
        path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分页
    const total = pathEntries.length;
    const startIndex = (page - 1) * limit;
    const paginatedPaths = pathEntries.slice(startIndex, startIndex + limit);

    // 构建结果
    const paths = paginatedPaths.map(([path, config]) => ({
      path,
      ...config,
      lastModified: new Date().toISOString() // TODO: 实际的修改时间
    }));

    return c.json({
      success: true,
      data: {
        paths,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache paths:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /cache/flush - 缓存刷新API
app.post('/cache/flush', async (c) => {
  try {
    const requestBody = await c.req.json().catch(() => ({}));
    const { keys, pattern, version } = requestBody;

    let flushedCount = 0;
    const failedKeys: string[] = [];
    const startTime = Date.now();

    if (keys && Array.isArray(keys)) {
      // 刷新指定键的缓存
      console.log(`开始刷新指定路径缓存: ${keys.join(', ')}`);

      const config = await getConfig(c.env, CONFIG_TYPES.CACHE);

      // 对每个路径进行缓存刷新
      for (const keyPath of keys) {
        try {
          // 增加版本号使缓存失效
          const existingConfig = config.pathConfigs[keyPath];
          if (existingConfig) {
            config.pathConfigs[keyPath].version += 1;
          } else {
            // 如果路径不存在配置，创建新配置（保留可能的默认策略）
            config.pathConfigs[keyPath] = {
              enabled: true,
              version: config.version + 1,
              // ⚠️ 使用 null 而非 undefined，因为 JSON.stringify 会丢弃 undefined 字段
              keyStrategy: null,  // null表示使用默认策略
              keyHeaders: null,
              keyParams: null
            };
          }

          // 直接删除现有缓存条目（模式匹配）
          const deletedCount = await invalidateCache(c.env, keyPath + '*');
          if (deletedCount > 0) {
            flushedCount += deletedCount;
          }
        } catch (error) {
          console.error(`Failed to flush cache for key ${keyPath}:`, error);
          failedKeys.push(keyPath);
        }
      }

      // 更新配置
      await updateConfig(c.env, CONFIG_TYPES.CACHE, config);

    } else if (pattern) {
      // 根据模式刷新缓存
      console.log(`开始按模式刷新缓存: ${pattern}`);
      flushedCount = await invalidateCache(c.env, pattern);

    } else {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'Either keys array or pattern must be provided'
      }, 400);
    }

    const totalTime = Date.now() - startTime;

    console.log(`缓存刷新完成: 成功${flushedCount}个, 失败${failedKeys.length}个, 耗时${totalTime}ms`);

    return c.json({
      success: true,
      message: '缓存刷新完成',
      result: {
        flushedCount,
        failedKeys,
        totalTime
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('缓存刷新API错误:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /cache/preview/:path - 缓存预览API
app.get('/cache/preview/*', async (c) => {
  try {
    const fullPath = c.req.param('*') || '';
    const path = '/' + fullPath;
    const includeContent = c.req.query('includeContent') === 'true';
    const versionParam = c.req.query('version');

    console.log(`开始预览缓存: ${path}`);

    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);
    const pathConfig = config.pathConfigs[path];
    const version = versionParam ? parseInt(versionParam) : (pathConfig?.version || config.version);

    // 生成缓存键（不包含查询参数，用于预览）
    const { getCacheKey } = await import('../../lib/cache-manager');
    const cacheKey = await getCacheKey(path, {}, version);

    // 获取缓存条目
    const cacheEntry = await getFromCache(c.env, cacheKey);

    if (!cacheEntry) {
      return c.json({
        success: false,
        error: 'CACHE_NOT_FOUND',
        message: `没有找到路径 ${path} 的缓存`
      }, 404);
    }

    // 检查版本匹配
    if (cacheEntry.version !== version) {
      return c.json({
        success: false,
        error: 'VERSION_MISMATCH',
        message: `缓存版本不匹配。期望: ${version}, 实际: ${cacheEntry.version}`
      }, 409);
    }

    // 计算缓存大小
    const dataStr = typeof cacheEntry.data === 'string' ? cacheEntry.data : JSON.stringify(cacheEntry.data);
    const remainingTTL = getCacheRemainingTTL(cacheEntry);

    const result = {
      path,
      version: cacheEntry.version,
      createdAt: cacheEntry.createdAt,
      expiresAt: cacheEntry.expiresAt,
      ttl: cacheEntry.ttl,
      remainingTTL,
      size: dataStr.length,
      compressed: (cacheEntry as any).compressed || false,
      headers: cacheEntry.headers,
      etag: cacheEntry.etag,
      lastModified: cacheEntry.lastModified,
      ...(includeContent && { content: cacheEntry.data })
    };

    console.log(`缓存预览成功: ${path}, 大小: ${result.size}字节`);

    return c.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('缓存预览API错误:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// POST /cache/batch - 批量缓存操作API
app.post('/cache/batch', async (c) => {
  try {
    const { operation, paths, options = {} } = await c.req.json();

    if (!operation || !Array.isArray(paths)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'operation and paths array are required'
      }, 400);
    }

    const results: any[] = [];
    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);

    switch (operation) {
      case 'flush':
        // 批量刷新
        for (const path of paths) {
          try {
            const deletedCount = await invalidateCache(c.env, path + '*');
            // 增加版本号
            if (config.pathConfigs[path]) {
              config.pathConfigs[path].version += 1;
            }
            results.push({ path, success: true, deletedCount });
          } catch (error) {
            results.push({ path, success: false, error: (error as Error).message });
          }
        }
        // 更新配置
        await updateConfig(c.env, CONFIG_TYPES.CACHE, config);
        break;

      case 'preview':
        // 批量预览
        const { getCacheKey } = await import('../../lib/cache-manager');

        for (const path of paths) {
          try {
            const pathConfig = config.pathConfigs[path];
            const version = options.version || pathConfig?.version || config.version;
            const cacheKey = await getCacheKey(path, {}, version);
            const cacheEntry = await getFromCache(c.env, cacheKey);

            if (cacheEntry) {
              const remainingTTL = getCacheRemainingTTL(cacheEntry);
              results.push({
                path,
                success: true,
                data: {
                  version: cacheEntry.version,
                  createdAt: cacheEntry.createdAt,
                  expiresAt: cacheEntry.expiresAt,
                  ttl: cacheEntry.ttl,
                  remainingTTL,
                  size: JSON.stringify(cacheEntry.data).length,
                  ...(options.includeContent && { content: cacheEntry.data })
                }
              });
            } else {
              results.push({ path, success: false, error: 'Cache not found' });
            }
          } catch (error) {
            results.push({ path, success: false, error: (error as Error).message });
          }
        }
        break;

      case 'stats':
        // 批量统计
        for (const path of paths) {
          try {
            const pathConfig = config.pathConfigs[path];
            results.push({
              path,
              success: true,
              stats: {
                enabled: pathConfig?.enabled || false,
                version: pathConfig?.version || config.version,
                ttl: pathConfig?.ttl
              }
            });
          } catch (error) {
            results.push({ path, success: false, error: (error as Error).message });
          }
        }
        break;

      default:
        return c.json({
          success: false,
          error: ERROR_MESSAGES.INVALID_CONFIG,
          message: `Unsupported operation: ${operation}`
        }, 400);
    }

    return c.json({
      success: true,
      operation,
      results,
      summary: {
        total: paths.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('批量缓存操作API错误:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON or unknown error'
    }, 500);
  }
});

// POST /cache/paths/batch - 批量更新路径配置
app.post('/cache/paths/batch', async (c) => {
  try {
    const { operations } = await c.req.json();

    if (!Array.isArray(operations)) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'operations must be an array'
      }, 400);
    }

    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);
    let updatedPathConfigs = { ...config.pathConfigs };
    let operationsApplied = 0;

    for (const operation of operations) {
      const { type, path, config: pathConfig } = operation;

      switch (type) {
        case 'set':
          if (path && pathConfig) {
            updatedPathConfigs[path] = {
              enabled: pathConfig.enabled !== undefined ? pathConfig.enabled : true,
              version: pathConfig.version || config.version
            };
            operationsApplied++;
          }
          break;
        case 'delete':
          if (path && updatedPathConfigs[path]) {
            delete updatedPathConfigs[path];
            operationsApplied++;
          }
          break;
        case 'toggle':
          if (path && updatedPathConfigs[path]) {
            updatedPathConfigs[path].enabled = !updatedPathConfigs[path].enabled;
            operationsApplied++;
          }
          break;
      }
    }

    // 更新配置
    const newConfig = {
      ...config,
      pathConfigs: updatedPathConfigs
    };

    const success = await updateConfig(c.env, CONFIG_TYPES.CACHE, newConfig);

    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CONFIG_ERROR,
        message: 'Failed to update cache configuration'
      }, 500);
    }

    return c.json({
      success: true,
      message: `Batch operation completed: ${operationsApplied} operations applied`,
      operationsApplied,
      totalOperations: operations.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in batch path update:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CONFIG_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON'
    }, 400);
  }
});

// POST /cache/warm - 缓存预热API
app.post('/cache/warm', async (c) => {
  try {
    const { paths, version, includeProxyRoutes = true } = await c.req.json();

    if (!Array.isArray(paths) || paths.length === 0) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: 'paths must be a non-empty array'
      }, 400);
    }

    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);
    const targetVersion = version || config.version;

    // 获取代理路由（如果需要）
    let proxyRoutes: Record<string, { target: string; stripPrefix?: boolean; pattern: string }> | undefined;

    if (includeProxyRoutes) {
      try {
        const routes = await getProxyRoutesFromKV(c.env);
        proxyRoutes = {};

        for (const route of routes) {
          if (route.enabled && route.target) {
            proxyRoutes[route.id] = {
              target: route.target,
              stripPrefix: route.stripPrefix,
              pattern: route.pattern
            };
          }
        }
      } catch (error) {
        console.warn('Failed to get proxy routes for warming:', error);
      }
    }

    console.log(`开始预热缓存: ${paths.length} 个路径, 版本 ${targetVersion}`);

    const result = await warmCache(c.env, paths, targetVersion, proxyRoutes);

    return c.json({
      success: true,
      message: '缓存预热完成',
      result: {
        warmedCount: result.warmedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        totalPaths: paths.length,
        version: targetVersion,
        details: result.results
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('缓存预热API错误:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Invalid JSON or unknown error'
    }, 500);
  }
});

// 注意：移除了 LRU 清理和使用率监控 API，因为采用"永不删除"策略

// GET /cache/warm/status - 获取预热状态（可选的扩展功能）
app.get('/cache/warm/status', async (c) => {
  try {
    // 这里可以返回当前是否正在进行预热操作
    // 由于我们使用了单飞模式，可以检查是否有正在进行的预热请求

    return c.json({
      success: true,
      status: {
        isWarming: false, // 简化实现，实际可以通过检查pendingRequests来确定
        lastWarmTime: null, // 可以存储在KV中
        message: 'Cache warming status'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get warm status error:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * DELETE /cache/:cacheKey - 删除特定的缓存条目
 * 用于管理界面单独删除某个缓存条目（真正删除，不是标记过期）
 */
app.delete('/cache/:cacheKey', async (c) => {
  try {
    const cacheKey = c.req.param('cacheKey');

    if (!cacheKey) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: '缓存键不能为空'
      }, 400);
    }

    // 真正删除缓存条目（从 KV 和索引中移除）
    const success = await deleteCacheEntry(c.env, cacheKey);

    if (!success) {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.CACHE_ERROR,
        message: '缓存条目不存在或删除失败'
      }, 404);
    }

    return c.json({
      success: true,
      message: '缓存条目已永久删除',
      cacheKey,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('删除缓存条目失败:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /cache/refresh - 刷新路径的所有缓存
 * 用于管理界面刷新特定路径的所有缓存条目
 */
app.post('/cache/refresh', async (c) => {
  try {
    const { path } = await c.req.json();

    if (!path || typeof path !== 'string') {
      return c.json({
        success: false,
        error: ERROR_MESSAGES.INVALID_CONFIG,
        message: '路径参数无效'
      }, 400);
    }

    // 获取缓存配置
    const config = await getConfig(c.env, CONFIG_TYPES.CACHE);

    // 增加路径的缓存版本号
    const existingPathConfig = config.pathConfigs[path];
    if (existingPathConfig) {
      config.pathConfigs[path].version = (existingPathConfig.version || 1) + 1;
    } else {
      // 如果路径不存在配置，创建新配置
      config.pathConfigs[path] = {
        enabled: true,
        version: 2,
        // ⚠️ 使用 null 而非 undefined，因为 JSON.stringify 会丢弃 undefined 字段
        keyStrategy: null,  // null表示使用默认策略
        keyHeaders: null,
        keyParams: null
      };
    }

    // 更新配置
    await updateConfig(c.env, CONFIG_TYPES.CACHE, config);

    // 删除该路径的所有现有缓存条目
    const pattern = `${CACHE_PREFIXES.CACHE}*:${path}:*`;
    const deletedCount = await invalidateCache(c.env, pattern);

    return c.json({
      success: true,
      message: `路径 ${path} 的缓存已刷新`,
      path,
      newVersion: config.pathConfigs[path].version,
      deletedEntries: deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('刷新路径缓存失败:', error);
    return c.json({
      success: false,
      error: ERROR_MESSAGES.CACHE_ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default app;