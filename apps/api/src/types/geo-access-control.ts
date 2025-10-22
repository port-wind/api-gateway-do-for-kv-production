/**
 * 地区访问控制类型定义
 */

/**
 * 地区访问规则
 */
export interface GeoAccessRule {
    id: string;                      // 规则唯一 ID
    name: string;                    // 规则名称（如 "禁止高风险地区"）
    enabled: boolean;                // 是否启用
    mode: 'allow' | 'block' | 'throttle'; // 模式：白名单/黑名单/限流
    priority: number;                // 优先级（数字越小越优先）

    // 作用域（MVP 仅支持 global）
    scope: 'global' | 'path';        // 作用域：全局或路径级
    path?: string;                   // 路径（scope='path' 时必需）

    // 地区匹配配置
    geoMatch: {
        type: 'country' | 'continent' | 'custom' | 'city'; // 匹配类型（新增 city）
        countries?: string[];          // 国家代码列表（如 ['CN', 'US', 'RU']）
        continents?: string[];         // 大洲代码（如 ['AS', 'EU']）
        customGroups?: string[];       // 自定义地区组（如 'high-risk-regions'）
        cities?: string[];             // 城市列表（标准化名称，如 ['Beijing', 'Shanghai', 'New York']）
    };

    // 限流配置（仅 mode='throttle' 时有效，MVP 暂不支持）
    throttleConfig?: {
        maxRequests: number;           // 最大请求数
        windowSeconds: number;         // 时间窗口（秒）
        action: 'delay' | 'reject';    // 超限后动作
    };

    // 响应配置
    response?: {
        statusCode?: number;           // HTTP 状态码（默认 403）
        message?: string;              // 错误消息
        headers?: Record<string, string>; // 自定义响应头
    };

    // 元数据
    metadata: {
        createdAt: string;             // ISO 8601 时间戳
        updatedAt: string;             // ISO 8601 时间戳
        createdBy?: string;            // 创建者
        comment?: string;              // 规则说明
    };
}

/**
 * 地区规则集合
 */
export interface GeoRuleSet {
    version: number;                 // 配置版本
    defaultAction: 'allow' | 'block'; // 默认动作（规则都不匹配时）
    rules: GeoAccessRule[];          // 规则列表（按 priority 排序）
    lastModified: number;            // 最后修改时间戳（Unix 毫秒）
}

/**
 * 自定义地区组（Phase 2 功能）
 */
export interface CustomGeoGroup {
    name: string;                    // 组名（如 'high-risk-regions'）
    description: string;             // 描述
    countries: string[];             // 包含的国家代码列表
    createdAt: string;               // ISO 8601 时间戳
    updatedAt: string;               // ISO 8601 时间戳
}

/**
 * 预定义地区组
 */
export const PRESET_GEO_GROUPS: Record<string, { name: string; countries: string[]; description: string }> = {
    'high-risk': {
        name: '高风险地区',
        countries: ['AF', 'IQ', 'SY', 'KP', 'IR', 'LY', 'SO', 'YE'],
        description: '国际制裁或高安全风险地区'
    },
    'gdpr': {
        name: 'GDPR 适用国家',
        countries: [
            'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
            'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
            'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
        ],
        description: '欧盟 GDPR 适用国家'
    },
    'asia-pacific': {
        name: '亚太地区',
        countries: ['CN', 'JP', 'KR', 'SG', 'TH', 'VN', 'IN', 'ID', 'MY', 'PH', 'AU', 'NZ'],
        description: '亚洲和太平洋地区'
    },
    'mainland-china': {
        name: '中国大陆',
        countries: ['CN'],
        description: '中国大陆地区'
    }
};

/**
 * 国家代码到大洲的映射表（部分常用国家）
 */
export const COUNTRY_TO_CONTINENT: Record<string, string> = {
    // 亚洲
    'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'IN': 'AS', 'ID': 'AS', 'TH': 'AS',
    'VN': 'AS', 'PH': 'AS', 'MY': 'AS', 'SG': 'AS', 'BD': 'AS', 'PK': 'AS',
    'TR': 'AS', 'SA': 'AS', 'AE': 'AS', 'IL': 'AS', 'IQ': 'AS', 'IR': 'AS',

    // 欧洲
    'GB': 'EU', 'DE': 'EU', 'FR': 'EU', 'IT': 'EU', 'ES': 'EU', 'PL': 'EU',
    'RO': 'EU', 'NL': 'EU', 'BE': 'EU', 'CZ': 'EU', 'GR': 'EU', 'PT': 'EU',
    'SE': 'EU', 'HU': 'EU', 'AT': 'EU', 'CH': 'EU', 'NO': 'EU', 'DK': 'EU',
    'FI': 'EU', 'SK': 'EU', 'IE': 'EU', 'HR': 'EU', 'BG': 'EU', 'LT': 'EU',

    // 北美洲
    'US': 'NA', 'CA': 'NA', 'MX': 'NA',

    // 南美洲
    'BR': 'SA', 'AR': 'SA', 'CO': 'SA', 'CL': 'SA', 'PE': 'SA', 'VE': 'SA',

    // 非洲
    'ZA': 'AF', 'EG': 'AF', 'NG': 'AF', 'KE': 'AF', 'ET': 'AF', 'TZ': 'AF',

    // 大洋洲
    'AU': 'OC', 'NZ': 'OC',
};

/**
 * 地区访问控制动作
 */
export type GeoAction = 'allowed' | 'blocked' | 'throttled';

