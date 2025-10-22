/**
 * Dashboard API 性能基准测试
 * 
 * 用法：
 *   node scripts/benchmark-dashboard.js <environment> [iterations]
 * 
 * 示例：
 *   node scripts/benchmark-dashboard.js test 10
 *   node scripts/benchmark-dashboard.js dev 20
 */

const environments = {
  local: 'http://localhost:8787',
  dev: 'https://your-dev-worker.workers.dev',
  test: 'https://your-test-worker.workers.dev',
};

const env = process.argv[2] || 'local';
const iterations = parseInt(process.argv[3]) || 10;
const baseURL = environments[env];

if (!baseURL) {
  console.error(`❌ Unknown environment: ${env}`);
  console.error(`Available: ${Object.keys(environments).join(', ')}`);
  process.exit(1);
}

async function benchmark(name, url) {
  const times = [];
  
  console.log(`\n📊 Benchmarking: ${name}`);
  console.log(`URL: ${url}`);
  console.log(`Iterations: ${iterations}\n`);

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    try {
      const response = await fetch(url);
      const duration = Date.now() - start;
      
      if (!response.ok) {
        console.error(`  ❌ Iteration ${i + 1}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      times.push(duration);
      
      // 显示第一次和最后一次的数据样本
      if (i === 0) {
        console.log(`  📦 Sample response:`, JSON.stringify(data, null, 2).substring(0, 500) + '...');
      }
      
      process.stdout.write(`  ✓ Iteration ${i + 1}/${iterations}: ${duration}ms\r`);
    } catch (error) {
      console.error(`  ❌ Iteration ${i + 1}: ${error.message}`);
    }
  }

  console.log('\n');

  if (times.length === 0) {
    console.error(`❌ All requests failed\n`);
    return;
  }

  // 计算统计数据
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  console.log(`📈 Results:`);
  console.log(`  • Successful requests: ${times.length}/${iterations}`);
  console.log(`  • Min:  ${min}ms`);
  console.log(`  • P50:  ${p50}ms`);
  console.log(`  • P95:  ${p95}ms`);
  console.log(`  • P99:  ${p99}ms`);
  console.log(`  • Max:  ${max}ms`);
  console.log(`  • Avg:  ${avg.toFixed(2)}ms`);

  // 性能评估
  if (p95 < 500) {
    console.log(`  ✅ P95 < 500ms - 性能优秀`);
  } else if (p95 < 1000) {
    console.log(`  ⚠️  P95 < 1s - 性能一般，建议优化`);
  } else if (p95 < 2000) {
    console.log(`  ⚠️  P95 < 2s - 性能较差，需要优化`);
  } else {
    console.log(`  ❌ P95 > 2s - 性能严重问题，必须优化`);
  }

  console.log('');
}

async function main() {
  console.log(`🚀 Dashboard API Benchmark`);
  console.log(`Environment: ${env}`);
  console.log(`Base URL: ${baseURL}`);
  console.log(`=`.repeat(60));

  // 测试 1: Overview 总览接口
  await benchmark(
    'Dashboard Overview',
    `${baseURL}/api/admin/dashboard/overview`
  );

  // 测试 2: Timeseries 24h
  await benchmark(
    'Timeseries 24h (requests)',
    `${baseURL}/api/admin/dashboard/timeseries?range=24h&metric=requests`
  );

  // 测试 3: Timeseries 7d
  await benchmark(
    'Timeseries 7d (requests)',
    `${baseURL}/api/admin/dashboard/timeseries?range=7d&metric=requests`
  );

  // 测试 4: Realtime Map
  await benchmark(
    'Realtime Map',
    `${baseURL}/api/admin/dashboard/realtime/recent?limit=20`
  );

  console.log(`✅ Benchmark completed\n`);
}

main().catch(console.error);

