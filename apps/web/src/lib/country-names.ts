/**
 * 国家代码映射工具
 * 
 * 提供国家代码（ISO 3166-1 alpha-2）到中文名称和国旗 emoji 的映射
 */

/**
 * 国家中文名称映射
 * ISO 3166-1 alpha-2 code → 中文名
 */
export const COUNTRY_NAMES: Record<string, string> = {
    // 东亚
    'CN': '中国',
    'JP': '日本',
    'KR': '韩国',
    'TW': '台湾',
    'HK': '香港',
    'MO': '澳门',
    'MN': '蒙古',

    // 东南亚
    'SG': '新加坡',
    'TH': '泰国',
    'VN': '越南',
    'MY': '马来西亚',
    'ID': '印度尼西亚',
    'PH': '菲律宾',
    'MM': '缅甸',
    'KH': '柬埔寨',
    'LA': '老挝',
    'BN': '文莱',
    'TL': '东帝汶',

    // 南亚
    'IN': '印度',
    'PK': '巴基斯坦',
    'BD': '孟加拉国',
    'LK': '斯里兰卡',
    'NP': '尼泊尔',
    'BT': '不丹',
    'MV': '马尔代夫',
    'AF': '阿富汗',

    // 中亚
    'KZ': '哈萨克斯坦',
    'UZ': '乌兹别克斯坦',
    'TM': '土库曼斯坦',
    'KG': '吉尔吉斯斯坦',
    'TJ': '塔吉克斯坦',

    // 西亚 / 中东
    'TR': '土耳其',
    'SA': '沙特阿拉伯',
    'AE': '阿联酋',
    'IL': '以色列',
    'IQ': '伊拉克',
    'IR': '伊朗',
    'JO': '约旦',
    'LB': '黎巴嫩',
    'SY': '叙利亚',
    'YE': '也门',
    'OM': '阿曼',
    'KW': '科威特',
    'BH': '巴林',
    'QA': '卡塔尔',
    'PS': '巴勒斯坦',
    'AM': '亚美尼亚',
    'AZ': '阿塞拜疆',
    'GE': '格鲁吉亚',
    'CY': '塞浦路斯',

    // 欧洲
    'GB': '英国',
    'FR': '法国',
    'DE': '德国',
    'IT': '意大利',
    'ES': '西班牙',
    'PT': '葡萄牙',
    'NL': '荷兰',
    'BE': '比利时',
    'CH': '瑞士',
    'AT': '奥地利',
    'SE': '瑞典',
    'NO': '挪威',
    'DK': '丹麦',
    'FI': '芬兰',
    'IS': '冰岛',
    'IE': '爱尔兰',
    'PL': '波兰',
    'CZ': '捷克',
    'SK': '斯洛伐克',
    'HU': '匈牙利',
    'RO': '罗马尼亚',
    'BG': '保加利亚',
    'GR': '希腊',
    'HR': '克罗地亚',
    'SI': '斯洛文尼亚',
    'RS': '塞尔维亚',
    'BA': '波黑',
    'MK': '北马其顿',
    'AL': '阿尔巴尼亚',
    'ME': '黑山',
    'XK': '科索沃',
    'UA': '乌克兰',
    'BY': '白俄罗斯',
    'MD': '摩尔多瓦',
    'RU': '俄罗斯',
    'EE': '爱沙尼亚',
    'LV': '拉脱维亚',
    'LT': '立陶宛',
    'LU': '卢森堡',
    'MT': '马耳他',
    'MC': '摩纳哥',
    'AD': '安道尔',
    'SM': '圣马力诺',
    'VA': '梵蒂冈',
    'LI': '列支敦士登',

    // 北美
    'US': '美国',
    'CA': '加拿大',
    'MX': '墨西哥',
    'GT': '危地马拉',
    'BZ': '伯利兹',
    'SV': '萨尔瓦多',
    'HN': '洪都拉斯',
    'NI': '尼加拉瓜',
    'CR': '哥斯达黎加',
    'PA': '巴拿马',

    // 南美
    'BR': '巴西',
    'AR': '阿根廷',
    'CL': '智利',
    'PE': '秘鲁',
    'CO': '哥伦比亚',
    'VE': '委内瑞拉',
    'EC': '厄瓜多尔',
    'BO': '玻利维亚',
    'PY': '巴拉圭',
    'UY': '乌拉圭',
    'GY': '圭亚那',
    'SR': '苏里南',
    'GF': '法属圭亚那',

    // 加勒比
    'CU': '古巴',
    'JM': '牙买加',
    'HT': '海地',
    'DO': '多米尼加',
    'TT': '特立尼达和多巴哥',
    'BS': '巴哈马',
    'BB': '巴巴多斯',
    'PR': '波多黎各',

    // 大洋洲
    'AU': '澳大利亚',
    'NZ': '新西兰',
    'FJ': '斐济',
    'PG': '巴布亚新几内亚',
    'NC': '新喀里多尼亚',
    'PF': '法属波利尼西亚',
    'GU': '关岛',
    'WS': '萨摩亚',
    'TO': '汤加',
    'VU': '瓦努阿图',
    'SB': '所罗门群岛',
    'KI': '基里巴斯',
    'FM': '密克罗尼西亚',
    'MH': '马绍尔群岛',
    'PW': '帕劳',
    'NR': '瑙鲁',
    'TV': '图瓦卢',

    // 非洲
    'ZA': '南非',
    'EG': '埃及',
    'NG': '尼日利亚',
    'KE': '肯尼亚',
    'ET': '埃塞俄比亚',
    'GH': '加纳',
    'TZ': '坦桑尼亚',
    'UG': '乌干达',
    'DZ': '阿尔及利亚',
    'MA': '摩洛哥',
    'TN': '突尼斯',
    'LY': '利比亚',
    'SD': '苏丹',
    'SS': '南苏丹',
    'SO': '索马里',
    'DJ': '吉布提',
    'ER': '厄立特里亚',
    'AO': '安哥拉',
    'MZ': '莫桑比克',
    'ZW': '津巴布韦',
    'BW': '博茨瓦纳',
    'NA': '纳米比亚',
    'ZM': '赞比亚',
    'MW': '马拉维',
    'MG': '马达加斯加',
    'MU': '毛里求斯',
    'SC': '塞舌尔',
    'CM': '喀麦隆',
    'CI': '科特迪瓦',
    'SN': '塞内加尔',
    'ML': '马里',
    'NE': '尼日尔',
    'BF': '布基纳法索',
    'TD': '乍得',
    'CF': '中非',
    'CG': '刚果（布）',
    'CD': '刚果（金）',
    'GA': '加蓬',
    'GQ': '赤道几内亚',
    'RW': '卢旺达',
    'BI': '布隆迪',
    'SL': '塞拉利昂',
    'LR': '利比里亚',
    'GM': '冈比亚',
    'GW': '几内亚比绍',
    'GN': '几内亚',
    'BJ': '贝宁',
    'TG': '多哥',
    'MR': '毛里塔尼亚',
};

