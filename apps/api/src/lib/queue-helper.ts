import type { Env } from '../types/env';

/**
 * 队列辅助函数
 * 
 * 处理队列绑定可能不存在的情况（如本地开发环境）
 */

/**
 * 检查队列是否可用
 * 
 * 同时检查：
 * 1. 队列绑定是否存在（env.TRAFFIC_QUEUE）
 * 2. 环境变量是否启用（USE_TRAFFIC_QUEUE）
 */
export function isQueueAvailable(env: Env): boolean {
    // 检查环境变量是否启用队列
    if (env.USE_TRAFFIC_QUEUE !== 'true') {
        return false;
    }

    // 检查队列绑定是否存在
    return env.TRAFFIC_QUEUE !== undefined && env.TRAFFIC_QUEUE !== null;
}

/**
 * 安全地发送消息到队列
 * 
 * @param env 环境变量
 * @param message 消息内容
 * @returns 是否成功发送
 * 
 * @example
 * const success = await safeSendToQueue(env, event);
 * if (!success) {
 *   // 降级到其他方案
 *   await fallbackMethod(event);
 * }
 */
export async function safeSendToQueue<T = any>(
    env: Env,
    message: T
): Promise<boolean> {
    // 检查队列是否可用
    if (!isQueueAvailable(env)) {
        console.warn('⚠️ TRAFFIC_QUEUE 不可用（可能是本地开发环境）');
        return false;
    }

    try {
        await env.TRAFFIC_QUEUE.send(message);
        return true;
    } catch (error) {
        console.error('❌ 队列发送失败:', error);
        return false;
    }
}

/**
 * 安全地批量发送消息到队列
 * 
 * @param env 环境变量
 * @param messages 消息数组
 * @returns 是否成功发送
 */
export async function safeSendBatchToQueue<T = any>(
    env: Env,
    messages: T[]
): Promise<boolean> {
    if (!isQueueAvailable(env)) {
        console.warn('⚠️ TRAFFIC_QUEUE 不可用（可能是本地开发环境）');
        return false;
    }

    if (messages.length === 0) {
        return true;
    }

    try {
        await env.TRAFFIC_QUEUE.sendBatch(messages.map(body => ({ body })));
        return true;
    } catch (error) {
        console.error('❌ 队列批量发送失败:', error);
        return false;
    }
}

/**
 * 获取队列统计信息（用于监控）
 */
export interface QueueStats {
    available: boolean;
    environment: 'production' | 'development' | 'unknown';
}

export function getQueueStats(env: Env): QueueStats {
    const available = isQueueAvailable(env);

    // 通过队列可用性和环境变量判断环境
    let environment: QueueStats['environment'] = 'unknown';
    if (!available) {
        environment = 'development'; // 队列不可用，可能是本地开发
    } else {
        environment = 'production'; // 队列可用，应该是生产环境
    }

    return {
        available,
        environment,
    };
}

