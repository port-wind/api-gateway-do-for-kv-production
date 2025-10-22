/**
 * 异步记录实现 - 可靠性保证
 * 
 * 特性：
 * 1. 队列失败重试
 * 2. 幂等性保证
 * 3. 监控告警
 * 4. Fallback 到同步模式
 */

import type { Context } from 'hono';
import type { Env } from '../types/env';

/**
 * 记录事件类型
 */
export interface RecordingEvent {
    id: string;                    // 唯一 ID（用于幂等）
    type: 'path_access' | 'traffic' | 'ip_event' | 'geo_event';
    timestamp: number;
    data: any;
}

/**
 * 异步记录器配置
 */
export interface RecorderConfig {
    enableAsync: boolean;          // 是否启用异步
    maxRetries: number;           // 最大重试次数
    retryDelay: number;           // 重试延迟（ms）
    queueTimeout: number;         // 队列超时（ms）
    enableFallback: boolean;      // 启用 fallback
}

/**
 * 异步记录器 - 增强版
 */
export class AsyncRecorder {
    private config: RecorderConfig;
    private failedQueue: RecordingEvent[] = [];
    private stats = {
        total: 0,
        success: 0,
        failed: 0,
        fallback: 0
    };

    constructor(
        private env: Env,
        config?: Partial<RecorderConfig>
    ) {
        this.config = {
            enableAsync: true,
            maxRetries: 3,
            retryDelay: 1000,
            queueTimeout: 5000,
            enableFallback: true,
            ...config
        };
    }

    /**
     * 记录事件（主入口）
     */
    async record(
        c: Context<{ Bindings: Env }>,
        event: Omit<RecordingEvent, 'id'>
    ): Promise<void> {
        this.stats.total++;

        // 生成唯一 ID（幂等性）
        const eventWithId: RecordingEvent = {
            ...event,
            id: this.generateEventId(event)
        };

        // 如果禁用异步，直接同步写入
        if (!this.config.enableAsync) {
            return this.recordSync(eventWithId);
        }

        // 异步记录（不阻塞主请求）
        c.executionCtx.waitUntil(
            this.recordAsync(eventWithId)
        );
    }

    /**
     * 异步记录（带重试）
     */
    private async recordAsync(event: RecordingEvent): Promise<void> {
        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt < this.config.maxRetries) {
            try {
                // 尝试发送到队列
                await this.sendToQueue(event);

                this.stats.success++;
                console.log(`[AsyncRecorder] Event recorded: ${event.type} (${event.id})`);
                return;

            } catch (error) {
                attempt++;
                lastError = error as Error;

                console.warn(
                    `[AsyncRecorder] Queue send failed (attempt ${attempt}/${this.config.maxRetries}):`,
                    error
                );

                // 等待后重试
                if (attempt < this.config.maxRetries) {
                    await new Promise(resolve =>
                        setTimeout(resolve, this.config.retryDelay * attempt)
                    );
                }
            }
        }

        // 重试失败
        this.stats.failed++;

        // 记录失败事件
        this.failedQueue.push(event);

        // 告警
        console.error(
            `[AsyncRecorder] Failed to record event after ${this.config.maxRetries} retries:`,
            event.type,
            lastError
        );

