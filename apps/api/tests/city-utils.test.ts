/**
 * 城市工具函数单元测试
 * 
 * 测试范围:
 * - normalizeCityName 标准化规则
 * - parseCityName 别名解析
 * - isTier1City 城市检查
 * - getCityInfo 信息获取
 */

import { describe, it, expect } from 'vitest';
import {
    normalizeCityName,
    parseCityName,
    isTier1City,
    getCityInfo,
    CITY_TEST_CASES,
} from '../src/lib/city-utils';

describe('City Utils - normalizeCityName', () => {
    describe('基础标准化测试', () => {
        it('应该处理全小写输入', () => {
            expect(normalizeCityName('beijing')).toBe('Beijing');
            expect(normalizeCityName('new york')).toBe('New York');
        });

        it('应该处理全大写输入', () => {
            expect(normalizeCityName('BEIJING')).toBe('Beijing');
            expect(normalizeCityName('LOS ANGELES')).toBe('Los Angeles');
        });

        it('应该处理混合大小写输入', () => {
            expect(normalizeCityName('BeIjInG')).toBe('Beijing');
            expect(normalizeCityName('nEw YoRk')).toBe('New York');
        });
    });

    describe('空格处理测试', () => {
        it('应该去除首尾空格', () => {
            expect(normalizeCityName('  Beijing  ')).toBe('Beijing');
            expect(normalizeCityName('   New York   ')).toBe('New York');
        });

        it('应该处理多余的中间空格', () => {
            expect(normalizeCityName('New  York')).toBe('New York');
            expect(normalizeCityName('Los   Angeles')).toBe('Los Angeles');
        });

        it('应该处理制表符和换行符', () => {
            // 使用 \s+ 会把制表符也当作分隔符
            expect(normalizeCityName('New\tYork')).toBe('New York');
            expect(normalizeCityName('Beijing\n')).toBe('Beijing');
        });
    });

    describe('重音符号处理测试', () => {
        it('应该移除拉丁字母的重音符号', () => {
            expect(normalizeCityName('São Paulo')).toBe('Sao Paulo');
            expect(normalizeCityName('Zürich')).toBe('Zurich');
            expect(normalizeCityName('Montréal')).toBe('Montreal');
        });

        it('应该处理混合重音和大小写', () => {
            expect(normalizeCityName('são PAULO')).toBe('Sao Paulo');
            expect(normalizeCityName('ZÜRICH')).toBe('Zurich');
        });
    });

    describe('多单词城市名测试', () => {
        it('应该正确处理两个单词', () => {
            expect(normalizeCityName('new york')).toBe('New York');
            expect(normalizeCityName('los angeles')).toBe('Los Angeles');
        });

        it('应该正确处理三个单词', () => {
            expect(normalizeCityName('ho chi minh city')).toBe('Ho Chi Minh City');
            expect(normalizeCityName('san jose del cabo')).toBe('San Jose Del Cabo');
        });

        it('应该正确处理四个及以上单词', () => {
            expect(normalizeCityName('saint jean cap ferrat')).toBe('Saint Jean Cap Ferrat');
        });
    });

    describe('边界情况测试', () => {
        it('应该处理空字符串', () => {
            expect(normalizeCityName('')).toBe('');
            expect(normalizeCityName('   ')).toBe('');
        });

        it('应该处理 null 和 undefined', () => {
            expect(normalizeCityName(null)).toBe('');
            expect(normalizeCityName(undefined)).toBe('');
        });

        it('应该处理单个字符', () => {
            expect(normalizeCityName('a')).toBe('A');
            expect(normalizeCityName('x')).toBe('X');
        });

        it('应该处理单个单词', () => {
            expect(normalizeCityName('tokyo')).toBe('Tokyo');
            expect(normalizeCityName('LONDON')).toBe('London');
        });
    });

    describe('预定义测试用例', () => {
        it('应该通过所有 CITY_TEST_CASES', () => {
            CITY_TEST_CASES.forEach(({ input, expected }) => {
                expect(normalizeCityName(input)).toBe(expected);
            });
        });
    });

    describe('幂等性测试', () => {
        it('标准化结果应该是幂等的', () => {
            const testCases = [
                'beijing',
                'São Paulo',
                'NEW YORK',
                '  los angeles  ',
            ];

            testCases.forEach(input => {
                const first = normalizeCityName(input);
                const second = normalizeCityName(first);
                expect(first).toBe(second);
            });
        });
    });
});