/**
 * 国旗 Emoji 映射
 * ISO 3166-1 alpha-2 code → Flag Emoji
 */
export const COUNTRY_FLAGS: Record<string, string> = {
    // 东亚
    'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷', 'TW': '🇹🇼', 'HK': '🇭🇰', 'MO': '🇲🇴', 'MN': '🇲🇳',

    // 东南亚
    'SG': '🇸🇬', 'TH': '🇹🇭', 'VN': '🇻🇳', 'MY': '🇲🇾', 'ID': '🇮🇩', 'PH': '🇵🇭',
    'MM': '🇲🇲', 'KH': '🇰🇭', 'LA': '🇱🇦', 'BN': '🇧🇳', 'TL': '🇹🇱',

    // 南亚
    'IN': '🇮🇳', 'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰', 'NP': '🇳🇵', 'BT': '🇧🇹',
    'MV': '🇲🇻', 'AF': '🇦🇫',

    // 中亚
    'KZ': '🇰🇿', 'UZ': '🇺🇿', 'TM': '🇹🇲', 'KG': '🇰🇬', 'TJ': '🇹🇯',

    // 西亚/中东
    'TR': '🇹🇷', 'SA': '🇸🇦', 'AE': '🇦🇪', 'IL': '🇮🇱', 'IQ': '🇮🇶', 'IR': '🇮🇷',
    'JO': '🇯🇴', 'LB': '🇱🇧', 'SY': '🇸🇾', 'YE': '🇾🇪', 'OM': '🇴🇲', 'KW': '🇰🇼',
    'BH': '🇧🇭', 'QA': '🇶🇦', 'PS': '🇵🇸', 'AM': '🇦🇲', 'AZ': '🇦🇿', 'GE': '🇬🇪', 'CY': '🇨🇾',

    // 欧洲
    'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪', 'IT': '🇮🇹', 'ES': '🇪🇸', 'PT': '🇵🇹',
    'NL': '🇳🇱', 'BE': '🇧🇪', 'CH': '🇨🇭', 'AT': '🇦🇹', 'SE': '🇸🇪', 'NO': '🇳🇴',
    'DK': '🇩🇰', 'FI': '🇫🇮', 'IS': '🇮🇸', 'IE': '🇮🇪', 'PL': '🇵🇱', 'CZ': '🇨🇿',
    'SK': '🇸🇰', 'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬', 'GR': '🇬🇷', 'HR': '🇭🇷',
    'SI': '🇸🇮', 'RS': '🇷🇸', 'BA': '🇧🇦', 'MK': '🇲🇰', 'AL': '🇦🇱', 'ME': '🇲🇪',
    'XK': '🇽🇰', 'UA': '🇺🇦', 'BY': '🇧🇾', 'MD': '🇲🇩', 'RU': '🇷🇺', 'EE': '🇪🇪',
    'LV': '🇱🇻', 'LT': '🇱🇹', 'LU': '🇱🇺', 'MT': '🇲🇹', 'MC': '🇲🇨', 'AD': '🇦🇩',
    'SM': '🇸🇲', 'VA': '🇻🇦', 'LI': '🇱🇮',

    // 北美
    'US': '🇺🇸', 'CA': '🇨🇦', 'MX': '🇲🇽', 'GT': '🇬🇹', 'BZ': '🇧🇿', 'SV': '🇸🇻',
    'HN': '🇭🇳', 'NI': '🇳🇮', 'CR': '🇨🇷', 'PA': '🇵🇦',

    // 南美
    'BR': '🇧🇷', 'AR': '🇦🇷', 'CL': '🇨🇱', 'PE': '🇵🇪', 'CO': '🇨🇴', 'VE': '🇻🇪',
    'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 'UY': '🇺🇾', 'GY': '🇬🇾', 'SR': '🇸🇷', 'GF': '🇬🇫',

    // 加勒比
    'CU': '🇨🇺', 'JM': '🇯🇲', 'HT': '🇭🇹', 'DO': '🇩🇴', 'TT': '🇹🇹', 'BS': '🇧🇸',
    'BB': '🇧🇧', 'PR': '🇵🇷',

    // 大洋洲
    'AU': '🇦🇺', 'NZ': '🇳🇿', 'FJ': '🇫🇯', 'PG': '🇵🇬', 'NC': '🇳🇨', 'PF': '🇵🇫',
    'GU': '🇬🇺', 'WS': '🇼🇸', 'TO': '🇹🇴', 'VU': '🇻🇺', 'SB': '🇸🇧', 'KI': '🇰🇮',
    'FM': '🇫🇲', 'MH': '🇲🇭', 'PW': '🇵🇼', 'NR': '🇳🇷', 'TV': '🇹🇻',

    // 非洲
    'ZA': '🇿🇦', 'EG': '🇪🇬', 'NG': '🇳🇬', 'KE': '🇰🇪', 'ET': '🇪🇹', 'GH': '🇬🇭',
    'TZ': '🇹🇿', 'UG': '🇺🇬', 'DZ': '🇩🇿', 'MA': '🇲🇦', 'TN': '🇹🇳', 'LY': '🇱🇾',
    'SD': '🇸🇩', 'SS': '🇸🇸', 'SO': '🇸🇴', 'DJ': '🇩🇯', 'ER': '🇪🇷', 'AO': '🇦🇴',
    'MZ': '🇲🇿', 'ZW': '🇿🇼', 'BW': '🇧🇼', 'NA': '🇳🇦', 'ZM': '🇿🇲', 'MW': '🇲🇼',
    'MG': '🇲🇬', 'MU': '🇲🇺', 'SC': '🇸🇨', 'CM': '🇨🇲', 'CI': '🇨🇮', 'SN': '🇸🇳',
    'ML': '🇲🇱', 'NE': '🇳🇪', 'BF': '🇧🇫', 'TD': '🇹🇩', 'CF': '🇨🇫', 'CG': '🇨🇬',
    'CD': '🇨🇩', 'GA': '🇬🇦', 'GQ': '🇬🇶', 'RW': '🇷🇼', 'BI': '🇧🇮', 'SL': '🇸🇱',
    'LR': '🇱🇷', 'GM': '🇬🇲', 'GW': '🇬🇼', 'GN': '🇬🇳', 'BJ': '🇧🇯', 'TG': '🇹🇬', 'MR': '🇲🇷',
};

