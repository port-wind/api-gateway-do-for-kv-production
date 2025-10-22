import type { Env } from '../types/env';

export interface ThresholdSetting {
    enabled: boolean;
    threshold: number;
}

export interface IpMonitorAlertConfig {
    webhookUrl?: string;
    cooldownMinutes?: number;
    globalRps?: ThresholdSetting; // 阈值单位：请求/秒
    ipSpike?: ThresholdSetting;   // 阈值单位：请求数（按天聚合）
}

export interface IpMonitorConfig {
    retentionDays: number;
    alerts: IpMonitorAlertConfig;
}

const DEFAULT_ALERT_CONFIG: IpMonitorAlertConfig = {
    webhookUrl: '',
    cooldownMinutes: 10,
    globalRps: {
        enabled: false,
        threshold: 0,
    },
    ipSpike: {
        enabled: false,
        threshold: 0,
    },
};

const DEFAULT_CONFIG: IpMonitorConfig = {
    retentionDays: 7,
    alerts: DEFAULT_ALERT_CONFIG,
};

function normalizeThreshold(setting?: ThresholdSetting): ThresholdSetting {
    if (!setting) {
        return {
            enabled: false,
            threshold: 0,
        };
    }

    return {
        enabled: Boolean(setting.enabled),
        threshold: Number(setting.threshold) || 0,
    };
}

export function normalizeAlertConfig(alerts?: Partial<IpMonitorAlertConfig>): IpMonitorAlertConfig {
    const normalized = alerts ?? {};
    const cooldownMinutes = normalized.cooldownMinutes !== undefined
        ? Math.max(1, Math.min(60, Number(normalized.cooldownMinutes) || DEFAULT_ALERT_CONFIG.cooldownMinutes!))
        : DEFAULT_ALERT_CONFIG.cooldownMinutes!;

    const webhookUrl = normalized.webhookUrl?.trim() || '';

    return {
        webhookUrl,
        cooldownMinutes,
        globalRps: normalizeThreshold(normalized.globalRps),
        ipSpike: normalizeThreshold(normalized.ipSpike),
    };
}

export function mergeConfig(base: IpMonitorConfig, patch?: Partial<IpMonitorConfig>): IpMonitorConfig {
    if (!patch) return base;

    return {
        retentionDays: patch.retentionDays !== undefined
            ? Math.max(1, Math.min(30, Number(patch.retentionDays) || base.retentionDays))
            : base.retentionDays,
        alerts: normalizeAlertConfig(patch.alerts),
    };
}

export async function loadIpMonitorConfig(env: Env): Promise<IpMonitorConfig> {
    const stored = await env.API_GATEWAY_STORAGE.get('ip-monitor:config', 'json') as Partial<IpMonitorConfig> | null;
    let config: IpMonitorConfig;

    if (stored && typeof stored === 'object') {
        config = mergeConfig(DEFAULT_CONFIG, stored);
    } else {
        config = { ...DEFAULT_CONFIG };
    }

    // 向后兼容旧的 retention-days 配置
    if (!stored || stored.retentionDays === undefined) {
        const legacyRetention = await env.API_GATEWAY_STORAGE.get('ip-monitor:retention-days');
        if (legacyRetention) {
            const days = parseInt(legacyRetention, 10);
            if (!Number.isNaN(days)) {
                config.retentionDays = Math.max(1, Math.min(30, days));
            }
        }
    }

    return config;
}

export async function saveIpMonitorConfig(env: Env, config: IpMonitorConfig): Promise<void> {
    const normalized = mergeConfig(DEFAULT_CONFIG, config);
    await env.API_GATEWAY_STORAGE.put('ip-monitor:config', JSON.stringify(normalized));
    // 兼容旧逻辑：单独保存保留天数
    await env.API_GATEWAY_STORAGE.put('ip-monitor:retention-days', normalized.retentionDays.toString());
}

export function getAlertWebhook(config: IpMonitorConfig): string | undefined {
    const url = config.alerts?.webhookUrl?.trim();
    if (!url) return undefined;
    return url;
}

export function getAlertCooldownSeconds(config: IpMonitorConfig): number {
    const minutes = config.alerts?.cooldownMinutes ?? DEFAULT_ALERT_CONFIG.cooldownMinutes!;
    return Math.max(1, minutes) * 60;
}

