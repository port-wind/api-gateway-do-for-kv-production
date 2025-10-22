/**
 * Workers Queue 消费者
 * 
 * Phase 2: 完整聚合逻辑
 * - 接收队列消息
 * - 按 (path, hour_bucket) 分组
 * - 批量写入明细事件到 D1
 * - 聚合统计（使用 simplified-stats.ts）
 * - Upsert 聚合统计到 D1
 * - KV 快照刷新（每 N 次批处理）
 * - 错误处理和选择性 ack/retry
 */

import type { Env } from './types/env';
import { aggregateEvents } from './lib/simplified-stats';
import {
  insertEvents,
  getExistingStats,
  batchUpsertStats,
  getHourBucket,
  type TrafficEvent
} from './lib/d1-writer';
import { generateAndSaveSnapshot } from './lib/kv-snapshot';
import { aggregateIpEvents, batchUpsertIpStats } from './lib/ip-aggregator';

/**
 * 分组键：path + hour_bucket
 */
interface GroupKey {
  path: string;
  hourBucket: string;
}

/**
 * KV 快照刷新配置
 */
const SNAPSHOT_REFRESH_INTERVAL = 10; // 每处理 10 个批次刷新一次
const SNAPSHOT_COUNTER_KEY = 'queue:snapshot_counter';
const SNAPSHOT_HOURS = 24; // 快照覆盖最近 24 小时
const SNAPSHOT_TOP_N = 100; // Top 100 热点路径

/**
 * 队列消费者主函数
 * 
 * 流程：
 * 1. 验证并过滤无效消息
 * 2. 批量写入明细事件（INSERT OR IGNORE，幂等）
 * 3. 按 (path, hour_bucket) 分组
 * 4. 读取现有聚合统计
 * 5. 使用 simplified-stats 聚合
 * 6. 批量 upsert 聚合统计
 * 7. 聚合 IP 统计并批量写入（新增）
 * 8. 选择性 ack/retry
 */
export default {
  async queue(
    batch: MessageBatch<TrafficEvent>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`========================================`);
    console.log(`📦 Queue Batch Received`);
    console.log(`   Messages: ${batch.messages.length}`);
    console.log(`   Queue: traffic-events`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`========================================`);

    // Step 1: 验证并收集有效事件
    const validMessages: Message<TrafficEvent>[] = [];
    const validEvents: TrafficEvent[] = [];

    for (const msg of batch.messages) {
      try {
        const event = msg.body;

        // 验证必需字段
        if (!event.idempotentId || !event.path || !event.timestamp) {
          console.error(`❌ Invalid event (missing required fields):`, {
            id: msg.id,
            idempotentId: event.idempotentId,
            path: event.path,
            timestamp: event.timestamp,
          });
          msg.ack(); // ack 无效消息，避免重复处理
          continue;
        }

        validMessages.push(msg);
        validEvents.push(event);

      } catch (error) {
        console.error(`❌ Error parsing message ${msg.id}:`, error);
        msg.ack(); // ack 解析失败的消息
      }
    }

    if (validEvents.length === 0) {
      console.log(`⚠️ No valid events to process`);
      return;
    }

    console.log(`✅ Validated ${validEvents.length}/${batch.messages.length} events`);

    try {
      // Step 2: 批量写入明细事件到 D1（幂等，使用 INSERT OR IGNORE）
      // ⚠️ 关键：返回实际插入的事件 ID，避免重复计数
      const insertedIds = await insertEvents(env, validEvents);

      // Step 3: 过滤出实际插入的事件（避免重复计数）
      // ⚠️ 关键：使用 delete() 消费 ID，确保同一批次中的重复事件只匹配一次
      const insertedEvents = validEvents.filter(event => insertedIds.delete(event.idempotentId));

      if (insertedEvents.length === 0) {
        console.log(`⚠️ 所有事件都已存在，无需聚合（幂等性保护）`);
        // 仍然 ack 消息，因为这些事件已经被处理过了
        for (const msg of validMessages) {
          msg.ack();
        }
        return;
      }

      console.log(`📊 过滤结果: ${insertedEvents.length}/${validEvents.length} 条事件需要聚合`);

      // Step 4: 按 (path, hour_bucket) 分组（仅聚合实际插入的事件）
      // ⚠️ 使用 ||| 作为分隔符（路径中不太可能出现）
      const KEY_SEPARATOR = '|||';
      const groups = new Map<string, TrafficEvent[]>();

      for (const event of insertedEvents) {
        const hourBucket = getHourBucket(event.timestamp);
        const key = `${event.path}${KEY_SEPARATOR}${hourBucket}`;

        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(event);
      }

      console.log(`📊 Grouped into ${groups.size} (path, hour_bucket) combinations`);

      // Step 5: 聚合统计
      const aggregatedStats = [];

      for (const [key, events] of groups.entries()) {
        const [path, hourBucket] = key.split(KEY_SEPARATOR);

        try {
          // 读取现有聚合统计
          const existingStats = await getExistingStats(env, path, hourBucket);

          // 使用 simplified-stats 聚合
          const newStats = await aggregateEvents(events, existingStats);

          aggregatedStats.push(newStats);

          console.log(`✅ Aggregated: ${path} | ${hourBucket} | ${events.length} events → ${newStats.requests} total requests`);

        } catch (error) {
          console.error(`❌ Aggregation failed for ${key}:`, error);
          // 聚合失败时，暂不处理（retry 整个批次）
          throw error;
        }
      }

      // Step 6: 批量 upsert 路径聚合统计到 D1
      await batchUpsertStats(env, aggregatedStats);

      // Step 7: 聚合 IP 统计并批量写入
      // ⚠️ 使用实际插入的事件，避免重复计数
      try {
        const ipStatsMap = aggregateIpEvents(insertedEvents);
        await batchUpsertIpStats(env, ipStatsMap);
        console.log(`✅ IP 聚合完成: ${ipStatsMap.size} 个 (date, ip_hash) 组合`);
      } catch (error) {
        console.error(`❌ IP 聚合失败:`, error);
        // IP 聚合失败不影响路径聚合，记录错误但继续
        // 下次消息重试时会重新处理
      }

      // Step 8: 检查是否需要刷新 KV 快照
      const shouldRefresh = await shouldRefreshSnapshot(env);

      if (shouldRefresh) {
        console.log(`🔄 触发 KV 快照刷新（异步）`);
        // 异步刷新，不阻塞消息处理
        ctx.waitUntil(
          refreshSnapshotAsync(env).catch(error => {
            console.error(`❌ KV 快照刷新失败:`, error);
            // 快照失败不影响消息处理
          })
        );
      }

      // Step 9: ack 所有有效消息（成功处理）
      for (const msg of validMessages) {
        msg.ack();
      }

      const duration = Date.now() - startTime;
      console.log(`========================================`);
      console.log(`✅ Batch Processed Successfully`);
      console.log(`   Total: ${validEvents.length} events`);
      console.log(`   Inserted: ${insertedEvents.length} events (new)`);
      console.log(`   Skipped: ${validEvents.length - insertedEvents.length} events (duplicates)`);
      console.log(`   Groups: ${groups.size} (path, hour_bucket)`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`========================================\n`);

    } catch (error) {
      // 批量处理失败，retry 所有有效消息
      console.error(`❌ Batch processing failed:`, error);

      for (const msg of validMessages) {
        msg.retry();
      }

      console.log(`⚠️ Batch retrying: ${validMessages.length} messages`);
    }
  },
};

