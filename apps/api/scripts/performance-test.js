#!/usr/bin/env node

/**
 * 性能测试脚本 - 验证 Worker 无状态重构效果
 * 
 * 测试场景：
 * 1. 并发请求性能
 * 2. 多实例一致性
 * 3. 内存使用情况  
 * 4. 响应时间统计
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class PerformanceTest {
  constructor(baseUrl = 'http://localhost:8787') {
    this.baseUrl = baseUrl;
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * 执行 HTTP 请求并测量性能
   */
  async makeRequest(path, options = {}) {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestStart = process.hrtime.bigint();
    
    return new Promise((resolve, reject) => {
      const req = client.request(url, {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'PerformanceTest/1.0',
          'X-Test-ID': options.testId || 'perf-test',
          ...options.headers
        }
      }, (res) => {
        let body = '';
        
        res.on('data', chunk => {
          body += chunk;
        });
        
        res.on('end', () => {
          const requestEnd = process.hrtime.bigint();
          const duration = Number(requestEnd - requestStart) / 1_000_000; // 转换为毫秒
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            duration,
            timestamp: Date.now()
          });
        });
      });
      
      req.on('error', reject);
      req.setTimeout(30000); // 30秒超时
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  /**
   * 并发测试 - 测试多个同时请求的性能
   */
  async concurrentTest(path, concurrency = 10, requests = 100) {
    console.log(`\n🚀 并发测试: ${concurrency} 并发, ${requests} 总请求`);
    console.log(`目标路径: ${path}`);
    
    const promises = [];
    const results = [];
    
    // 创建并发请求批次
    for (let batch = 0; batch < Math.ceil(requests / concurrency); batch++) {
      const batchPromises = [];
      const batchSize = Math.min(concurrency, requests - batch * concurrency);
      
      for (let i = 0; i < batchSize; i++) {
        const testId = `batch-${batch}-req-${i}`;
        batchPromises.push(
          this.makeRequest(path, { 
            testId,
            headers: { 'X-Batch': batch.toString() }
          }).catch(err => ({
            error: err.message,
            testId,
            duration: -1,
            statusCode: 0
          }))
        );
      }
      
      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 短暂延迟避免过度压力
      if (batch < Math.ceil(requests / concurrency) - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return this.analyzeResults(results, '并发测试');
  }

  /**
   * 缓存一致性测试
   */
  async cacheConsistencyTest() {
    console.log('\n🔄 缓存一致性测试');
    
    const testPath = '/kv/performance-test-' + Date.now();
    const requests = 20;
    
    const results = await Promise.all(
      Array(requests).fill().map((_, i) => 
        this.makeRequest(testPath, { 
          testId: `cache-test-${i}`,
          headers: { 'X-Cache-Test': 'true' }
        })
      )
    );
    
    return this.analyzeResults(results, '缓存一致性');
  }

  /**
   * 内存和响应时间基准测试
   */
  async benchmarkTest() {
    console.log('\n📊 基准性能测试');
    
    const testScenarios = [
      { path: '/health', name: '健康检查' },
      { path: '/kv/test-data', name: 'KV代理' },
      { path: '/admin/cache/stats', name: '管理API' }
    ];
    
    const allResults = {};
    
    for (const scenario of testScenarios) {
      console.log(`测试场景: ${scenario.name}`);
      
      const results = await Promise.all(
        Array(50).fill().map((_, i) => 
          this.makeRequest(scenario.path, { 
            testId: `benchmark-${scenario.name}-${i}`
          })
        )
      );
      
      allResults[scenario.name] = this.analyzeResults(results, scenario.name, false);
    }
    
    return allResults;
  }

  /**
   * 分析测试结果
   */
  analyzeResults(results, testName, showDetails = true) {
    const validResults = results.filter(r => r.duration > 0);
    const errors = results.filter(r => r.error || r.statusCode >= 400);
    
    if (validResults.length === 0) {
      console.log(`❌ ${testName}: 所有请求都失败了`);
      return null;
    }
    
    const durations = validResults.map(r => r.duration).sort((a, b) => a - b);
    const statusCodes = validResults.reduce((acc, r) => {
      acc[r.statusCode] = (acc[r.statusCode] || 0) + 1;
      return acc;
    }, {});
    
    const stats = {
      total: results.length,
      successful: validResults.length,
      errors: errors.length,
      errorRate: (errors.length / results.length * 100).toFixed(2),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: durations[Math.floor(durations.length * 0.5)],
      p90: durations[Math.floor(durations.length * 0.9)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
      statusCodes
    };
    
    if (showDetails) {
      console.log(`\n📈 ${testName} 结果:`);
      console.log(`   总请求数: ${stats.total}`);
      console.log(`   成功请求: ${stats.successful}`);
      console.log(`   错误数量: ${stats.errors} (${stats.errorRate}%)`);
      console.log(`   响应时间 (ms):`);
      console.log(`     最小值: ${stats.minDuration.toFixed(2)}`);
      console.log(`     最大值: ${stats.maxDuration.toFixed(2)}`);
      console.log(`     平均值: ${stats.avgDuration.toFixed(2)}`);
      console.log(`     P50: ${stats.p50.toFixed(2)}`);
      console.log(`     P90: ${stats.p90.toFixed(2)}`);
      console.log(`     P95: ${stats.p95.toFixed(2)}`);
      console.log(`     P99: ${stats.p99.toFixed(2)}`);
      console.log(`   状态码分布:`, statusCodes);
      
      if (errors.length > 0) {
        console.log(`   错误样例:`, errors.slice(0, 3).map(e => e.error || `${e.statusCode}`));
      }
    }
    
    return stats;
  }

  /**
   * 生成性能报告
   */
  generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      testDuration: Date.now() - this.startTime,
      baseUrl: this.baseUrl,
      results
    };
    
    console.log('\n📋 性能测试总结报告');
    console.log('='.repeat(50));
    console.log(`测试时间: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`测试持续: ${(report.testDuration / 1000).toFixed(1)}秒`);
    console.log(`目标服务: ${report.baseUrl}`);
    
    // 性能评估
    const allStats = Object.values(results).filter(Boolean);
    if (allStats.length > 0) {
      const avgP95 = allStats.reduce((sum, s) => sum + s.p95, 0) / allStats.length;
      const avgErrorRate = allStats.reduce((sum, s) => sum + parseFloat(s.errorRate), 0) / allStats.length;
      
      console.log(`\n整体性能指标:`);
      console.log(`  平均 P95 响应时间: ${avgP95.toFixed(2)}ms`);
      console.log(`  平均错误率: ${avgErrorRate.toFixed(2)}%`);
      
      // 性能评级
      let grade = 'A';
      if (avgP95 > 500) grade = 'B';
      if (avgP95 > 1000 || avgErrorRate > 5) grade = 'C';
      if (avgP95 > 2000 || avgErrorRate > 10) grade = 'D';
      
      console.log(`  性能评级: ${grade}`);
    }
    
    return report;
  }

  /**
   * 运行完整的性能测试套件
   */
  async runFullTest() {
    try {
      console.log('🧪 API Gateway 性能测试套件');
      console.log(`目标: ${this.baseUrl}`);
      
      // 基础连通性测试
      console.log('\n🔍 连通性检查...');
      const healthCheck = await this.makeRequest('/health');
      if (healthCheck.statusCode !== 200) {
        throw new Error(`健康检查失败: ${healthCheck.statusCode}`);
      }
      console.log('✅ 服务连接正常');
      
      const results = {};
      
      // 1. 并发性能测试
      results.concurrent = await this.concurrentTest('/health', 10, 50);
      
      // 2. 缓存一致性测试  
      results.cacheConsistency = await this.cacheConsistencyTest();
      
      // 3. 基准性能测试
      Object.assign(results, await this.benchmarkTest());
      
      // 生成最终报告
      this.generateReport(results);
      
      return results;
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error.message);
      process.exit(1);
    }
  }
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:8787';
  
  console.log('启动性能测试...');
  const test = new PerformanceTest(baseUrl);
  test.runFullTest().then(() => {
    console.log('\n✅ 性能测试完成');
    process.exit(0);
  }).catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
}

module.exports = { PerformanceTest };