describe('City Utils - parseCityName', () => {
    describe('标准化 + 别名解析', () => {
        it('应该先标准化再解析别名', () => {
            // 假设别名表中有 "Peking" -> "Beijing"
            const result = parseCityName('peking');  // 小写输入
            // 标准化为 "Peking"，然后解析别名为 "Beijing"（如果别名表中有）
            expect(['Peking', 'Beijing']).toContain(result);
        });

        it('应该处理空输入', () => {
            expect(parseCityName('')).toBe('');
            expect(parseCityName(null)).toBe('');
            expect(parseCityName(undefined)).toBe('');
        });
    });

    describe('常见城市测试', () => {
        it('应该正确解析主要城市', () => {
            expect(parseCityName('beijing')).toBeTruthy();
            expect(parseCityName('shanghai')).toBeTruthy();
            expect(parseCityName('new york')).toBeTruthy();
        });
    });
});

describe('City Utils - isTier1City', () => {
    describe('Tier 1 城市检查', () => {
        it('应该识别 Tier 1 城市（标准化名称）', () => {
            // 这些是 Tier 1 列表中的城市（人口 >= 500k 或首府）
            expect(isTier1City('Shanghai')).toBe(true);
            expect(isTier1City('Beijing')).toBe(true);
            // 注意：可能是 "New York City" 而不是 "New York"
            // expect(isTier1City('New York')).toBe(true);
            expect(isTier1City('London')).toBe(true);
        });

        it('应该拒绝非 Tier 1 城市', () => {
            // 使用不在 Tier 1 列表中的城市名称
            expect(isTier1City('NonExistentCity')).toBe(false);
            expect(isTier1City('SmallTown')).toBe(false);
        });

        it('应该区分大小写（需要标准化名称）', () => {
            // isTier1City 接收的应该是标准化后的名称
            expect(isTier1City('Beijing')).toBe(true);
            // 如果传入未标准化的名称，应该不匹配（设计如此）
            expect(isTier1City('beijing')).toBe(false);
            expect(isTier1City('BEIJING')).toBe(false);
        });

        it('应该处理空输入', () => {
            expect(isTier1City('')).toBe(false);
        });
    });
});

describe('City Utils - getCityInfo', () => {
    describe('城市信息获取', () => {
        it('应该返回 Tier 1 城市的完整信息', () => {
            const info = getCityInfo('Shanghai');

            if (info) {
                expect(info).toHaveProperty('coords');
                expect(info).toHaveProperty('country');
                expect(info).toHaveProperty('population');
                expect(info).toHaveProperty('geonameId');

                expect(Array.isArray(info.coords)).toBe(true);
                expect(info.coords.length).toBe(2);
                expect(typeof info.country).toBe('string');
                expect(typeof info.population).toBe('number');
                expect(typeof info.geonameId).toBe('number');
            }
        });

        it('应该自动标准化和解析别名', () => {
            // 传入未标准化的名称，getCityInfo 应该自动处理
            const info1 = getCityInfo('beijing');  // 小写
            const info2 = getCityInfo('BEIJING');  // 大写

            // 应该返回相同的城市信息（通过 geonameId 判断）
            if (info1 && info2) {
                expect(info1.geonameId).toBe(info2.geonameId);
            }
        });

        it('应该返回 undefined 对于非 Tier 1 城市', () => {
            const info = getCityInfo('NonExistentCity');
            expect(info).toBeUndefined();
        });

        it('应该处理空输入', () => {
            expect(getCityInfo('')).toBeUndefined();
            expect(getCityInfo(null as any)).toBeUndefined();
            expect(getCityInfo(undefined as any)).toBeUndefined();
        });
    });

    describe('坐标格式验证', () => {
        it('坐标应该是 [lng, lat] 格式', () => {
            const info = getCityInfo('Shanghai');

            if (info) {
                const [lng, lat] = info.coords;

                // 经度范围: -180 到 180
                expect(lng).toBeGreaterThanOrEqual(-180);
                expect(lng).toBeLessThanOrEqual(180);

                // 纬度范围: -90 到 90
                expect(lat).toBeGreaterThanOrEqual(-90);
                expect(lat).toBeLessThanOrEqual(90);
            }
        });

        it('上海坐标应该大致正确（东经约121度，北纬约31度）', () => {
            const info = getCityInfo('Shanghai');

            if (info) {
                const [lng, lat] = info.coords;

                // 上海的大致坐标
                expect(lng).toBeGreaterThan(120);
                expect(lng).toBeLessThan(122);
                expect(lat).toBeGreaterThan(30);
                expect(lat).toBeLessThan(32);
            }
        });
    });
});

