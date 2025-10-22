/**
 * 城市工具函数
 * 
 * 提供城市名称标准化、别名解析等功能
 */

import { CITY_COORDS, getCityCoords } from './geo-city-coords';
import { CITY_ALIASES, resolveCityAlias } from './geo-city-aliases';

/**
 * 城市名称规范化规则（必须按顺序执行）
 * 
 * 作用：将各种格式的城市名称统一为标准格式
 * 
 * @example
 * normalizeCityName("  são PAULO  ") // => "Sao Paulo"
 * normalizeCityName("new york") // => "New York"
 * normalizeCityName("BEIJING") // => "Beijing"
 * 
 * @param input 原始城市名称
 * @returns 标准化后的城市名称
 */
export function normalizeCityName(input: string | undefined | null): string {
    if (!input) return '';

    return input
        .trim()                           // 1. 去除首尾空格
        .normalize('NFKD')                // 2. Unicode 规范化（分解重音符号）
        .replace(/[\u0300-\u036f]/g, '') // 3. 移除重音符号（São → Sao）
        .toLowerCase()                     // 4. 全小写
        .split(/\s+/)                      // 5. 按空格拆分（支持多个空格）
        .filter(word => word.length > 0)   // 5.5. 过滤空字符串
        .map(word =>                       // 6. 每个单词首字母大写
            word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(' ');                        // 7. 重新拼接
}

/**
 * 测试用例（用于单元测试）
 */
export const CITY_TEST_CASES = [
    // 基础测试
    { input: 'beijing', expected: 'Beijing', country: 'CN' },
    { input: 'BEIJING', expected: 'Beijing', country: 'CN' },
    { input: 'BeIjInG', expected: 'Beijing', country: 'CN' },

    // 空格处理
    { input: '  new york  ', expected: 'New York', country: 'US' },
    { input: 'new  york', expected: 'New York', country: 'US' },

    // 重音符号
    { input: 'São Paulo', expected: 'Sao Paulo', country: 'BR' },
    { input: 'são paulo', expected: 'Sao Paulo', country: 'BR' },
    { input: 'Zürich', expected: 'Zurich', country: 'CH' },

    // 多单词
    { input: 'ho chi minh city', expected: 'Ho Chi Minh City', country: 'VN' },
    { input: 'LOS ANGELES', expected: 'Los Angeles', country: 'US' },

    // 空值
    { input: '', expected: '', country: '' },
    { input: '   ', expected: '', country: '' },
];

/**
 * 解析城市名称（标准化 + 别名解析）
 * 
 * 流程：
 * 1. 标准化输入
 * 2. 检查别名映射
 * 3. 返回最终的标准名称
 * 
 * @param rawCityName 原始城市名称（可能是别名、大小写不统一等）
 * @returns 标准化的城市名称
 * 
 * @example
 * parseCityName("NYC") // => "New York"
 * parseCityName("北京") // => "Beijing"
 * parseCityName("são PAULO") // => "Sao Paulo"
 */
export function parseCityName(rawCityName: string | undefined | null): string {
    if (!rawCityName) return '';

    // 步骤 1: 标准化
    const normalized = normalizeCityName(rawCityName);

    // 步骤 2: 别名解析
    const standardName = resolveCityAlias(normalized);

    return standardName;
}

/**
 * 检查城市是否在 Tier 1 列表中
 * 
 * @param cityName 城市名称（已标准化）
 * @returns 是否在 Tier 1 列表中
 */
export function isTier1City(cityName: string): boolean {
    return cityName in CITY_COORDS;
}

/**
 * 获取城市完整信息
 * 
 * @param cityName 城市名称（原始或标准化）
 * @returns 城市信息（包含坐标、国家、人口等）或 undefined
 */
export function getCityInfo(cityName: string) {
    const standardName = parseCityName(cityName);
    return CITY_COORDS[standardName];
}

