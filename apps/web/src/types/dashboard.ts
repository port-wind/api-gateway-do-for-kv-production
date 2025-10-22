/**
 * Dashboard 数据类型定义
 */

export interface DashboardOverview {
    traffic: {
        totalRequests24h: number;
        currentRpm: number;
        peakRpm: number;
        activeIPs24h: number;
        trendVsPrevDay: number;
    };
    reliability: {
        cacheHitRate: number;
        errorRate: number;
        avgResponseTime: number | null;
        p95ResponseTime: number | null;
    };
    configuration: {
        totalPaths: number;
        pathsWithCache: number;
        pathsWithRateLimit: number;
        pathsWithGeo: number;
    };
    topPaths: TopPathItem[];
    timestamp: number;
    degraded?: boolean;
    errors?: string[];
}

export interface TopPathItem {
    path: string;
    requests: number;
    errors: number;
    errorRate: number;
}

export interface TimeseriesDataPoint {
    timestamp: string;
    value: number;
    label: string;
}

export interface TimeseriesResponse {
    dataPoints: TimeseriesDataPoint[];
    summary: {
        total: number;
        avg: number;
        max: number;
        min: number;
    };
    actualRange?: string;
    warning?: string;
}

export interface RateLimitStats {
    pathsWithRateLimit: number;
    globalRulesCount: number;
    placeholder?: {
        note: string;
        estimatedCompletion: string;
    };
}

/**
 * 实时地图数据类型
 */
export interface RealtimeEvent {
    clientCountry: string;
    clientCoords: [number, number];
    edgeColo: string;
    edgeCoords: [number, number];
    requestCount: number;
    errorCount: number;
    isError: boolean;
}

export interface EdgeNode {
    colo: string;
    coords: [number, number];
    requestCount: number;
}

export interface RealtimeMapData {
    success: boolean;
    events: RealtimeEvent[];
    edgeNodes: EdgeNode[];
    timestamp: number;
    dataSource: 'cache' | 'realtime';
}

/**
 * 告警接口
 */
export interface Alert {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    value: string | number;
    timestamp: number;
    link?: string;
}

export interface AlertsResponse {
    success: boolean;
    alerts: Alert[];
    summary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
    };
    timestamp: number;
}

