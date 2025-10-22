/**
 * 地理坐标映射表
 * 用于实时地图可视化：国家代码 → 坐标，Cloudflare COLO → 坐标
 */

/**
 * 国家代码 → 中心坐标映射（ISO 3166-1 alpha-2）
 * 格式：[经度, 纬度]
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
    // 亚洲 - 东亚
    'CN': [104.1954, 35.8617],  // 中国
    'JP': [138.2529, 36.2048],  // 日本
    'KR': [127.7669, 35.9078],  // 韩国
    'TW': [120.9605, 23.6978],  // 台湾
    'HK': [114.1095, 22.3964],  // 香港
    'MO': [113.5439, 22.1987],  // 澳门

    // 亚洲 - 东南亚
    'SG': [103.8198, 1.3521],   // 新加坡
    'MY': [101.9758, 4.2105],   // 马来西亚
    'TH': [100.9925, 15.8700],  // 泰国
    'VN': [108.2772, 14.0583],  // 越南
    'KH': [104.9910, 12.5657],  // 柬埔寨
    'PH': [121.7740, 12.8797],  // 菲律宾
    'ID': [113.9213, -0.7893],  // 印度尼西亚

    // 亚洲 - 南亚
    'IN': [78.9629, 20.5937],   // 印度
    'PK': [69.3451, 30.3753],   // 巴基斯坦
    'BD': [90.3563, 23.6850],   // 孟加拉国
    'LK': [80.7718, 7.8731],    // 斯里兰卡

    // 北美
    'US': [-95.7129, 37.0902],  // 美国
    'CA': [-106.3468, 56.1304], // 加拿大
    'MX': [-102.5528, 23.6345], // 墨西哥

    // 欧洲 - 西欧
    'GB': [-3.4360, 55.3781],   // 英国
    'FR': [2.2137, 46.2276],    // 法国
    'DE': [10.4515, 51.1657],   // 德国
    'NL': [5.2913, 52.1326],    // 荷兰
    'BE': [4.4699, 50.5039],    // 比利时
    'CH': [8.2275, 46.8182],    // 瑞士
    'AT': [14.5501, 47.5162],   // 奥地利

    // 欧洲 - 南欧
    'IT': [12.5674, 41.8719],   // 意大利
    'ES': [-3.7492, 40.4637],   // 西班牙
    'PT': [-8.2245, 39.3999],   // 葡萄牙
    'GR': [21.8243, 39.0742],   // 希腊

    // 欧洲 - 北欧
    'SE': [18.6435, 60.1282],   // 瑞典
    'NO': [8.4689, 60.4720],    // 挪威
    'FI': [25.7482, 61.9241],   // 芬兰
    'DK': [9.5018, 56.2639],    // 丹麦

    // 欧洲 - 东欧
    'PL': [19.1451, 51.9194],   // 波兰
    'RU': [105.3188, 61.5240],  // 俄罗斯
    'UA': [31.1656, 48.3794],   // 乌克兰
    'CZ': [15.4730, 49.8175],   // 捷克

    // 大洋洲
    'AU': [133.7751, -25.2744], // 澳大利亚
    'NZ': [174.8860, -40.9006], // 新西兰

    // 南美
    'BR': [-51.9253, -14.2350], // 巴西
    'AR': [-63.6167, -38.4161], // 阿根廷
    'CL': [-71.5430, -35.6751], // 智利
    'CO': [-74.2973, 4.5709],   // 哥伦比亚

    // 中东
    'AE': [53.8478, 23.4241],   // 阿联酋
    'SA': [45.0792, 23.8859],   // 沙特阿拉伯
    'IL': [34.8516, 31.0461],   // 以色列
    'TR': [35.2433, 38.9637],   // 土耳其

    // 非洲
    'ZA': [22.9375, -30.5595],  // 南非
    'EG': [30.8025, 26.8206],   // 埃及
    'NG': [8.6753, 9.0820],     // 尼日利亚
    'KE': [37.9062, -0.0236],   // 肯尼亚
};

/**
 * Cloudflare 边缘节点（COLO）代码 → 坐标映射
 * 数据来源: https://www.cloudflarestatus.com/
 * 格式：[经度, 纬度]
 */