/**
 * 获取国家的中文名称
 * @param code 国家代码（ISO 3166-1 alpha-2）
 * @returns 中文名称，如果未找到则返回代码本身
 */
export function getCountryName(code: string): string {
    const upperCode = code.toUpperCase();
    return COUNTRY_NAMES[upperCode] || upperCode;
}

/**
 * 获取国家的国旗 emoji
 * @param code 国家代码（ISO 3166-1 alpha-2）
 * @returns 国旗 emoji，如果未找到则返回地球 emoji
 */
export function getCountryFlag(code: string): string {
    const upperCode = code.toUpperCase();
    return COUNTRY_FLAGS[upperCode] || '🌍';
}

/**
 * 获取国家的完整显示名称（国旗 + 中文名）
 * @param code 国家代码（ISO 3166-1 alpha-2）
 * @returns 格式：🇨🇳 中国
 */
export function getCountryDisplay(code: string): string {
    const upperCode = code.toUpperCase();
    const flag = getCountryFlag(upperCode);
    const name = getCountryName(upperCode);
    return `${flag} ${name}`;
}

/**
 * 搜索国家（按名称或代码）
 * @param query 搜索关键词
 * @returns 匹配的国家代码列表
 */
export function searchCountries(query: string): string[] {
    if (!query) return [];

    const lowerQuery = query.toLowerCase();
    const upperQuery = query.toUpperCase();

    return Object.keys(COUNTRY_NAMES).filter(code => {
        const name = COUNTRY_NAMES[code];
        return (
            code.toUpperCase().includes(upperQuery) ||
            name.includes(query) ||
            name.toLowerCase().includes(lowerQuery)
        );
    });
}

