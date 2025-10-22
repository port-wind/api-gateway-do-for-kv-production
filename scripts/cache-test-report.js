#!/usr/bin/env node

/**
 * 自动化缓存测试报告生成器
 * 执行完整的缓存测试流程并生成详细报告
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// 配置
const CONFIG = {
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:8787',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',
  testPath: '/api/test',
  totalRequests: 100,
  cacheTTL: 60,
  reportDir: 'test-reports',
  reportFile: `cache-test-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
};

/**
 * 颜色输出工具
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.magenta}=== ${msg} ===${colors.reset}`),
  step: (msg) => console.log(`${colors.cyan}🔹 ${msg}${colors.reset}`)
};

/**
 * HTTP 请求工具
 */
async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? require('https') : require('http');
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CacheTestReporter/1.0',
        ...options.headers
      }
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            data: data ? JSON.parse(data) : null,
            rawData: data
          };
          resolve(result);
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            rawData: data,
            error: error.message
          });
        }
      });
    });

    req.on('error', reject);
    
    if (options.data) {
      req.write(typeof options.data === 'string' ? options.data : JSON.stringify(options.data));
    }
    
    req.end();
  });
}

/**
 * 检查服务状态
 */
async function checkServices() {
  log.step('检查服务状态...');
  
  const services = {
    backend: { url: `${CONFIG.backendUrl}/stats`, name: '后端模拟服务器' },
    gateway: { url: `${CONFIG.gatewayUrl}/health`, name: 'API网关' }
  };

  const results = {};

  for (const [key, service] of Object.entries(services)) {
    try {
      const response = await httpRequest(service.url);
      results[key] = {
        available: response.statusCode === 200,
        statusCode: response.statusCode,
        responseTime: 0 // 简化版，不测量时间
      };
      
      if (results[key].available) {
        log.success(`${service.name} 运行正常`);
      } else {
        log.error(`${service.name} 状态异常 (状态码: ${response.statusCode})`);
      }
    } catch (error) {
      results[key] = {
        available: false,
        error: error.message
      };
      log.error(`${service.name} 连接失败: ${error.message}`);
    }
  }

  return results;
}

/**
 * 重置后端统计
 */