export const COLO_COORDS: Record<string, [number, number]> = {
    // 北美 - 美国西部
    'SJC': [-121.9, 37.3],   // San Jose, California
    'LAX': [-118.4, 33.9],   // Los Angeles, California
    'SEA': [-122.3, 47.4],   // Seattle, Washington
    'PDX': [-122.6, 45.6],   // Portland, Oregon
    'PHX': [-112.0, 33.4],   // Phoenix, Arizona
    'SLC': [-111.9, 40.8],   // Salt Lake City, Utah
    'DEN': [-104.7, 39.9],   // Denver, Colorado

    // 北美 - 美国中部
    'ORD': [-87.9, 41.9],    // Chicago, Illinois
    'DFW': [-97.0, 32.9],    // Dallas, Texas
    'IAH': [-95.3, 29.9],    // Houston, Texas
    'MCI': [-94.7, 39.3],    // Kansas City, Missouri
    'MSP': [-93.2, 44.9],    // Minneapolis, Minnesota

    // 北美 - 美国东部
    'IAD': [-77.4, 38.9],    // Washington DC (Dulles)
    'ATL': [-84.4, 33.6],    // Atlanta, Georgia
    'MIA': [-80.3, 25.8],    // Miami, Florida
    'EWR': [-74.2, 40.7],    // Newark, New Jersey
    'JFK': [-73.8, 40.6],    // New York, New York
    'BOS': [-71.0, 42.4],    // Boston, Massachusetts

    // 北美 - 加拿大
    'YUL': [-73.7, 45.5],    // Montreal, Quebec
    'YYZ': [-79.6, 43.7],    // Toronto, Ontario
    'YVR': [-123.2, 49.2],   // Vancouver, British Columbia

    // 欧洲 - 西欧
    'LHR': [-0.45, 51.5],    // London, UK
    'CDG': [2.55, 49.0],     // Paris, France
    'FRA': [8.57, 50.0],     // Frankfurt, Germany
    'AMS': [4.76, 52.3],     // Amsterdam, Netherlands
    'BRU': [4.48, 50.9],     // Brussels, Belgium
    'ZRH': [8.56, 47.5],     // Zurich, Switzerland
    'GVA': [6.13, 46.2],     // Geneva, Switzerland

    // 欧洲 - 南欧
    'MAD': [-3.57, 40.5],    // Madrid, Spain
    'BCN': [2.08, 41.3],     // Barcelona, Spain
    'MXP': [8.72, 45.6],     // Milan, Italy
    'FCO': [12.2, 41.8],     // Rome, Italy
    'ATH': [23.9, 37.9],     // Athens, Greece

    // 欧洲 - 北欧
    'ARN': [17.9, 59.6],     // Stockholm, Sweden
    'CPH': [12.6, 55.6],     // Copenhagen, Denmark
    'HEL': [24.9, 60.3],     // Helsinki, Finland
    'OSL': [11.1, 60.2],     // Oslo, Norway

    // 欧洲 - 东欧
    'WAW': [20.9, 52.2],     // Warsaw, Poland
    'PRG': [14.3, 50.1],     // Prague, Czech Republic
    'VIE': [16.6, 48.1],     // Vienna, Austria
    'BUD': [19.3, 47.4],     // Budapest, Hungary

    // 亚洲 - 东亚
    'NRT': [140.4, 35.8],    // Tokyo Narita, Japan
    'HND': [139.8, 35.5],    // Tokyo Haneda, Japan
    'KIX': [135.2, 34.4],    // Osaka, Japan
    'ICN': [126.4, 37.5],    // Seoul, South Korea
    'HKG': [113.9, 22.3],    // Hong Kong
    'TPE': [121.2, 25.1],    // Taipei, Taiwan

    // 亚洲 - 东南亚
    'SIN': [103.9, 1.35],    // Singapore
    'KUL': [101.7, 3.1],     // Kuala Lumpur, Malaysia
    'BKK': [100.7, 13.7],    // Bangkok, Thailand
    'CGK': [106.7, -6.1],    // Jakarta, Indonesia
    'MNL': [121.0, 14.5],    // Manila, Philippines
    'SGN': [106.7, 10.8],    // Ho Chi Minh City, Vietnam
    'HAN': [105.8, 21.2],    // Hanoi, Vietnam

    // 亚洲 - 南亚
    'BOM': [72.9, 19.1],     // Mumbai, India
    'DEL': [77.1, 28.6],     // New Delhi, India
    'BLR': [77.7, 13.2],     // Bangalore, India
    'HYD': [78.4, 17.2],     // Hyderabad, India
    'MAA': [80.2, 13.1],     // Chennai, India

    // 中国大陆（注意：Cloudflare 中国节点数据可能受限）
    'PEK': [116.4, 39.9],    // Beijing
    'PVG': [121.8, 31.1],    // Shanghai
    'CAN': [113.3, 23.4],    // Guangzhou
    'CTU': [104.0, 30.6],    // Chengdu
    'SZX': [113.9, 22.6],    // Shenzhen

    // 大洋洲
    'SYD': [151.2, -33.9],   // Sydney, Australia
    'MEL': [144.8, -37.7],   // Melbourne, Australia
    'BNE': [153.1, -27.4],   // Brisbane, Australia
    'PER': [115.9, -31.9],   // Perth, Australia
    'AKL': [174.8, -37.0],   // Auckland, New Zealand

    // 南美
    'GRU': [-46.6, -23.4],   // São Paulo, Brazil
    'GIG': [-43.2, -22.8],   // Rio de Janeiro, Brazil
    'EZE': [-58.5, -34.8],   // Buenos Aires, Argentina
    'SCL': [-70.8, -33.4],   // Santiago, Chile
    'BOG': [-74.1, 4.7],     // Bogotá, Colombia
    'LIM': [-77.0, -12.0],   // Lima, Peru

    // 中东
    'DXB': [55.4, 25.3],     // Dubai, UAE
    'BAH': [50.6, 26.3],     // Bahrain
    'TLV': [34.9, 32.0],     // Tel Aviv, Israel
    'DOH': [51.6, 25.3],     // Doha, Qatar
    'JED': [39.2, 21.7],     // Jeddah, Saudi Arabia

    // 非洲
    'JNB': [28.2, -26.1],    // Johannesburg, South Africa
    'CPT': [18.6, -33.9],    // Cape Town, South Africa
    'CAI': [31.4, 30.1],     // Cairo, Egypt
    'NBO': [36.9, -1.3],     // Nairobi, Kenya
    'LOS': [3.3, 6.5],       // Lagos, Nigeria
};