/**
 * 检查是否需要刷新 KV 快照
 * 
 * 逻辑：
 * 1. 读取当前批次计数器
 * 2. 计数器 +1
 * 3. 如果计数器 % SNAPSHOT_REFRESH_INTERVAL === 0，则需要刷新
 * 4. 重置计数器
 * 
 * @param env 环境变量
 * @returns Promise<boolean>
 */
async function shouldRefreshSnapshot(env: Env): Promise<boolean> {
  try {
    // 读取当前计数器
    const counterStr = await env.API_GATEWAY_STORAGE.get(SNAPSHOT_COUNTER_KEY);
    const counter = counterStr ? parseInt(counterStr, 10) : 0;

    // 计数器 +1
    const newCounter = counter + 1;

    // 检查是否需要刷新
    const needsRefresh = newCounter % SNAPSHOT_REFRESH_INTERVAL === 0;

    if (needsRefresh) {
      // 重置计数器
      await env.API_GATEWAY_STORAGE.put(SNAPSHOT_COUNTER_KEY, '0');
      console.log(`📊 批次计数器达到 ${newCounter}，触发快照刷新`);
    } else {
      // 更新计数器
      await env.API_GATEWAY_STORAGE.put(SNAPSHOT_COUNTER_KEY, String(newCounter));
      console.log(`📊 批次计数器: ${newCounter}/${SNAPSHOT_REFRESH_INTERVAL}`);
    }

    return needsRefresh;
  } catch (error) {
    console.error(`❌ 检查快照刷新失败:`, error);
    // 出错时默认不刷新
    return false;
  }
}

/**
 * 异步刷新 KV 快照
 * 
 * @param env 环境变量
 * @returns Promise<void>
 */
async function refreshSnapshotAsync(env: Env): Promise<void> {
  console.log(`========================================`);
  console.log(`🔄 开始刷新 KV 快照`);
  console.log(`========================================`);

  try {
    const config = await generateAndSaveSnapshot(env, SNAPSHOT_HOURS, SNAPSHOT_TOP_N);

    console.log(`✅ KV 快照刷新成功`);
    console.log(`   Version: ${config.version}`);
    console.log(`   Count: ${config.count}`);
    console.log(`   Time Range: ${config.timeRange.start} → ${config.timeRange.end}`);
  } catch (error) {
    console.error(`❌ KV 快照刷新失败:`, error);
    throw error;
  }
}