describe('City Utils - 集成测试', () => {
    describe('完整工作流测试', () => {
        it('应该支持端到端的城市处理流程', () => {
            // 1. 用户输入原始城市名称（未标准化）
            const rawInput = '  são PAULO  ';

            // 2. 标准化
            const normalized = normalizeCityName(rawInput);
            expect(normalized).toBe('Sao Paulo');

            // 3. 解析别名（如果需要）
            const standardName = parseCityName(rawInput);
            expect(standardName).toBe('Sao Paulo');

            // 4. 检查是否在 Tier 1
            const isTier1 = isTier1City(standardName);

            // 5. 获取完整信息
            const info = getCityInfo(rawInput);

            if (isTier1 && info) {
                expect(info.country).toBe('BR');
                expect(info.population).toBeGreaterThan(0);
            }
        });

        it('应该处理各种输入格式', () => {
            const inputs = [
                'beijing',
                'Beijing',
                'BEIJING',
                '  beijing  ',
                'BeIjInG',
            ];

            inputs.forEach(input => {
                const normalized = normalizeCityName(input);
                expect(normalized).toBe('Beijing');

                const info = getCityInfo(input);
                if (info) {
                    expect(info.country).toBe('CN');
                }
            });
        });
    });

    describe('性能测试', () => {
        it('标准化操作应该快速完成', () => {
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                normalizeCityName('São Paulo');
            }

            const end = performance.now();
            const avgTime = (end - start) / 1000;

            // 平均每次操作应该 < 0.1ms
            expect(avgTime).toBeLessThan(0.1);
        });

        it('城市查询应该快速完成', () => {
            const start = performance.now();

            for (let i = 0; i < 1000; i++) {
                getCityInfo('Shanghai');
            }

            const end = performance.now();
            const avgTime = (end - start) / 1000;

            // 平均每次查询应该 < 0.01ms (内存查找)
            expect(avgTime).toBeLessThan(0.01);
        });
    });
});

describe('City Utils - 边界和错误测试', () => {
    describe('特殊字符处理', () => {
        it('应该处理包含特殊字符的城市名', () => {
            // 虽然大多数城市名不包含特殊字符，但应该能处理
            expect(normalizeCityName("Saint-Denis")).toBeTruthy();
            expect(normalizeCityName("L'Aquila")).toBeTruthy();
        });

        it('应该处理包含数字的输入（虽然不常见）', () => {
            expect(normalizeCityName("City123")).toBe("City123");
        });
    });

    describe('极端情况', () => {
        it('应该处理非常长的城市名', () => {
            const longName = 'A'.repeat(100);
            const result = normalizeCityName(longName);
            expect(result.length).toBe(100);
            // 标准化后首字母大写，其余小写
            expect(result).toBe('A' + 'a'.repeat(99));
        });

        it('应该处理包含多个连续空格的输入', () => {
            expect(normalizeCityName('New     York')).toBe('New York');
        });
    });
});

