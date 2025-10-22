#!/usr/bin/env node

/**
 * GeoNames 城市数据导入脚本
 * 
 * 功能：
 * 1. 读取 cities15000.txt (人口 > 15,000 的城市)
 * 2. 筛选 Tier 1 城市 (人口 >= 500k 或国家/省会首府)
 * 3. 标准化城市名称
 * 4. 生成 TypeScript 文件 (geo-city-coords.ts)
 * 5. 生成初始别名映射表 (geo-city-aliases.ts)
 * 
 * 使用方法：
 *   node scripts/import-geonames.js [options]
 * 
 * 选项：
 *   --input <file>      输入文件路径 (默认: .geonames/cities15000.txt)
 *   --tier1-threshold   Tier 1 人口阈值 (默认: 500000)
 *   --tier1-max         Tier 1 最大城市数 (默认: 1000)
 *   --output-dir <dir>  输出目录 (默认: src/lib)
 *   --verbose           详细日志
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  inputFile: path.join(__dirname, '../.geonames/cities15000.txt'),
  tier1Threshold: 500000,
  tier1MaxCount: 1000,
  outputDir: path.join(__dirname, '../src/lib'),
  includeCapitals: true,  // 强制包含首都
  verbose: false,
};

// 命令行参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        config.inputFile = args[++i];
        break;
      case '--tier1-threshold':
        config.tier1Threshold = parseInt(args[++i], 10);
        break;
      case '--tier1-max':
        config.tier1MaxCount = parseInt(args[++i], 10);
        break;
      case '--output-dir':
        config.outputDir = args[++i];
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        console.log(__doc__);
        process.exit(0);
    }
  }

  return config;
}

/**
 * 城市名称规范化规则（必须按顺序执行）
 * 
 * 输入: "  são PAULO  "
 * 输出: "Sao Paulo"
 */
