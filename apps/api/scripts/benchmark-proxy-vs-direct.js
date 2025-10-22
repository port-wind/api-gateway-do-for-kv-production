#!/usr/bin/env node

/**
 * 代理 vs 直连性能对比测试
 * 
 * 功能：
 * 1. 对比通过 API Gateway 代理和直接访问源站的性能差异
 * 2. 测量多个性能指标：DNS、连接、TLS、首字节、总时间
 * 3. 计算 P50/P95/P99 等百分位数
 * 4. 识别性能瓶颈
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const dns = require('dns').promises;

// 配置
const config = {
  // 测试配置
  warmupRequests: 5,      // 预热请求数
  testRequests: 50,       // 正式测试请求数
  concurrency: 5,         // 并发数
  
  // 测试目标
  proxyUrl: 'https://api-proxy.pwtk.cc/biz-client/biz/relationship/batch-get',
  directUrl: 'https://biz-client.pwtk.cc/biz/relationship/batch-get',
  
  // 请求配置
  headers: {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en,en-US;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6',
    'businesstype': 'XTK',
    'cache-control': 'no-cache',
    'cid': '7376843548198440960.1.88fb130b6c541d26cceb9b79066b2b22b9aba357',
    'clienttype': 'C_WEB',
    'content-type': 'application/json',
    'origin': 'https://demo.pwtk.cc',
    'pragma': 'no-cache',
    'referer': 'https://demo.pwtk.cc/',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  },
  
  body: JSON.stringify({
    "targetUserIdList": [
      "1419717728603737560", "1426958892054610548", "1377322463452463107",
      "1304454470771408903", "1304501599984420846", "1289249852974170115",
      "1419638254369509156", "1419638186107211550", "1304500513764542441",
      "1309103765692874754", "1362005949899869629", "1352567054124714460",
      "1359531153609982636", "1308805892744937772", "1321816559647197001",
      "1402636777356789213", "1311992759522951177", "1387773546008152308",
      "1349415577281626492"
    ],
    "direct": 1
  })
};

/**
 * 执行单次请求并收集性能指标
 */
