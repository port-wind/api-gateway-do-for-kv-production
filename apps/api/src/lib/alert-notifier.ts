import type { Env } from '../types/env';

interface AlertNotificationOptions {
    dedupeKey: string;
    webhookUrl?: string;
    message: string;
    cooldownSeconds?: number;
}

/**
 * 发送 Lark 文本告警（带去重与冷却时间）
 */
export async function sendAlertNotification(
    env: Env,
    {
        dedupeKey,
        webhookUrl,
        message,
        cooldownSeconds = 600,
    }: AlertNotificationOptions
): Promise<void> {
    if (!webhookUrl) {
        return;
    }

    const key = `alert:last:${dedupeKey}`;
    try {
        const lastSent = await env.API_GATEWAY_STORAGE.get(key);
        const now = Date.now();

        if (lastSent) {
            const delta = now - Number(lastSent);
            if (!Number.isNaN(delta) && delta < cooldownSeconds * 1000) {
                console.log(`[Alert] Skip sending ${dedupeKey}, cooldown ${cooldownSeconds}s not elapsed`);
                return;
            }
        }

        const payload = {
            msg_type: 'text',
            content: {
                text: message,
            },
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[Alert] Failed to send notification ${dedupeKey}:`, response.status, text);
        } else {
            console.log(`[Alert] Notification sent for ${dedupeKey}`);
            await env.API_GATEWAY_STORAGE.put(key, String(Date.now()), {
                expirationTtl: cooldownSeconds,
            });
        }
    } catch (error) {
        console.error(`[Alert] Error sending notification ${dedupeKey}:`, error);
    }
}