/**
 * 按大洲分组国家
 */
export const COUNTRIES_BY_CONTINENT = {
    '亚洲': [
        'CN', 'JP', 'KR', 'TW', 'HK', 'MO', 'MN', // 东亚
        'SG', 'TH', 'VN', 'MY', 'ID', 'PH', 'MM', 'KH', 'LA', 'BN', 'TL', // 东南亚
        'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF', // 南亚
        'KZ', 'UZ', 'TM', 'KG', 'TJ', // 中亚
        'TR', 'SA', 'AE', 'IL', 'IQ', 'IR', 'JO', 'LB', 'SY', 'YE', 'OM', 'KW', 'BH', 'QA', 'PS', 'AM', 'AZ', 'GE', 'CY', // 西亚
    ],
    '欧洲': [
        'GB', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'IS', 'IE',
        'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'RS', 'BA', 'MK', 'AL', 'ME', 'XK',
        'UA', 'BY', 'MD', 'RU', 'EE', 'LV', 'LT', 'LU', 'MT', 'MC', 'AD', 'SM', 'VA', 'LI',
    ],
    '北美洲': ['US', 'CA', 'MX', 'GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA'],
    '南美洲': ['BR', 'AR', 'CL', 'PE', 'CO', 'VE', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF'],
    '大洋洲': ['AU', 'NZ', 'FJ', 'PG', 'NC', 'PF', 'GU', 'WS', 'TO', 'VU', 'SB', 'KI', 'FM', 'MH', 'PW', 'NR', 'TV'],
    '非洲': [
        'ZA', 'EG', 'NG', 'KE', 'ET', 'GH', 'TZ', 'UG', 'DZ', 'MA', 'TN', 'LY', 'SD', 'SS', 'SO', 'DJ', 'ER',
        'AO', 'MZ', 'ZW', 'BW', 'NA', 'ZM', 'MW', 'MG', 'MU', 'SC', 'CM', 'CI', 'SN', 'ML', 'NE', 'BF',
        'TD', 'CF', 'CG', 'CD', 'GA', 'GQ', 'RW', 'BI', 'SL', 'LR', 'GM', 'GW', 'GN', 'BJ', 'TG', 'MR',
    ],
};