async function singleRequest(url, headers, body) {
  const parsedUrl = new URL(url);
  const startTime = Date.now();
  
  const timings = {
    dnsLookup: 0,
    tcpConnection: 0,
    tlsHandshake: 0,
    firstByte: 0,
    contentTransfer: 0,
    total: 0
  };
  
  return new Promise((resolve, reject) => {
    // DNS 查询计时
    const dnsStart = Date.now();
    dns.lookup(parsedUrl.hostname).then(() => {
      timings.dnsLookup = Date.now() - dnsStart;
    }).catch(() => {
      timings.dnsLookup = Date.now() - dnsStart;
    });
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    let tcpStart;
    let tlsStart;
    let firstByteTime;
    let responseData = '';
    
    const req = https.request(options, (res) => {
      // 记录首字节时间
      firstByteTime = Date.now();
      timings.firstByte = firstByteTime - startTime;
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        const endTime = Date.now();
        timings.total = endTime - startTime;
        timings.contentTransfer = endTime - firstByteTime;
        
        resolve({
          statusCode: res.statusCode,
          timings,
          dataSize: responseData.length,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });
    
    // 监听连接事件
    req.on('socket', (socket) => {
      tcpStart = Date.now();
      
      socket.on('lookup', () => {
        // DNS 完成
      });
      
      socket.on('connect', () => {
        timings.tcpConnection = Date.now() - tcpStart;
        tlsStart = Date.now();
      });
      
      socket.on('secureConnect', () => {
        timings.tlsHandshake = Date.now() - tlsStart;
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.setTimeout(30000); // 30秒超时
    req.write(body);
    req.end();
  });
}

/**
 * 批量执行请求（支持并发控制）
 */
async function batchRequests(url, headers, body, count, concurrency = 1) {
  const results = [];
  const queue = [];
  
  for (let i = 0; i < count; i++) {
    queue.push(i);
  }
  
  const runBatch = async () => {
    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);
      const promises = batch.map(() => 
        singleRequest(url, headers, body).catch(err => ({
          error: err.message,
          success: false,
          timings: { total: 0 }
        }))
      );
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // 显示进度
      process.stdout.write(`\r进度: ${results.length}/${count}`);
    }
  };
  
  await runBatch();
  console.log(); // 换行
  return results;
}

/**
 * 计算统计数据
 */
function calculateStats(values) {
  if (values.length === 0) return null;
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    stdDev: Math.sqrt(
      sorted.reduce((sum, val) => sum + Math.pow(val - (sum / sorted.length || 0), 2), 0) / sorted.length
    )
  };
}

/**
 * 分析结果
 */
function analyzeResults(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length === 0) {
    return {
      successRate: 0,
      failedCount: failed.length,
      stats: null
    };
  }
  
  return {
    successRate: (successful.length / results.length) * 100,
    failedCount: failed.length,
    stats: {
      dnsLookup: calculateStats(successful.map(r => r.timings.dnsLookup)),
      tcpConnection: calculateStats(successful.map(r => r.timings.tcpConnection)),
      tlsHandshake: calculateStats(successful.map(r => r.timings.tlsHandshake)),
      firstByte: calculateStats(successful.map(r => r.timings.firstByte)),
      contentTransfer: calculateStats(successful.map(r => r.timings.contentTransfer)),
      total: calculateStats(successful.map(r => r.timings.total))
    },
    avgDataSize: successful.reduce((sum, r) => sum + (r.dataSize || 0), 0) / successful.length
  };
}

/**
 * 格式化时间
 */
function formatTime(ms) {
  if (ms === null || ms === undefined) return 'N/A';
  return `${ms.toFixed(2)}ms`;
}

/**
 * 打印结果表格
 */
function printResults(name, analysis) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ${name}`);
  console.log(`${'='.repeat(80)}`);
  
  if (!analysis.stats) {
    console.log('❌ 所有请求失败');
    return;
  }
  
  console.log(`\n✅ 成功率: ${analysis.successRate.toFixed(2)}%`);
  console.log(`❌ 失败数: ${analysis.failedCount}`);
  console.log(`📦 平均响应大小: ${(analysis.avgDataSize / 1024).toFixed(2)} KB`);
  
  console.log(`\n⏱️  性能指标 (单位: ms):`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`${'指标'.padEnd(20)} ${'最小值'.padStart(10)} ${'P50'.padStart(10)} ${'P95'.padStart(10)} ${'P99'.padStart(10)} ${'最大值'.padStart(10)} ${'平均'.padStart(10)}`);
  console.log(`${'─'.repeat(80)}`);
  
  const metrics = [
    ['DNS 查询', analysis.stats.dnsLookup],
    ['TCP 连接', analysis.stats.tcpConnection],
    ['TLS 握手', analysis.stats.tlsHandshake],
    ['首字节时间 (TTFB)', analysis.stats.firstByte],
    ['内容传输', analysis.stats.contentTransfer],
    ['总时间', analysis.stats.total]
  ];
  
  metrics.forEach(([label, stats]) => {
    if (!stats) return;
    console.log(
      `${label.padEnd(20)} ` +
      `${formatTime(stats.min).padStart(10)} ` +
      `${formatTime(stats.p50).padStart(10)} ` +
      `${formatTime(stats.p95).padStart(10)} ` +
      `${formatTime(stats.p99).padStart(10)} ` +
      `${formatTime(stats.max).padStart(10)} ` +
      `${formatTime(stats.mean).padStart(10)}`
    );
  });
}

/**
 * 打印对比分析
 */
function printComparison(proxyAnalysis, directAnalysis) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 代理 vs 直连对比分析`);
  console.log(`${'='.repeat(80)}`);
  
  if (!proxyAnalysis.stats || !directAnalysis.stats) {
    console.log('❌ 无法进行对比（部分测试失败）');
    return;
  }
  
  const proxyTotal = proxyAnalysis.stats.total;
  const directTotal = directAnalysis.stats.total;
  
  console.log(`\n⏱️  总响应时间对比:`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`${'指标'.padEnd(20)} ${'代理'.padStart(12)} ${'直连'.padStart(12)} ${'差值'.padStart(12)} ${'增加比例'.padStart(12)}`);
  console.log(`${'─'.repeat(80)}`);
  
  const metrics = ['p50', 'p95', 'p99', 'mean'];
  metrics.forEach(metric => {
    const proxyVal = proxyTotal[metric];
    const directVal = directTotal[metric];
    const diff = proxyVal - directVal;
    const percentage = ((diff / directVal) * 100).toFixed(2);
    
    console.log(
      `${metric.toUpperCase().padEnd(20)} ` +
      `${formatTime(proxyVal).padStart(12)} ` +
      `${formatTime(directVal).padStart(12)} ` +
      `${formatTime(diff).padStart(12)} ` +
      `${(percentage + '%').padStart(12)}`
    );
  });
  
  // 分析瓶颈
  console.log(`\n🎯 瓶颈分析:`);
  console.log(`${'─'.repeat(80)}`);
  
  const proxyOverhead = {
    dns: proxyAnalysis.stats.dnsLookup.mean,
    tcp: proxyAnalysis.stats.tcpConnection.mean,
    tls: proxyAnalysis.stats.tlsHandshake.mean,
    processing: proxyAnalysis.stats.firstByte.mean - 
                proxyAnalysis.stats.dnsLookup.mean - 
                proxyAnalysis.stats.tcpConnection.mean - 
                proxyAnalysis.stats.tlsHandshake.mean,
    transfer: proxyAnalysis.stats.contentTransfer.mean
  };
  
  const directOverhead = {
    dns: directAnalysis.stats.dnsLookup.mean,
    tcp: directAnalysis.stats.tcpConnection.mean,
    tls: directAnalysis.stats.tlsHandshake.mean,
    processing: directAnalysis.stats.firstByte.mean - 
                directAnalysis.stats.dnsLookup.mean - 
                directAnalysis.stats.tcpConnection.mean - 
                directAnalysis.stats.tlsHandshake.mean,
    transfer: directAnalysis.stats.contentTransfer.mean
  };
  
  console.log(`\n代理路径耗时分解 (平均):`);
  console.log(`  DNS 查询:        ${formatTime(proxyOverhead.dns)}`);
  console.log(`  TCP 连接:        ${formatTime(proxyOverhead.tcp)}`);
  console.log(`  TLS 握手:        ${formatTime(proxyOverhead.tls)}`);
  console.log(`  处理时间:        ${formatTime(proxyOverhead.processing)}`);
  console.log(`  内容传输:        ${formatTime(proxyOverhead.transfer)}`);
  
  console.log(`\n直连路径耗时分解 (平均):`);
  console.log(`  DNS 查询:        ${formatTime(directOverhead.dns)}`);
  console.log(`  TCP 连接:        ${formatTime(directOverhead.tcp)}`);
  console.log(`  TLS 握手:        ${formatTime(directOverhead.tls)}`);
  console.log(`  处理时间:        ${formatTime(directOverhead.processing)}`);
  console.log(`  内容传输:        ${formatTime(directOverhead.transfer)}`);
  
  // 识别主要差异
  const diffs = {
    dns: Math.abs(proxyOverhead.dns - directOverhead.dns),
    tcp: Math.abs(proxyOverhead.tcp - directOverhead.tcp),
    tls: Math.abs(proxyOverhead.tls - directOverhead.tls),
    processing: Math.abs(proxyOverhead.processing - directOverhead.processing),
    transfer: Math.abs(proxyOverhead.transfer - directOverhead.transfer)
  };
  
  const maxDiff = Math.max(...Object.values(diffs));
  const bottleneck = Object.entries(diffs).find(([_, val]) => val === maxDiff);
  
  const bottleneckNames = {
    dns: 'DNS 查询',
    tcp: 'TCP 连接建立',
    tls: 'TLS 握手',
    processing: 'Worker 处理 + 源站响应',
    transfer: '内容传输'
  };
  
  console.log(`\n💡 主要瓶颈: ${bottleneckNames[bottleneck[0]]} (差异: ${formatTime(maxDiff)})`);
  
  // 给出优化建议
  console.log(`\n📝 优化建议:`);
  console.log(`${'─'.repeat(80)}`);
  
  if (proxyOverhead.processing > directOverhead.processing + 50) {
    console.log(`⚠️  Worker 处理时间较长，建议:`);
    console.log(`   - 检查 Worker 内部逻辑，减少不必要的计算`);
    console.log(`   - 优化 D1 查询，添加索引或使用预聚合`);
    console.log(`   - 考虑使用 KV 缓存热点数据`);
    console.log(`   - 使用 wrangler tail 分析详细耗时`);
  }
  
  if (proxyOverhead.transfer > directOverhead.transfer + 20) {
    console.log(`⚠️  内容传输时间较长，建议:`);
    console.log(`   - 检查响应体大小，考虑压缩`);
    console.log(`   - 启用流式传输避免缓冲整个响应`);
  }
  
  if (proxyOverhead.dns + proxyOverhead.tcp + proxyOverhead.tls > 100) {
    console.log(`⚠️  网络连接耗时较长，建议:`);
    console.log(`   - 利用 Cloudflare CDN 边缘节点`);
    console.log(`   - 确保 HTTP/2 或 HTTP/3 连接复用`);
    console.log(`   - 考虑源站网络优化`);
  }
  
  const avgDiff = proxyTotal.mean - directTotal.mean;
  if (avgDiff < 50) {
    console.log(`\n✅ 性能良好！代理仅增加 ${formatTime(avgDiff)} 延迟 (${((avgDiff / directTotal.mean) * 100).toFixed(1)}%)`);
  } else if (avgDiff < 150) {
    console.log(`\n⚠️  性能可接受，代理增加 ${formatTime(avgDiff)} 延迟 (${((avgDiff / directTotal.mean) * 100).toFixed(1)}%)`);
  } else {
    console.log(`\n🚨 性能需要优化！代理增加 ${formatTime(avgDiff)} 延迟 (${((avgDiff / directTotal.mean) * 100).toFixed(1)}%)`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     🚀 API 代理性能对比测试工具                               ║
║                                                                               ║
║  测试配置:                                                                    ║
║    - 预热请求: ${config.warmupRequests} 次                                              ║
║    - 测试请求: ${config.testRequests} 次                                             ║
║    - 并发数: ${config.concurrency}                                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
  `);
  
  try {
    // 1. 测试代理路径
    console.log('\n🔵 第一阶段: 测试代理路径');
    console.log(`📍 URL: ${config.proxyUrl}\n`);
    
    console.log('⏳ 预热中...');
    await batchRequests(
      config.proxyUrl,
      config.headers,
      config.body,
      config.warmupRequests,
      config.concurrency
    );
    
    console.log('📊 正式测试中...');
    const proxyResults = await batchRequests(
      config.proxyUrl,
      config.headers,
      config.body,
      config.testRequests,
      config.concurrency
    );
    
    const proxyAnalysis = analyzeResults(proxyResults);
    printResults('代理路径测试结果', proxyAnalysis);
    
    // 短暂休息
    console.log('\n⏸️  休息 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. 测试直连路径
    console.log('\n🔵 第二阶段: 测试直连路径');
    console.log(`📍 URL: ${config.directUrl}\n`);
    
    console.log('⏳ 预热中...');
    await batchRequests(
      config.directUrl,
      config.headers,
      config.body,
      config.warmupRequests,
      config.concurrency
    );
    
    console.log('📊 正式测试中...');
    const directResults = await batchRequests(
      config.directUrl,
      config.headers,
      config.body,
      config.testRequests,
      config.concurrency
    );
    
    const directAnalysis = analyzeResults(directResults);
    printResults('直连路径测试结果', directAnalysis);
    
    // 3. 对比分析
    printComparison(proxyAnalysis, directAnalysis);
    
    console.log(`\n${'═'.repeat(80)}`);
    console.log('✅ 测试完成！');
    console.log(`${'═'.repeat(80)}\n`);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { singleRequest, batchRequests, analyzeResults };