/**
 * 获取国家中心坐标
 * @param countryCode ISO 3166-1 alpha-2 国家代码（如 'CN', 'US'）
 * @returns [经度, 纬度] 或 [0, 0]（未知国家）
 */
export function getCountryCoords(countryCode: string | null): [number, number] {
    if (!countryCode) return [0, 0];
    const code = countryCode.toUpperCase();
    return COUNTRY_COORDS[code] || [0, 0];
}

/**
 * 获取 Cloudflare 边缘节点坐标
 * @param colo Cloudflare COLO 代码（如 'SJC', 'HKG'）
 * @returns [经度, 纬度] 或 [0, 0]（未知节点）
 */
export function getColoCoords(colo: string | null): [number, number] {
    if (!colo || colo === 'UNKNOWN') return [0, 0];
    const code = colo.toUpperCase();
    return COLO_COORDS[code] || [0, 0];
}

/**
 * 获取国家名称（可选，用于 Tooltip 显示）
 */
export const COUNTRY_NAMES: Record<string, string> = {
    'CN': '中国',
    'US': '美国',
    'JP': '日本',
    'GB': '英国',
    'DE': '德国',
    'FR': '法国',
    'KR': '韩国',
    'SG': '新加坡',
    'AU': '澳大利亚',
    'CA': '加拿大',
    'IN': '印度',
    'BR': '巴西',
    'RU': '俄罗斯',
    'MX': '墨西哥',
    'ID': '印度尼西亚',
    'NL': '荷兰',
    'IT': '意大利',
    'ES': '西班牙',
    'TH': '泰国',
    'PL': '波兰',
    'HK': '香港',
    'KH': '柬埔寨',
    'TW': '台湾',
    // ... 可根据需要扩展
};

export function getCountryName(countryCode: string | null): string {
    if (!countryCode) return 'Unknown';
    return COUNTRY_NAMES[countryCode.toUpperCase()] || countryCode;
}
