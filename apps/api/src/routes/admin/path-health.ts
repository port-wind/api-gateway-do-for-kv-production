import { Hono } from 'hono';
import type { Env } from '../../types/env';

const app = new Hono<{ Bindings: Env }>();

/**
 * ⚠️ 所有 DO 健康检查端点已废弃
 * PathCollector DO 已在 Phase 3 下线，健康检查功能不再可用
 */

/**
 * GET /health/do-overview - PathCollector DO 系统总览（已废弃）
 */
app.get('/health/do-overview', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线，健康检查功能不再可用。'
  }, 410); // 410 Gone
});

/**
 * GET /health/do-detailed - 详细 DO 健康检查（已废弃）
 */
app.get('/health/do-detailed', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线，健康检查功能不再可用。'
  }, 410); // 410 Gone
});

/**
 * POST /health/auto-maintenance - 自动维护操作（已废弃）
 */
app.post('/health/auto-maintenance', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线，维护功能不再可用。'
  }, 410); // 410 Gone
});

/**
 * GET /health/comparison - DO 方案与新架构对比（已废弃）
 */
app.get('/health/comparison', async (c) => {
  return c.json({
    success: false,
    error: 'DEPRECATED_ENDPOINT',
    message: 'PathCollector DO 已下线，架构对比功能不再可用。'
  }, 410); // 410 Gone
});

export default app;