        // Fallback 到同步模式
        if (this.config.enableFallback) {
            console.warn('[AsyncRecorder] Falling back to sync mode');
            try {
                await this.recordSync(event);
                this.stats.fallback++;
            } catch (fallbackError) {
                console.error('[AsyncRecorder] Fallback also failed:', fallbackError);
            }
        }
    }

    /**
     * 发送到队列
     */
    private async sendToQueue(event: RecordingEvent): Promise<void> {
        if (!this.env.TRAFFIC_QUEUE) {
            throw new Error('TRAFFIC_QUEUE not configured');
        }

        // 设置超时
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Queue timeout')), this.config.queueTimeout);
        });

        // 发送到队列（带超时）
        await Promise.race([
            this.env.TRAFFIC_QUEUE.send({
                event_id: event.id,        // 用于幂等
                event_type: event.type,
                timestamp: event.timestamp,
                ...event.data
            }),
            timeoutPromise
        ]);
    }

    /**
     * 同步记录（Fallback）
     */
    private async recordSync(event: RecordingEvent): Promise<void> {
        switch (event.type) {
            case 'path_access':
                await this.recordPathAccessSync(event);
                break;
            case 'traffic':
                await this.recordTrafficSync(event);
                break;
            case 'ip_event':
                await this.recordIpEventSync(event);
                break;
            case 'geo_event':
                await this.recordGeoEventSync(event);
                break;
        }
    }

    /**
     * 同步记录路径访问
     */
    private async recordPathAccessSync(event: RecordingEvent): Promise<void> {
        try {
            await this.env.D1.prepare(`
        INSERT INTO path_access_logs (
          event_id, path, method, timestamp, ip_address, country
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).bind(
                event.id,
                event.data.path,
                event.data.method,
                event.data.timestamp,
                event.data.ip,
                event.data.country
            ).run();
        } catch (error) {
            console.error('[AsyncRecorder] Sync path access failed:', error);
            throw error;
        }
    }

    /**
     * 同步记录流量事件
     */
    private async recordTrafficSync(event: RecordingEvent): Promise<void> {
        try {
            await this.env.D1.prepare(`
        INSERT INTO traffic_events (
          event_id, path, method, status, duration_ms, 
          timestamp, event_date, ip_address, country
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).bind(
                event.id,
                event.data.path,
                event.data.method,
                event.data.status,
                event.data.duration,
                event.data.timestamp,
                event.data.event_date,
                event.data.ip,
                event.data.country
            ).run();
        } catch (error) {
            console.error('[AsyncRecorder] Sync traffic failed:', error);
            throw error;
        }
    }

    /**
     * 同步记录 IP 事件
     */
    private async recordIpEventSync(event: RecordingEvent): Promise<void> {
        try {
            await this.env.D1.prepare(`
        INSERT INTO ip_monitor_events (
          event_id, ip_address, event_type, timestamp, details
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).bind(
                event.id,
                event.data.ip,
                event.data.event_type,
                event.data.timestamp,
                JSON.stringify(event.data.details)
            ).run();
        } catch (error) {
            console.error('[AsyncRecorder] Sync IP event failed:', error);
            throw error;
        }
    }

    /**
     * 同步记录地区事件
     */
    private async recordGeoEventSync(event: RecordingEvent): Promise<void> {
        try {
            await this.env.D1.prepare(`
        INSERT INTO geo_access_logs (
          event_id, country, action, timestamp, path
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `).bind(
                event.id,
                event.data.country,
                event.data.action,
                event.data.timestamp,
                event.data.path
            ).run();
        } catch (error) {
            console.error('[AsyncRecorder] Sync geo event failed:', error);
            throw error;
        }
    }

    /**
     * 生成事件 ID（幂等性保证）
     */
    private generateEventId(event: Omit<RecordingEvent, 'id'>): string {
        // 基于事件类型、时间戳、关键数据生成唯一 ID
        const key = `${event.type}:${event.timestamp}:${JSON.stringify(event.data)}`;

        // 简单哈希（生产环境可以用 crypto.subtle.digest）
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return `${event.type}_${Math.abs(hash)}_${event.timestamp}`;
    }

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.total > 0
                ? (this.stats.success / this.stats.total * 100).toFixed(2) + '%'
                : '0%',
            failedQueueSize: this.failedQueue.length
        };
    }

    /**
     * 重试失败的事件
     */
    async retryFailed(): Promise<void> {
        console.log(`[AsyncRecorder] Retrying ${this.failedQueue.length} failed events...`);

        const failed = [...this.failedQueue];
        this.failedQueue = [];

        for (const event of failed) {
            try {
                await this.sendToQueue(event);
                this.stats.success++;
            } catch (error) {
                this.failedQueue.push(event);
                console.error('[AsyncRecorder] Retry failed:', event.id, error);
            }
        }
    }
}

/**
 * 辅助函数：记录路径访问
 */
export async function recordPathAccess(
    c: Context<{ Bindings: Env }>,
    recorder: AsyncRecorder,
    data: {
        path: string;
        method: string;
        ip: string;
        country?: string;
    }
): Promise<void> {
    await recorder.record(c, {
        type: 'path_access',
        timestamp: Date.now(),
        data
    });
}

/**
 * 辅助函数：记录流量事件
 */
export async function recordTrafficEvent(
    c: Context<{ Bindings: Env }>,
    recorder: AsyncRecorder,
    data: {
        path: string;
        method: string;
        status: number;
        duration: number;
        ip: string;
        country?: string;
    }
): Promise<void> {
    await recorder.record(c, {
        type: 'traffic',
        timestamp: Date.now(),
        data: {
            ...data,
            event_date: new Date().toISOString().split('T')[0]
        }
    });
}