async function resetBackendStats() {
  log.step('重置后端统计数据...');
  try {
    const response = await httpRequest(`${CONFIG.backendUrl}/reset`, { method: 'POST' });
    if (response.statusCode === 200) {
      log.success('后端统计数据已重置');
      return true;
    } else {
      log.error(`重置失败，状态码: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    log.error(`重置失败: ${error.message}`);
    return false;
  }
}

/**
 * 获取后端统计
 */
async function getBackendStats() {
  try {
    const response = await httpRequest(`${CONFIG.backendUrl}/stats`);
    if (response.statusCode === 200 && response.data) {
      return response.data;
    }
    return null;
  } catch (error) {
    log.warning(`获取后端统计失败: ${error.message}`);
    return null;
  }
}

/**
 * 执行单个缓存测试请求
 */
async function performCacheTest(requestId) {
  const testData = {
    testId: requestId,
    message: `Cache test request ${requestId}`,
    timestamp: new Date().toISOString()
  };

  const startTime = Date.now();
  
  try {
    const response = await httpRequest(`${CONFIG.gatewayUrl}${CONFIG.testPath}`, {
      method: 'POST',
      data: testData
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // 解析缓存相关头信息
    const cacheStatus = response.headers['x-cache-status'] || 'UNKNOWN';
    const cacheVersion = response.headers['x-cache-version'] || '';
    const cacheTTL = response.headers['x-cache-ttl'] || '';
    const cacheRemaining = response.headers['x-cache-remaining-ttl'] || '';

    return {
      requestId,
      statusCode: response.statusCode,
      responseTime,
      cacheStatus,
      cacheVersion,
      cacheTTL,
      cacheRemaining: cacheRemaining ? parseInt(cacheRemaining) : null,
      timestamp: new Date().toISOString(),
      success: response.statusCode === 200
    };
  } catch (error) {
    return {
      requestId,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      cacheStatus: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString(),
      success: false
    };
  }
}

/**
 * 执行批量缓存测试
 */
async function runBatchCacheTest() {
  log.header('执行缓存测试');
  
  const results = [];
  const batchSize = 10;
  let cacheHits = 0;
  let cacheMisses = 0;
  let staleHits = 0;
  let errors = 0;

  // 获取初始后端统计
  const initialStats = await getBackendStats();
  const initialBackendRequests = initialStats ? initialStats.totalRequests : 0;

  log.step(`第一阶段: 发送前50个请求 (建立缓存 + 命中测试)`);
  
  // 第一阶段：前50个请求
  for (let i = 1; i <= 50; i++) {
    const result = await performCacheTest(i);
    results.push(result);

    // 统计缓存状态
    switch (result.cacheStatus) {
      case 'HIT': cacheHits++; break;
      case 'MISS': cacheMisses++; break;
      case 'STALE': staleHits++; break;
      case 'ERROR': errors++; break;
    }

    // 显示进度
    if (i % batchSize === 0 || result.cacheStatus === 'MISS' || result.cacheStatus === 'ERROR') {
      log.info(`请求 #${i}: ${result.statusCode} ${result.cacheStatus} ${result.responseTime}ms`);
    }

    // 在前几个请求间稍作延迟
    if (i <= 5) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 获取第一阶段后的统计
  const midStats = await getBackendStats();
  const midBackendRequests = midStats ? midStats.totalRequests : initialBackendRequests;
  
  log.success(`第一阶段完成，后端新增请求: ${midBackendRequests - initialBackendRequests}`);

  // 等待缓存过期
  log.step(`等待缓存过期 (${CONFIG.cacheTTL + 1} 秒)...`);
  
  for (let i = 1; i <= CONFIG.cacheTTL + 1; i++) {
    process.stdout.write(`\r  等待中... ${i}/${CONFIG.cacheTTL + 1} 秒`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('');
  
  log.success('缓存应该已过期');

  log.step('第二阶段: 发送后50个请求 (缓存过期 + 重建)');
  
  // 第二阶段：后50个请求
  for (let i = 51; i <= 100; i++) {
    const result = await performCacheTest(i);
    results.push(result);

    // 统计缓存状态
    switch (result.cacheStatus) {
      case 'HIT': cacheHits++; break;
      case 'MISS': cacheMisses++; break;
      case 'STALE': staleHits++; break;
      case 'ERROR': errors++; break;
    }

    // 显示进度
    if (i % batchSize === 0 || result.cacheStatus === 'MISS' || result.cacheStatus === 'ERROR') {
      log.info(`请求 #${i}: ${result.statusCode} ${result.cacheStatus} ${result.responseTime}ms`);
    }

    // 在缓存重建后的前几个请求间稍作延迟
    if (i <= 55) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 获取最终统计
  await new Promise(resolve => setTimeout(resolve, 1000)); // 等待异步操作完成
  const finalStats = await getBackendStats();
  const finalBackendRequests = finalStats ? finalStats.totalRequests : midBackendRequests;

  return {
    results,
    statistics: {
      totalRequests: results.length,
      cacheHits,
      cacheMisses,
      staleHits,
      errors,
      cacheHitRate: (cacheHits / results.length * 100).toFixed(2),
      averageResponseTime: (results.reduce((sum, r) => sum + r.responseTime, 0) / results.length).toFixed(2),
      backendRequests: {
        initial: initialBackendRequests,
        final: finalBackendRequests,
        total: finalBackendRequests - initialBackendRequests
      }
    },
    backendStats: finalStats
  };
}

/**
 * 生成测试报告
 */
async function generateReport(testResults, serviceStatus) {
  log.header('生成测试报告');

  const report = {
    metadata: {
      timestamp: new Date().toISOString(),
      config: CONFIG,
      duration: 0 // 简化版
    },
    serviceStatus,
    testResults,
    analysis: analyzeResults(testResults),
    recommendations: generateRecommendations(testResults)
  };

  // 确保报告目录存在
  try {
    await fs.mkdir(CONFIG.reportDir, { recursive: true });
  } catch (error) {
    // 目录可能已存在，忽略错误
  }

  // 保存 JSON 报告
  const reportPath = path.join(CONFIG.reportDir, CONFIG.reportFile);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  // 生成可读的文本报告
  const textReport = generateTextReport(report);
  const textReportPath = reportPath.replace('.json', '.txt');
  await fs.writeFile(textReportPath, textReport);

  log.success(`测试报告已保存:`);
  log.info(`JSON格式: ${reportPath}`);
  log.info(`文本格式: ${textReportPath}`);

  return report;
}

/**
 * 分析测试结果
 */
function analyzeResults(testResults) {
  const stats = testResults.statistics;
  const backendEfficiency = ((CONFIG.totalRequests - stats.backendRequests.total) / CONFIG.totalRequests * 100).toFixed(2);

  return {
    cacheEffectiveness: {
      score: parseFloat(backendEfficiency),
      grade: backendEfficiency > 95 ? 'A' : backendEfficiency > 85 ? 'B' : backendEfficiency > 70 ? 'C' : 'D',
      description: backendEfficiency > 95 ? '优秀' : backendEfficiency > 85 ? '良好' : backendEfficiency > 70 ? '一般' : '较差'
    },
    responsePerformance: {
      averageTime: parseFloat(stats.averageResponseTime),
      grade: stats.averageResponseTime < 50 ? 'A' : stats.averageResponseTime < 100 ? 'B' : stats.averageResponseTime < 200 ? 'C' : 'D',
      description: stats.averageResponseTime < 50 ? '优秀' : stats.averageResponseTime < 100 ? '良好' : stats.averageResponseTime < 200 ? '一般' : '较慢'
    },
    cacheHitRate: {
      rate: parseFloat(stats.cacheHitRate),
      grade: stats.cacheHitRate > 95 ? 'A' : stats.cacheHitRate > 80 ? 'B' : stats.cacheHitRate > 60 ? 'C' : 'D',
      description: stats.cacheHitRate > 95 ? '优秀' : stats.cacheHitRate > 80 ? '良好' : stats.cacheHitRate > 60 ? '一般' : '较低'
    }
  };
}

/**
 * 生成建议
 */
function generateRecommendations(testResults) {
  const recommendations = [];
  const stats = testResults.statistics;
  const backendRequests = stats.backendRequests.total;

  if (backendRequests > 5) {
    recommendations.push({
      type: 'warning',
      title: '缓存效率',
      message: `后端接收到 ${backendRequests} 个请求，超出预期（应该 ≤ 3个）。建议检查缓存配置。`
    });
  }

  if (stats.cacheHitRate < 80) {
    recommendations.push({
      type: 'warning',
      title: '缓存命中率',
      message: `缓存命中率为 ${stats.cacheHitRate}%，建议优化缓存策略。`
    });
  }

  if (stats.averageResponseTime > 200) {
    recommendations.push({
      type: 'warning',
      title: '响应性能',
      message: `平均响应时间为 ${stats.averageResponseTime}ms，建议优化网络或缓存配置。`
    });
  }

  if (stats.errors > 0) {
    recommendations.push({
      type: 'error',
      title: '请求错误',
      message: `发现 ${stats.errors} 个请求错误，建议检查网关配置和网络连接。`
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      title: '测试通过',
      message: '所有指标均表现良好，缓存系统工作正常。'
    });
  }

  return recommendations;
}

/**
 * 生成文本格式报告
 */
function generateTextReport(report) {
  const stats = report.testResults.statistics;
  const analysis = report.analysis;
  
  return `
缓存测试报告
============

测试时间: ${report.metadata.timestamp}
测试配置:
  • 网关地址: ${report.metadata.config.gatewayUrl}
  • 后端地址: ${report.metadata.config.backendUrl}  
  • 测试路径: ${report.metadata.config.testPath}
  • 总请求数: ${report.metadata.config.totalRequests}
  • 缓存TTL:  ${report.metadata.config.cacheTTL}秒

服务状态:
  • 后端服务: ${report.serviceStatus.backend?.available ? '✅ 正常' : '❌ 异常'}
  • 网关服务: ${report.serviceStatus.gateway?.available ? '✅ 正常' : '❌ 异常'}

测试结果:
  • 总请求数:     ${stats.totalRequests}
  • 缓存命中:     ${stats.cacheHits} (${stats.cacheHitRate}%)
  • 缓存未命中:   ${stats.cacheMisses}
  • 过期缓存:     ${stats.staleHits}  
  • 请求错误:     ${stats.errors}
  • 平均响应时间: ${stats.averageResponseTime}ms

后端统计:
  • 初始请求数:   ${stats.backendRequests.initial}
  • 最终请求数:   ${stats.backendRequests.final}
  • 新增请求数:   ${stats.backendRequests.total}
  • 缓存有效性:   ${((stats.totalRequests - stats.backendRequests.total) / stats.totalRequests * 100).toFixed(2)}%

性能分析:
  • 缓存效果: ${analysis.cacheEffectiveness.description} (${analysis.cacheEffectiveness.grade})
  • 响应性能: ${analysis.responsePerformance.description} (${analysis.responsePerformance.grade})  
  • 命中率:   ${analysis.cacheHitRate.description} (${analysis.cacheHitRate.grade})

建议:
${report.recommendations.map(r => `  ${r.type === 'success' ? '✅' : r.type === 'warning' ? '⚠️' : '❌'} ${r.title}: ${r.message}`).join('\n')}

详细日志可查看 JSON 报告文件。
`;
}

/**
 * 显示实时报告摘要
 */
function displayReportSummary(report) {
  log.header('测试结果摘要');
  
  const stats = report.testResults.statistics;
  const analysis = report.analysis;

  console.log('📊 请求统计:');
  console.log(`  • 总请求数:     ${stats.totalRequests}`);
  console.log(`  • 缓存命中:     ${stats.cacheHits} (${stats.cacheHitRate}%)`);
  console.log(`  • 缓存未命中:   ${stats.cacheMisses}`);
  console.log(`  • 过期缓存:     ${stats.staleHits}`);
  console.log(`  • 平均响应时间: ${stats.averageResponseTime}ms`);
  console.log('');
  console.log('🎯 后端统计:');
  console.log(`  • 测试前请求数: ${stats.backendRequests.initial}`);
  console.log(`  • 测试后请求数: ${stats.backendRequests.final}`);
  console.log(`  • 新增请求数:   ${stats.backendRequests.total}`);
  console.log(`  • 缓存有效性:   ${((stats.totalRequests - stats.backendRequests.total) / stats.totalRequests * 100).toFixed(2)}%`);
  console.log('');
  console.log('✨ 性能评级:');
  console.log(`  • 缓存效果: ${analysis.cacheEffectiveness.description} (${analysis.cacheEffectiveness.grade})`);
  console.log(`  • 响应性能: ${analysis.responsePerformance.description} (${analysis.responsePerformance.grade})`);
  console.log(`  • 命中率:   ${analysis.cacheHitRate.description} (${analysis.cacheHitRate.grade})`);
  console.log('');
  console.log('💡 建议:');
  report.recommendations.forEach(rec => {
    const icon = rec.type === 'success' ? '✅' : rec.type === 'warning' ? '⚠️' : '❌';
    console.log(`  ${icon} ${rec.title}: ${rec.message}`);
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    log.header('自动化缓存测试报告生成器');
    log.info('开始执行完整的缓存测试流程...');

    // 检查服务状态
    const serviceStatus = await checkServices();
    
    if (!serviceStatus.backend.available || !serviceStatus.gateway.available) {
      log.error('必要服务未运行，请先启动相关服务');
      process.exit(1);
    }

    // 重置后端统计
    await resetBackendStats();

    // 执行缓存测试
    const testResults = await runBatchCacheTest();

    // 生成并保存报告
    const report = await generateReport(testResults, serviceStatus);

    // 显示摘要
    displayReportSummary(report);

    log.header('测试完成');
    log.success('完整的测试报告已生成并保存');

  } catch (error) {
    log.error(`测试执行失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 脚本入口
if (require.main === module) {
  main();
}

module.exports = {
  main,
  performCacheTest,
  generateReport
};