function normalizeCityName(input) {
  if (!input) return '';

  return input
    .trim()                           // 1. 去除首尾空格
    .normalize('NFKD')                // 2. Unicode 规范化（分解重音符号）
    .replace(/[\u0300-\u036f]/g, '') // 3. 移除重音符号（São → Sao）
    .toLowerCase()                     // 4. 全小写
    .split(' ')                        // 5. 按空格拆分
    .map(word =>                       // 6. 每个单词首字母大写
      word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');                        // 7. 重新拼接
}

/**
 * 解析 GeoNames 数据行
 * 
 * 格式：tab 分隔，字段顺序：
 * 0: geonameId
 * 1: name
 * 2: asciiname
 * 3: alternateNames
 * 4: latitude
 * 5: longitude
 * 8: country code
 * 14: population
 * 6: feature class
 * 7: feature code (PPLC=首都, PPLA=一级行政区首府)
 */
function parseGeoNamesLine(line) {
  const fields = line.split('\t');
  
  return {
    geonameId: parseInt(fields[0], 10),
    name: fields[1],                  // 原始名称
    asciiName: fields[2],             // ASCII 名称
    alternateNames: fields[3] || '',  // 别名（逗号分隔）
    lat: parseFloat(fields[4]),
    lng: parseFloat(fields[5]),
    countryCode: fields[8],
    population: parseInt(fields[14], 10) || 0,
    featureClass: fields[6],
    featureCode: fields[7],           // PPLC=首都, PPLA=省会
  };
}

/**
 * 判断是否为首都或重要城市
 */
function isCapitalOrMajorCity(city) {
  // PPLC = 国家首都
  // PPLA = 一级行政区首府（省会/州府）
  return city.featureCode === 'PPLC' || city.featureCode === 'PPLA';
}

/**
 * 读取并筛选 Tier 1 城市
 */
function loadAndFilterCities(config) {
  const { inputFile, tier1Threshold, tier1MaxCount, includeCapitals, verbose } = config;

  console.log('📖 读取 GeoNames 数据...');
  const content = fs.readFileSync(inputFile, 'utf-8');
  const lines = content.trim().split('\n');
  
  console.log(`   文件行数: ${lines.length.toLocaleString()}`);

  // 解析所有城市
  const cities = lines.map(parseGeoNamesLine);
  console.log(`   解析城市数: ${cities.length.toLocaleString()}`);

  // Tier 1 筛选规则：
  // 1. 人口 >= 500k，OR
  // 2. 国家首都 (PPLC)，OR
  // 3. 一级行政区首府 (PPLA) 且人口 >= 100k
  const tier1Cities = cities.filter(city => {
    if (city.population >= tier1Threshold) return true;
    if (includeCapitals && city.featureCode === 'PPLC') return true;
    if (city.featureCode === 'PPLA' && city.population >= 100000) return true;
    return false;
  });

  // 按人口降序排序，取前 N 个
  tier1Cities.sort((a, b) => b.population - a.population);
  const selectedCities = tier1Cities.slice(0, tier1MaxCount);

  console.log(`   Tier 1 候选: ${tier1Cities.length.toLocaleString()}`);
  console.log(`   最终选择: ${selectedCities.length.toLocaleString()}`);

  if (verbose) {
    console.log('\n前 10 大城市:');
    selectedCities.slice(0, 10).forEach((city, i) => {
      console.log(`   ${i + 1}. ${city.name} (${city.countryCode}) - ${city.population.toLocaleString()}`);
    });
  }

  return selectedCities;
}

/**
 * 生成 geo-city-coords.ts 文件
 */
function generateCityCoords(cities, outputDir) {
  const outputFile = path.join(outputDir, 'geo-city-coords.ts');

  console.log('\n📝 生成 geo-city-coords.ts...');

  // 去重：相同名称保留人口最多的
  const cityMap = new Map();
  for (const city of cities) {
    const normalizedName = normalizeCityName(city.asciiName || city.name);
    const existing = cityMap.get(normalizedName);
    
    if (!existing || city.population > existing.population) {
      cityMap.set(normalizedName, city);
    }
  }

  // 构建 TypeScript 对象
  const uniqueCities = Array.from(cityMap.entries());
  const entries = uniqueCities.map(([normalizedName, city]) => {
    return `  "${normalizedName}": {
    coords: [${city.lng}, ${city.lat}],
    country: "${city.countryCode}",
    population: ${city.population},
    geonameId: ${city.geonameId}
  }`;
  });

  const tsContent = `/**
 * 城市坐标数据 (Tier 1)
 * 
 * 数据来源: GeoNames (https://www.geonames.org/)
 * 许可证: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
 * 生成时间: ${new Date().toISOString()}
 * 城市数量: ${uniqueCities.length.toLocaleString()}
 * 筛选规则: 人口 >= 500k OR 国家/省会首府
 * 去重规则: 相同名称保留人口最多的城市
 */

export const CITY_COORDS: Record<string, {
  coords: [number, number];  // [lng, lat]
  country: string;
  population: number;
  geonameId: number;
}> = {
${entries.join(',\n')}
};

/**
 * 通过城市名称获取坐标
 * @param cityName 城市名称（已标准化）
 * @returns 坐标 [lng, lat] 或 undefined
 */
export function getCityCoords(cityName: string): [number, number] | undefined {
  const city = CITY_COORDS[cityName];
  return city?.coords;
}
`;

  fs.writeFileSync(outputFile, tsContent, 'utf-8');
  console.log(`   ✅ 已生成: ${outputFile}`);
  console.log(`   📊 城市数量: ${uniqueCities.length} (原始: ${cities.length}, 去重: ${cities.length - uniqueCities.length})`);

  // 计算文件大小
  const stats = fs.statSync(outputFile);
  const sizeKB = (stats.size / 1024).toFixed(2);
  console.log(`   📦 文件大小: ${sizeKB} KB`);

  if (parseFloat(sizeKB) > 300) {
    console.warn(`   ⚠️  警告: 文件大小超过 300KB 目标！`);
  }
}

/**
 * 生成初始别名映射表
 */
function generateCityAliases(cities, outputDir) {
  const outputFile = path.join(outputDir, 'geo-city-aliases.ts');

  console.log('\n📝 生成 geo-city-aliases.ts (初始版本)...');

  // 从 alternateNames 中提取常见别名
  const aliasMap = new Map();

  cities.forEach(city => {
    const normalizedName = normalizeCityName(city.asciiName || city.name);
    
    // 添加原始名称作为别名
    if (city.name !== city.asciiName) {
      const normalizedOriginal = normalizeCityName(city.name);
      if (normalizedOriginal !== normalizedName) {
        aliasMap.set(normalizedOriginal, normalizedName);
      }
    }

    // 从 alternateNames 中提取（简化版，只取前几个）
    if (city.alternateNames) {
      const alts = city.alternateNames.split(',').slice(0, 5);
      alts.forEach(alt => {
        const normalizedAlt = normalizeCityName(alt);
        if (normalizedAlt && normalizedAlt !== normalizedName && normalizedAlt.length > 2) {
          aliasMap.set(normalizedAlt, normalizedName);
        }
      });
    }
  });

  // 生成 TypeScript 代码
  const entries = Array.from(aliasMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([alias, standard]) => `  "${alias}": "${standard}"`)
    .join(',\n');

  const tsContent = `/**
 * 城市名称别名映射表
 * 
 * 用途：将各种城市名称变体映射到标准名称
 * 数据来源: GeoNames (https://www.geonames.org/)
 * 许可证: CC BY 4.0
 * 生成时间: ${new Date().toISOString()}
 * 别名数量: ${aliasMap.size.toLocaleString()}
 * 
 * ⚠️ 注意：这是自动生成的初始版本，需要手动补充：
 *   - 中文城市名称 (Beijing → "北京")
 *   - 常见缩写 (NYC → New York)
 *   - 特殊情况
 */

export const CITY_ALIASES: Record<string, string> = {
${entries}
};

/**
 * 解析城市名称别名
 * @param cityName 城市名称（可能是别名）
 * @returns 标准化的城市名称
 */
export function resolveCityAlias(cityName: string): string {
  return CITY_ALIASES[cityName] || cityName;
}
`;

  fs.writeFileSync(outputFile, tsContent, 'utf-8');
  console.log(`   ✅ 已生成: ${outputFile}`);
  console.log(`   📊 别名数量: ${aliasMap.size.toLocaleString()}`);
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('GeoNames 城市数据导入工具');
  console.log('========================================\n');

  const config = parseArgs();

  // 验证输入文件
  if (!fs.existsSync(config.inputFile)) {
    console.error(`❌ 错误: 输入文件不存在: ${config.inputFile}`);
    process.exit(1);
  }

  // 确保输出目录存在
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // 加载并筛选城市
  const tier1Cities = loadAndFilterCities(config);

  // 生成文件
  generateCityCoords(tier1Cities, config.outputDir);
  generateCityAliases(tier1Cities, config.outputDir);

  console.log('\n========================================');
  console.log('✅ 导入完成！');
  console.log('========================================');
  console.log('\n下一步:');
  console.log('1. 检查生成的文件: src/lib/geo-city-coords.ts');
  console.log('2. 手动补充别名: src/lib/geo-city-aliases.ts');
  console.log('3. 运行内存测试: node scripts/test-city-memory.js');
}

// 执行主函数
if (require.main === module) {
  main();
}

