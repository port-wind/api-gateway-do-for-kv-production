# 监控与运维系统

## 概述

本文档专注于路径统计系统的监控、运维和自动化管理。建立完善的监控体系，确保系统的稳定性、性能和成本可控性。

## 目录
- [监控架构设计](#监控架构设计)
- [关键指标监控](#关键指标监控)
- [自动化运维](#自动化运维)
- [告警体系](#告警体系)
- [运维面板](#运维面板)
- [故障恢复](#故障恢复)
- [Prometheus集成](#prometheus集成)

## 监控架构设计

### 监控层次结构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   业务层监控    │    │   应用层监控    │    │   基础设施监控  │
│                 │    │                 │    │                 │
│ • 数据准确性    │    │ • DO 实例状态   │    │ • Cloudflare    │
│ • 路径统计      │    │ • 响应时间      │    │   平台指标      │
│ • 用户行为      │    │ • 错误率        │    │ • 网络延迟      │
│ • 成本效益      │    │ • 持久化状态    │    │ • 存储使用      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                          ┌─────────────────┐
                          │   监控聚合器    │
                          │  (Analytics     │
                          │   Engine)       │
                          └─────────────────┘
                                   │
                          ┌─────────────────┐
                          │   告警中心      │
                          │ (Webhook/       │
                          │  Notification)  │
                          └─────────────────┘
```

### 监控数据流

```typescript
interface MonitoringPipeline {
  collection: {
    sources: ['DO_Metrics', 'Analytics_Engine', 'KV_Usage', 'R2_Stats'];
    frequency: '1min' | '5min' | '1hour' | '1day';
    retention: '7d' | '30d' | '90d' | '1year';
  };
  
  processing: {
    aggregation: 'real_time' | 'batch';
    filtering: 'anomaly_detection' | 'threshold_based';
    enrichment: 'geo_data' | 'user_segment' | 'cost_analysis';
  };
  
  alerting: {
    channels: ['webhook', 'email', 'slack', 'pagerduty'];
    escalation: 'severity_based' | 'time_based';
    suppression: 'duplicate_detection' | 'maintenance_mode';
  };
}
```

## 关键指标监控

### 1. 成本控制指标

```typescript
// 每日成本监控
interface DOCostMetrics {
  dailyRequests: number;           // 每日 DO 请求数
  activeDurationHours: number;     // 活跃时长（小时）
  storageUsageGB: number;          // 存储使用量
  projectedMonthlyCost: number;    // 预计月度成本
  costPerRequest: number;          // 单请求成本
  costTrend: 'increasing' | 'stable' | 'decreasing';
}

// 成本告警阈值
const COST_ALERTS = {
  dailyRequests: {
    warning: 80_000,     // 80% 免费额度
    critical: 100_000    // 超过免费额度
  },
  monthlyCost: {
    warning: 30,         // $30/月预警
    critical: 50         // $50/月临界
  },
  activeDuration: {
    perDO: 2,           // 单个DO活跃超过2小时
    total: 100          // 总活跃时长超过100小时/天
  },
  costPerRequest: {
    warning: 0.0001,    // $0.0001/请求
    critical: 0.0005    // $0.0005/请求
  }
};

class CostMonitor {
  async collectCostMetrics(env: Env): Promise<DOCostMetrics> {
    const metrics = {
      dailyRequests: await this.getDailyRequestCount(env),
      activeDurationHours: await this.getActiveDurationHours(env),
      storageUsageGB: await this.getStorageUsage(env),
      projectedMonthlyCost: 0,
      costPerRequest: 0,
      costTrend: 'stable' as const
    };

    // 计算成本
    const freeRequests = 1_000_000;
    const paidRequests = Math.max(0, metrics.dailyRequests * 30 - freeRequests);
    
    metrics.projectedMonthlyCost = 
      (paidRequests / 1_000_000) * 0.15 +  // Request cost
      (metrics.activeDurationHours * 30 * 0.128 / 1_000_000) * 12.50 + // Duration cost
      metrics.storageUsageGB * 0.20;      // Storage cost

    metrics.costPerRequest = metrics.dailyRequests > 0 
      ? metrics.projectedMonthlyCost / (metrics.dailyRequests * 30)
      : 0;

    // 分析成本趋势
    metrics.costTrend = await this.analyzeCostTrend(env, metrics);

    return metrics;
  }

  private async analyzeCostTrend(env: Env, current: DOCostMetrics): Promise<'increasing' | 'stable' | 'decreasing'> {
    const historical = await this.getHistoricalCosts(env, 7); // 7天历史
    
    if (historical.length < 3) return 'stable';
    
    const recentAvg = historical.slice(-3).reduce((sum, cost) => sum + cost, 0) / 3;
    const olderAvg = historical.slice(0, -3).reduce((sum, cost) => sum + cost, 0) / (historical.length - 3);
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private async getDailyRequestCount(env: Env): Promise<number> {
    // 从 Analytics Engine 获取实际请求数
    try {
      const query = `
        SELECT COUNT(*) as request_count
        FROM do_requests 
        WHERE timestamp > NOW() - INTERVAL '24 HOUR'
        AND object_type = 'path_collector'
      `;
      
      // 模拟查询结果
      return 50000; // 5万请求/天
    } catch (error) {
      console.warn('Failed to get daily request count:', error);
      return 0;
    }
  }

  private async getActiveDurationHours(env: Env): Promise<number> {
    // 估算DO活跃时长
    const activeIPs = await env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') as string[] || [];
    
    // 假设每个IP平均活跃1小时/天
    return activeIPs.length * 1;
  }
}
```

### 2. 性能监控指标

```typescript
interface DOPerformanceMetrics {
  responseTime: {
    avg: number;                     // 平均响应时间
    p50: number;                     // 中位数响应时间
    p95: number;                     // 95分位响应时间
    p99: number;                     // 99分位响应时间
  };
  
  throughput: {
    requestsPerSecond: number;       // 每秒请求数
    successfulRequests: number;      // 成功请求数
    failedRequests: number;          // 失败请求数
  };
  
  errors: {
    errorRate: number;               // 错误率
    timeoutRate: number;             // 超时率
    persistenceFailures: number;     // 持久化失败次数
  };
  
  resources: {
    memoryUsagePercentage: number;   // 内存使用百分比
    activeDOCount: number;           // 活跃DO数量
    avgPathsPerDO: number;           // 平均每DO路径数
  };
}

class PerformanceMonitor {
  private metrics: DOPerformanceMetrics;
  private slaThresholds = {
    maxP95ResponseTime: 50,          // 50ms
    maxErrorRate: 0.001,             // 0.1%
    maxTimeoutRate: 0.0001,          // 0.01%
    maxMemoryUsage: 0.8              // 80%
  };

  async collectPerformanceMetrics(env: Env): Promise<DOPerformanceMetrics> {
    const activeIPs = await this.getActiveIPs(env);
    const samples = await this.collectSampleMetrics(env, activeIPs.slice(0, 100)); // 采样前100个
    
    return {
      responseTime: this.calculateResponseTimeMetrics(samples),
      throughput: this.calculateThroughputMetrics(samples),
      errors: this.calculateErrorMetrics(samples),
      resources: await this.calculateResourceMetrics(env, activeIPs)
    };
  }

  private calculateResponseTimeMetrics(samples: any[]): any {
    const responseTimes = samples
      .filter(s => s.responseTime > 0)
      .map(s => s.responseTime)
      .sort((a, b) => a - b);
    
    if (responseTimes.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    return {
      avg: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
      p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99: responseTimes[Math.floor(responseTimes.length * 0.99)]
    };
  }

  private async collectSampleMetrics(env: Env, sampleIPs: string[]): Promise<any[]> {
    const samples = [];
    
    for (const ip of sampleIPs) {
      try {
        const startTime = performance.now();
        
        const doId = env.PATH_COLLECTOR.idFromName(ip);
        const collector = env.PATH_COLLECTOR.get(doId);
        
        const response = await collector.fetch('http://dummy/health');
        const endTime = performance.now();
        
        samples.push({
          ip,
          responseTime: endTime - startTime,
          success: response.ok,
          statusCode: response.status
        });
      } catch (error) {
        samples.push({
          ip,
          responseTime: -1,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return samples;
  }

  async checkSLACompliance(): Promise<SLAComplianceReport> {
    const metrics = await this.collectPerformanceMetrics({} as any);
    const violations = [];
    
    if (metrics.responseTime.p95 > this.slaThresholds.maxP95ResponseTime) {
      violations.push({
        type: 'response_time_violation',
        current: metrics.responseTime.p95,
        threshold: this.slaThresholds.maxP95ResponseTime,
        severity: 'high'
      });
    }
    
    if (metrics.errors.errorRate > this.slaThresholds.maxErrorRate) {
      violations.push({
        type: 'error_rate_violation',
        current: metrics.errors.errorRate,
        threshold: this.slaThresholds.maxErrorRate,
        severity: 'critical'
      });
    }
    
    return {
      compliant: violations.length === 0,
      violations,
      overallHealth: this.calculateOverallHealth(metrics),
      recommendations: this.generateRecommendations(violations)
    };
  }

  private calculateOverallHealth(metrics: DOPerformanceMetrics): number {
    let healthScore = 100;
    
    // 响应时间权重 30%
    const responseTimeScore = Math.max(0, 100 - (metrics.responseTime.p95 / this.slaThresholds.maxP95ResponseTime) * 30);
    
    // 错误率权重 40%
    const errorRateScore = Math.max(0, 100 - (metrics.errors.errorRate / this.slaThresholds.maxErrorRate) * 40);
    
    // 资源使用权重 30%
    const resourceScore = Math.max(0, 100 - (metrics.resources.memoryUsagePercentage / this.slaThresholds.maxMemoryUsage) * 30);
    
    return Math.min(100, (responseTimeScore + errorRateScore + resourceScore) / 3);
  }
}

interface SLAComplianceReport {
  compliant: boolean;
  violations: any[];
  overallHealth: number;
  recommendations: string[];
}
```

### 3. 业务监控指标

```typescript
interface BusinessMetrics {
  dataQuality: {
    accuracyRate: number;            // 数据准确率
    completenessRate: number;        // 数据完整性
    consistencyScore: number;        // 数据一致性评分
  };
  
  usage: {
    uniqueIPs: number;               // 活跃 IP 数量
    totalPaths: number;              // 总路径数量
    avgPathsPerIP: number;           // 平均每IP路径数
    newPathsDaily: number;           // 每日新增路径
  };
  
  growth: {
    ipGrowthRate: number;            // IP增长率
    pathGrowthRate: number;          // 路径增长率
    requestGrowthRate: number;       // 请求增长率
  };
  
  efficiency: {
    cacheHitRate: number;            // 缓存命中率
    batchEfficiency: number;         // 批量处理效率
    costEfficiency: number;          // 成本效率
  };
}

class BusinessMetricsCollector {
  async collectBusinessMetrics(env: Env): Promise<BusinessMetrics> {
    const [dataQuality, usage, growth, efficiency] = await Promise.all([
      this.collectDataQualityMetrics(env),
      this.collectUsageMetrics(env),
      this.collectGrowthMetrics(env),
      this.collectEfficiencyMetrics(env)
    ]);
    
    return { dataQuality, usage, growth, efficiency };
  }

  private async collectDataQualityMetrics(env: Env): Promise<any> {
    // 数据质量评估
    const sampleSize = 100;
    const sampleIPs = await this.getSampleIPs(env, sampleSize);
    
    let accurateCount = 0;
    let completeCount = 0;
    
    for (const ip of sampleIPs) {
      try {
        const doData = await this.getDOData(env, ip);
        const expectedData = await this.getExpectedData(env, ip);
        
        // 检查准确性（计数差异在5%以内认为准确）
        if (Math.abs(doData.totalRequests - expectedData.totalRequests) <= expectedData.totalRequests * 0.05) {
          accurateCount++;
        }
        
        // 检查完整性（路径数据完整）
        if (doData.paths && doData.paths.length > 0) {
          completeCount++;
        }
      } catch (error) {
        console.warn(`Failed to check data quality for IP ${ip}:`, error);
      }
    }
    
    return {
      accuracyRate: sampleSize > 0 ? accurateCount / sampleSize : 0,
      completenessRate: sampleSize > 0 ? completeCount / sampleSize : 0,
      consistencyScore: await this.calculateConsistencyScore(env)
    };
  }

  private async calculateConsistencyScore(env: Env): Promise<number> {
    // 检查数据一致性：DO数据与聚合数据的一致性
    try {
      const aggregatorId = env.GLOBAL_STATS_AGGREGATOR?.idFromName('singleton');
      if (!aggregatorId) return 1.0;
      
      const aggregator = env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
      const globalStats = await aggregator.fetch('http://dummy/global-stats');
      
      if (!globalStats.ok) return 0.8; // 默认评分
      
      const stats = await globalStats.json();
      const expectedTotal = stats.totalRequests;
      
      // 随机抽样验证
      const actualTotal = await this.calculateActualTotal(env);
      const consistency = Math.max(0, 1 - Math.abs(expectedTotal - actualTotal) / expectedTotal);
      
      return consistency;
    } catch (error) {
      console.warn('Failed to calculate consistency score:', error);
      return 0.8;
    }
  }

  private async collectGrowthMetrics(env: Env): Promise<any> {
    const currentMetrics = await this.getCurrentPeriodMetrics(env);
    const previousMetrics = await this.getPreviousPeriodMetrics(env);
    
    return {
      ipGrowthRate: this.calculateGrowthRate(previousMetrics.uniqueIPs, currentMetrics.uniqueIPs),
      pathGrowthRate: this.calculateGrowthRate(previousMetrics.totalPaths, currentMetrics.totalPaths),
      requestGrowthRate: this.calculateGrowthRate(previousMetrics.totalRequests, currentMetrics.totalRequests)
    };
  }

  private calculateGrowthRate(previous: number, current: number): number {
    if (previous === 0) return current > 0 ? 1.0 : 0;
    return (current - previous) / previous;
  }
}
```

## 自动化运维

### 1. 成本优化自动化

```typescript
// 自动休眠优化
class DOCostOptimizer {
  private idleThreshold = 10 * 60 * 1000; // 10分钟无活动
  private maxConcurrentOptimizations = 10;
  
  async optimizeIdleDOs(env: Env): Promise<OptimizationReport> {
    const report = {
      totalChecked: 0,
      forcedSleep: 0,
      errors: 0,
      estimatedSavings: 0
    };
    
    try {
      const activeIPs = await this.getActiveIPs(env);
      report.totalChecked = activeIPs.length;
      
      // 批量处理，避免过载
      const batchSize = this.maxConcurrentOptimizations;
      for (let i = 0; i < activeIPs.length; i += batchSize) {
        const batch = activeIPs.slice(i, i + batchSize);
        const batchResult = await this.optimizeBatch(env, batch);
        
        report.forcedSleep += batchResult.forcedSleep;
        report.errors += batchResult.errors;
        report.estimatedSavings += batchResult.estimatedSavings;
      }
      
      // 记录优化结果
      await this.recordOptimizationResult(env, report);
      
    } catch (error) {
      console.error('Cost optimization failed:', error);
      report.errors++;
    }
    
    return report;
  }
  
  private async optimizeBatch(env: Env, ipBatch: string[]): Promise<any> {
    const result = { forcedSleep: 0, errors: 0, estimatedSavings: 0 };
    
    const promises = ipBatch.map(async (ip) => {
      try {
        const doId = env.PATH_COLLECTOR.idFromName(ip);
        const collector = env.PATH_COLLECTOR.get(doId);
        
        // 获取DO状态
        const healthResponse = await collector.fetch('http://dummy/health');
        if (!healthResponse.ok) {
          result.errors++;
          return;
        }
        
        const health = await healthResponse.json();
        const lastActivity = new Date(health.lastActivity).getTime();
        
        if (Date.now() - lastActivity > this.idleThreshold) {
          // 触发最终持久化
          const persistResponse = await collector.fetch('http://dummy/persist');
          if (persistResponse.ok) {
            result.forcedSleep++;
            // 估算节省的成本（假设节省1小时活跃时间）
            result.estimatedSavings += 0.128 * 12.50 / 1_000_000; // $0.000016 per hour
          } else {
            result.errors++;
          }
        }
      } catch (error) {
        console.warn(`Failed to optimize DO for IP ${ip}:`, error);
        result.errors++;
      }
    });
    
    await Promise.allSettled(promises);
    return result;
  }
  
  // 预测并告警成本异常
  async predictCostAnomalies(env: Env): Promise<CostAnomalyReport> {
    const currentUsage = await this.getCurrentUsage(env);
    const projectedMonthlyCost = this.projectMonthlyCost(currentUsage);
    
    const anomalies = [];
    
    // 检查成本趋势
    if (projectedMonthlyCost > COST_ALERTS.monthlyCost.critical) {
      anomalies.push({
        type: 'cost_overrun',
        severity: 'critical',
        projected: projectedMonthlyCost,
        threshold: COST_ALERTS.monthlyCost.critical,
        recommendation: '立即启用成本优化策略'
      });
    }
    
    // 检查异常增长
    const growthRate = await this.calculateCostGrowthRate(env);
    if (growthRate > 0.5) { // 50%增长
      anomalies.push({
        type: 'rapid_growth',
        severity: 'warning',
        growthRate,
        recommendation: '分析增长原因，考虑限流或清理'
      });
    }
    
    // 发送告警
    if (anomalies.length > 0) {
      await this.sendCostAlert(env, anomalies);
    }
    
    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
      projectedMonthlyCost,
      recommendations: this.generateCostRecommendations(anomalies)
    };
  }

  private async getCurrentUsage(env: Env): Promise<UsageMetrics> {
    const activeIPs = await this.getActiveIPs(env);
    const today = new Date().toISOString().split('T')[0];
    
    // 从存储中获取当日使用情况
    const usageKey = `daily-usage:${today}`;
    const storedUsage = await env.API_GATEWAY_STORAGE.get(usageKey, 'json') as any;
    
    return {
      activeIPs: activeIPs.length,
      dailyRequests: storedUsage?.requests || 0,
      activeDurationHours: storedUsage?.activeDurationHours || 0,
      storageGB: storedUsage?.storageGB || 0
    };
  }

  private projectMonthlyCost(usage: UsageMetrics): number {
    const monthlyRequests = usage.dailyRequests * 30;
    const monthlyDuration = usage.activeDurationHours * 30;
    const monthlyStorage = usage.storageGB;
    
    const freeRequests = 1_000_000;
    const paidRequests = Math.max(0, monthlyRequests - freeRequests);
    
    return (
      (paidRequests / 1_000_000) * 0.15 +           // Request cost
      (monthlyDuration * 0.128 / 1_000_000) * 12.50 + // Duration cost  
      monthlyStorage * 0.20                          // Storage cost
    );
  }
}

interface OptimizationReport {
  totalChecked: number;
  forcedSleep: number;
  errors: number;
  estimatedSavings: number;
}

interface CostAnomalyReport {
  hasAnomalies: boolean;
  anomalies: any[];
  projectedMonthlyCost: number;
  recommendations: string[];
}

interface UsageMetrics {
  activeIPs: number;
  dailyRequests: number;
  activeDurationHours: number;
  storageGB: number;
}
```

### 2. 数据清理自动化

```typescript
// 定期清理策略
class DODataCleaner {
  private cleanupSchedule = {
    inactive_dos: '0 2 * * *',      // 每日凌晨2点
    old_paths: '0 3 * * 0',         // 每周日凌晨3点
    archive_stats: '0 4 1 * *'       // 每月1号凌晨4点
  };
  
  async scheduleCleanup(env: Env): Promise<CleanupReport> {
    const report = {
      totalProcessed: 0,
      cleanedItems: 0,
      archivedItems: 0,
      errors: [],
      estimatedSpaceSaved: 0
    };
    
    try {
      // 并行执行清理任务
      const cleanupTasks = [
        this.cleanupInactiveDOs(env),      // 清理30天无活动的DO
        this.compactFrequentPaths(env),    // 压缩高频路径数据
        this.archiveOldStatistics(env)     // 归档历史统计
      ];
      
      const results = await Promise.allSettled(cleanupTasks);
      
      // 汇总结果
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const taskResult = result.value;
          report.totalProcessed += taskResult.processed;
          report.cleanedItems += taskResult.cleaned;
          report.archivedItems += taskResult.archived;
          report.estimatedSpaceSaved += taskResult.spaceSaved;
        } else {
          report.errors.push(`Task ${i} failed: ${result.reason}`);
        }
      }
      
    } catch (error) {
      report.errors.push(`Cleanup scheduling failed: ${error}`);
    }
    
    return report;
  }
  
  async cleanupInactiveDOs(env: Env): Promise<TaskResult> {
    const result = { processed: 0, cleaned: 0, archived: 0, spaceSaved: 0 };
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30天前
    
    try {
      const allIPs = await this.getAllTrackedIPs(env);
      result.processed = allIPs.length;
      
      for (const ip of allIPs) {
        try {
          const doId = env.PATH_COLLECTOR.idFromName(ip);
          const collector = env.PATH_COLLECTOR.get(doId);
          
          // 检查最后活动时间
          const healthResponse = await collector.fetch('http://dummy/health');
          if (!healthResponse.ok) continue;
          
          const health = await healthResponse.json();
          const lastActivity = new Date(health.lastActivity).getTime();
          
          if (lastActivity < cutoff) {
            // 归档数据后清理
            const archiveResult = await this.archiveDOData(env, ip, health);
            if (archiveResult.success) {
              await collector.fetch('http://dummy/cleanup');
              result.cleaned++;
              result.spaceSaved += archiveResult.spaceSaved;
            }
          }
        } catch (error) {
          console.warn(`Failed to cleanup DO for IP ${ip}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Inactive DO cleanup failed:', error);
      throw error;
    }
    
    return result;
  }
  
  async compactFrequentPaths(env: Env): Promise<TaskResult> {
    const result = { processed: 0, cleaned: 0, archived: 0, spaceSaved: 0 };
    
    try {
      // 获取高频访问的IP（请求数 > 1000）
      const frequentIPs = await this.getFrequentIPs(env, 1000);
      result.processed = frequentIPs.length;
      
      for (const ip of frequentIPs) {
        try {
          const doId = env.PATH_COLLECTOR.idFromName(ip);
          const collector = env.PATH_COLLECTOR.get(doId);
          
          // 触发路径数据压缩
          const compactResponse = await collector.fetch('http://dummy/compact');
          if (compactResponse.ok) {
            const compactResult = await compactResponse.json();
            result.cleaned += compactResult.compactedPaths || 0;
            result.spaceSaved += compactResult.spaceSaved || 0;
          }
        } catch (error) {
          console.warn(`Failed to compact paths for IP ${ip}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Path compaction failed:', error);
      throw error;
    }
    
    return result;
  }
  
  async archiveOldStatistics(env: Env): Promise<TaskResult> {
    const result = { processed: 0, cleaned: 0, archived: 0, spaceSaved: 0 };
    
    try {
      // 归档90天前的统计数据
      const archiveCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      
      // 获取需要归档的数据
      const statsToArchive = await this.getOldStatistics(env, archiveCutoff);
      result.processed = statsToArchive.length;
      
      if (statsToArchive.length > 0) {
        // 创建归档文件
        const archiveData = {
          timestamp: new Date().toISOString(),
          period: { from: new Date(archiveCutoff).toISOString(), to: new Date().toISOString() },
          data: statsToArchive
        };
        
        const archiveKey = `archive-${new Date().toISOString().split('T')[0]}.json`;
        
        if (env.BACKUP_STORAGE) {
          // 归档到R2
          await env.BACKUP_STORAGE.put(archiveKey, JSON.stringify(archiveData));
        } else {
          // 归档到KV
          await env.API_GATEWAY_STORAGE.put(`archive:${archiveKey}`, JSON.stringify(archiveData));
        }
        
        result.archived = statsToArchive.length;
        result.spaceSaved = JSON.stringify(archiveData).length;
        
        // 删除原始数据
        await this.deleteOldStatistics(env, statsToArchive);
      }
      
    } catch (error) {
      console.error('Statistics archival failed:', error);
      throw error;
    }
    
    return result;
  }

  private async archiveDOData(env: Env, ip: string, healthData: any): Promise<{success: boolean, spaceSaved: number}> {
    try {
      if (!env.BACKUP_STORAGE) return { success: false, spaceSaved: 0 };
      
      const archiveKey = `do-archive/${ip}/${new Date().toISOString().split('T')[0]}.json`;
      const archiveData = JSON.stringify(healthData);
      
      await env.BACKUP_STORAGE.put(archiveKey, archiveData);
      
      return { success: true, spaceSaved: archiveData.length };
    } catch (error) {
      console.warn(`Failed to archive DO data for IP ${ip}:`, error);
      return { success: false, spaceSaved: 0 };
    }
  }
}

interface CleanupReport {
  totalProcessed: number;
  cleanedItems: number;
  archivedItems: number;
  errors: string[];
  estimatedSpaceSaved: number;
}

interface TaskResult {
  processed: number;
  cleaned: number;
  archived: number;
  spaceSaved: number;
}
```

## 告警体系

### 1. 分级告警系统

```typescript
enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

interface Alert {
  id: string;
  level: AlertLevel;
  metric: string;
  current: number;
  threshold: number;
  message: string;
  suggestion: string;
  timestamp: number;
  resolved: boolean;
}

class AlertManager {
  private alertHistory = new Map<string, number>();
  private activeAlerts = new Map<string, Alert>();
  
  // 告警规则配置
  private readonly ALERT_RULES = [
    {
      metric: 'daily_requests',
      thresholds: {
        warning: 80_000,
        critical: 100_000
      },
      message: {
        warning: 'DO 请求量接近免费额度',
        critical: 'DO 请求量超出免费额度'
      },
      cooldown: {
        warning: 2 * 60 * 60 * 1000,  // 2小时
        critical: 30 * 60 * 1000      // 30分钟
      }
    },
    {
      metric: 'monthly_cost',
      thresholds: {
        warning: 30,
        critical: 50
      },
      message: {
        warning: '月度成本接近预算',
        critical: '月度成本超出预算'
      },
      cooldown: {
        warning: 4 * 60 * 60 * 1000,  // 4小时
        critical: 1 * 60 * 60 * 1000  // 1小时
      }
    },
    {
      metric: 'error_rate',
      thresholds: {
        warning: 0.005,  // 0.5%
        critical: 0.01   // 1%
      },
      message: {
        warning: 'DO 错误率偏高',
        critical: 'DO 错误率严重超标'
      },
      cooldown: {
        warning: 1 * 60 * 60 * 1000,  // 1小时
        critical: 15 * 60 * 1000      // 15分钟
      }
    },
    {
      metric: 'p95_response_time',
      thresholds: {
        warning: 100,    // 100ms
        critical: 200    // 200ms
      },
      message: {
        warning: 'DO 响应时间偏慢',
        critical: 'DO 响应时间严重超标'
      },
      cooldown: {
        warning: 30 * 60 * 1000,      // 30分钟
        critical: 10 * 60 * 1000      // 10分钟
      }
    }
  ];

  async processMetrics(metrics: any): Promise<Alert[]> {
    const newAlerts: Alert[] = [];
    
    for (const rule of this.ALERT_RULES) {
      const current = this.extractMetricValue(metrics, rule.metric);
      const alerts = this.checkThresholds(rule, current);
      
      for (const alert of alerts) {
        if (await this.shouldSendAlert(alert)) {
          newAlerts.push(alert);
          this.activeAlerts.set(alert.id, alert);
        }
      }
    }
    
    // 检查已解决的告警
    await this.checkResolvedAlerts(metrics);
    
    return newAlerts;
  }

  private checkThresholds(rule: any, current: number): Alert[] {
    const alerts: Alert[] = [];
    
    // 检查严重级别
    if (current >= rule.thresholds.critical) {
      alerts.push({
        id: `${rule.metric}_critical_${Date.now()}`,
        level: AlertLevel.CRITICAL,
        metric: rule.metric,
        current,
        threshold: rule.thresholds.critical,
        message: rule.message.critical,
        suggestion: this.generateSuggestion(rule.metric, AlertLevel.CRITICAL, current),
        timestamp: Date.now(),
        resolved: false
      });
    }
    // 检查警告级别（只有不是严重级别时才发警告）
    else if (current >= rule.thresholds.warning) {
      alerts.push({
        id: `${rule.metric}_warning_${Date.now()}`,
        level: AlertLevel.WARNING,
        metric: rule.metric,
        current,
        threshold: rule.thresholds.warning,
        message: rule.message.warning,
        suggestion: this.generateSuggestion(rule.metric, AlertLevel.WARNING, current),
        timestamp: Date.now(),
        resolved: false
      });
    }
    
    return alerts;
  }

  private generateSuggestion(metric: string, level: AlertLevel, current: number): string {
    const suggestions = {
      daily_requests: {
        warning: '监控请求增长趋势，考虑优化批次大小',
        critical: '立即启用请求限流，联系技术团队'
      },
      monthly_cost: {
        warning: '检查DO休眠策略，清理无用数据',
        critical: '立即启用成本优化，暂停非关键功能'
      },
      error_rate: {
        warning: '检查DO健康状态，查看错误日志',
        critical: '立即启用降级策略，切换到KV模式'
      },
      p95_response_time: {
        warning: '检查DO内存使用，考虑预热策略',
        critical: '立即检查网络状况，可能需要降级'
      }
    };
    
    return suggestions[metric]?.[level] || '请联系技术团队进行检查';
  }

  private async shouldSendAlert(alert: Alert): Promise<boolean> {
    const alertKey = `${alert.metric}_${alert.level}`;
    const lastAlertTime = this.alertHistory.get(alertKey) || 0;
    
    // 获取冷却期
    const rule = this.ALERT_RULES.find(r => r.metric === alert.metric);
    const cooldownPeriod = rule?.cooldown[alert.level] || 60 * 60 * 1000; // 默认1小时
    
    // 检查是否在冷却期内
    if (Date.now() - lastAlertTime < cooldownPeriod) {
      return false;
    }
    
    // 检查是否是重复告警
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      a => a.metric === alert.metric && a.level === alert.level && !a.resolved
    );
    
    if (existingAlert) {
      return false;
    }
    
    return true;
  }

  async sendAlert(alert: Alert, env: Env): Promise<void> {
    try {
      // 更新告警历史
      const alertKey = `${alert.metric}_${alert.level}`;
      this.alertHistory.set(alertKey, alert.timestamp);
      
      // 发送到多个渠道
      await Promise.allSettled([
        this.sendWebhookAlert(alert, env),
        this.sendSlackAlert(alert, env),
        this.logAlert(alert, env)
      ]);
      
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }

  private async sendWebhookAlert(alert: Alert, env: Env): Promise<void> {
    if (!env.ALERT_WEBHOOK_URL) return;
    
    const payload = {
      alert_type: 'path_collector_monitoring',
      level: alert.level,
      metric: alert.metric,
      message: alert.message,
      current_value: alert.current,
      threshold: alert.threshold,
      suggestion: alert.suggestion,
      timestamp: new Date(alert.timestamp).toISOString(),
      system: 'path-statistics-do'
    };
    
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  private async checkResolvedAlerts(metrics: any): Promise<void> {
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.resolved) continue;
      
      const current = this.extractMetricValue(metrics, alert.metric);
      
      // 检查是否已低于阈值
      if (current < alert.threshold * 0.9) { // 10%缓冲区避免抖动
        alert.resolved = true;
        alert.timestamp = Date.now();
        
        // 发送解决通知
        await this.sendResolutionNotification(alert);
      }
    }
  }

  private extractMetricValue(metrics: any, metricName: string): number {
    const metricMap = {
      'daily_requests': metrics.cost?.dailyRequests || 0,
      'monthly_cost': metrics.cost?.projectedMonthlyCost || 0,
      'error_rate': metrics.performance?.errors?.errorRate || 0,
      'p95_response_time': metrics.performance?.responseTime?.p95 || 0
    };
    
    return metricMap[metricName] || 0;
  }
}
```

### 2. 智能告警去重

```typescript
// 避免告警风暴
class SmartAlerting {
  private alertGroups = new Map<string, AlertGroup>();
  private suppressionRules = new Map<string, SuppressionRule>();
  
  async processAlert(alert: Alert): Promise<AlertAction> {
    // 检查抑制规则
    if (await this.isAlertSuppressed(alert)) {
      return { action: 'suppress', reason: 'suppression_rule_matched' };
    }
    
    // 检查告警分组
    const group = this.getOrCreateAlertGroup(alert);
    group.alerts.push(alert);
    
    // 检查是否应该聚合发送
    if (this.shouldAggregateGroup(group)) {
      return { action: 'aggregate', groupId: group.id };
    }
    
    // 检查告警频率限制
    if (await this.isRateLimited(alert)) {
      return { action: 'rate_limit', reason: 'too_frequent' };
    }
    
    return { action: 'send', immediate: true };
  }

  private async isAlertSuppressed(alert: Alert): Promise<boolean> {
    // 维护期间抑制所有非关键告警
    if (await this.isMaintenanceMode() && alert.level !== AlertLevel.CRITICAL) {
      return true;
    }
    
    // 检查自定义抑制规则
    for (const [ruleId, rule] of this.suppressionRules.entries()) {
      if (this.matchesSuppressionRule(alert, rule)) {
        return true;
      }
    }
    
    return false;
  }

  private getOrCreateAlertGroup(alert: Alert): AlertGroup {
    const groupKey = `${alert.metric}_${alert.level}`;
    
    if (!this.alertGroups.has(groupKey)) {
      this.alertGroups.set(groupKey, {
        id: groupKey,
        alerts: [],
        firstAlert: Date.now(),
        lastAlert: Date.now(),
        count: 0
      });
    }
    
    const group = this.alertGroups.get(groupKey)!;
    group.lastAlert = Date.now();
    group.count++;
    
    return group;
  }

  private shouldAggregateGroup(group: AlertGroup): boolean {
    const maxGroupSize = 5;
    const maxGroupDuration = 5 * 60 * 1000; // 5分钟
    
    return (
      group.alerts.length >= maxGroupSize ||
      (Date.now() - group.firstAlert) >= maxGroupDuration
    );
  }

  async createAggregatedAlert(groupId: string): Promise<Alert> {
    const group = this.alertGroups.get(groupId);
    if (!group || group.alerts.length === 0) {
      throw new Error('Invalid group for aggregation');
    }
    
    const firstAlert = group.alerts[0];
    const aggregatedAlert: Alert = {
      id: `aggregated_${groupId}_${Date.now()}`,
      level: firstAlert.level,
      metric: firstAlert.metric,
      current: Math.max(...group.alerts.map(a => a.current)),
      threshold: firstAlert.threshold,
      message: `${group.alerts.length} similar alerts: ${firstAlert.message}`,
      suggestion: firstAlert.suggestion,
      timestamp: Date.now(),
      resolved: false
    };
    
    // 清空分组
    group.alerts = [];
    group.count = 0;
    
    return aggregatedAlert;
  }
}

interface AlertGroup {
  id: string;
  alerts: Alert[];
  firstAlert: number;
  lastAlert: number;
  count: number;
}

interface SuppressionRule {
  id: string;
  metric?: string;
  level?: AlertLevel;
  timeRange?: { start: string; end: string };
  reason: string;
}

interface AlertAction {
  action: 'send' | 'suppress' | 'aggregate' | 'rate_limit';
  reason?: string;
  groupId?: string;
  immediate?: boolean;
}
```

## 运维面板

### 1. 实时监控面板API

```typescript
// GET /api/admin/do-monitor
interface DOMonitorResponse {
  summary: {
    totalDOs: number;
    activeDOs: number;
    idleDOs: number;
    dailyCost: number;
    projectedMonthlyCost: number;
    healthScore: number;
  };
  
  performance: {
    avgResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    successRate: number;
    throughputRPS: number;
  };
  
  resources: {
    totalMemoryMB: number;
    avgMemoryPerDO: number;
    totalPaths: number;
    avgPathsPerDO: number;
    storageUsageGB: number;
  };
  
  topIPs: Array<{
    ip: string;
    requests: number;
    paths: number;
    lastActivity: string;
    responseTime: number;
    errorRate: number;
  }>;
  
  alerts: Alert[];
  
  trends: {
    last24h: MetricTrend;
    last7d: MetricTrend;
    last30d: MetricTrend;
  };
}

interface MetricTrend {
  requests: number[];
  responseTimes: number[];
  errorRates: number[];
  costs: number[];
  timestamps: string[];
}

class MonitoringDashboard {
  async getDashboardData(env: Env): Promise<DOMonitorResponse> {
    const [summary, performance, resources, topIPs, alerts, trends] = await Promise.all([
      this.collectSummaryMetrics(env),
      this.collectPerformanceMetrics(env),
      this.collectResourceMetrics(env),
      this.getTopIPs(env),
      this.getActiveAlerts(env),
      this.getTrendData(env)
    ]);
    
    return {
      summary,
      performance,
      resources,
      topIPs,
      alerts,
      trends
    };
  }

  private async collectSummaryMetrics(env: Env): Promise<any> {
    const activeIPs = await this.getActiveIPs(env);
    const costMetrics = await this.getCostMetrics(env);
    const healthScore = await this.calculateSystemHealth(env);
    
    // 检查空闲DO数量
    let idleDOs = 0;
    const idleThreshold = 30 * 60 * 1000; // 30分钟
    
    for (const ip of activeIPs.slice(0, 50)) { // 采样检查
      try {
        const doId = env.PATH_COLLECTOR.idFromName(ip);
        const collector = env.PATH_COLLECTOR.get(doId);
        const response = await collector.fetch('http://dummy/health');
        
        if (response.ok) {
          const health = await response.json();
          const lastActivity = new Date(health.lastActivity).getTime();
          
          if (Date.now() - lastActivity > idleThreshold) {
            idleDOs++;
          }
        }
      } catch (error) {
        // 忽略单个DO检查失败
      }
    }
    
    // 按比例估算总空闲DO数量
    const sampledRatio = Math.min(50, activeIPs.length) / activeIPs.length;
    const estimatedIdleDOs = Math.floor(idleDOs / sampledRatio);
    
    return {
      totalDOs: activeIPs.length,
      activeDOs: activeIPs.length - estimatedIdleDOs,
      idleDOs: estimatedIdleDOs,
      dailyCost: costMetrics.dailyCost,
      projectedMonthlyCost: costMetrics.projectedMonthlyCost,
      healthScore
    };
  }

  private async getTopIPs(env: Env, limit: number = 10): Promise<any[]> {
    try {
      // 从Analytics Engine获取热门IP
      const query = `
        SELECT 
          ip,
          COUNT(*) as requests,
          COUNT(DISTINCT path) as paths,
          MAX(timestamp) as last_activity,
          AVG(response_time) as avg_response_time,
          SUM(CASE WHEN error = 1 THEN 1 ELSE 0 END) / COUNT(*) as error_rate
        FROM path_collection_metrics
        WHERE timestamp > NOW() - INTERVAL '24 HOUR'
        GROUP BY ip
        ORDER BY requests DESC
        LIMIT ${limit}
      `;
      
      // 模拟查询结果
      const mockResults = [
        { ip: '192.168.1.100', requests: 5420, paths: 45, last_activity: new Date().toISOString(), avg_response_time: 12.3, error_rate: 0.001 },
        { ip: '10.0.1.50', requests: 3280, paths: 32, last_activity: new Date().toISOString(), avg_response_time: 15.7, error_rate: 0.002 },
        { ip: '172.16.0.25', requests: 2156, paths: 28, last_activity: new Date().toISOString(), avg_response_time: 11.9, error_rate: 0.0005 }
      ];
      
      return mockResults.map(result => ({
        ip: result.ip,
        requests: result.requests,
        paths: result.paths,
        lastActivity: result.last_activity,
        responseTime: Math.round(result.avg_response_time * 100) / 100,
        errorRate: Math.round(result.error_rate * 10000) / 10000
      }));
      
    } catch (error) {
      console.warn('Failed to get top IPs:', error);
      return [];
    }
  }

  private async getTrendData(env: Env): Promise<any> {
    // 获取趋势数据，用于图表展示
    const now = Date.now();
    const trends = {
      last24h: await this.getTrendForPeriod(env, now - 24 * 60 * 60 * 1000, now, '1h'),
      last7d: await this.getTrendForPeriod(env, now - 7 * 24 * 60 * 60 * 1000, now, '6h'),
      last30d: await this.getTrendForPeriod(env, now - 30 * 24 * 60 * 60 * 1000, now, '1d')
    };
    
    return trends;
  }

  private async getTrendForPeriod(env: Env, start: number, end: number, interval: string): Promise<MetricTrend> {
    // 模拟趋势数据
    const points = 24; // 24个数据点
    const timeStep = (end - start) / points;
    
    const trend: MetricTrend = {
      requests: [],
      responseTimes: [],
      errorRates: [],
      costs: [],
      timestamps: []
    };
    
    for (let i = 0; i < points; i++) {
      const timestamp = new Date(start + i * timeStep);
      trend.timestamps.push(timestamp.toISOString());
      
      // 模拟波动数据
      const baseRequests = 1000;
      const requestVariation = Math.sin(i / points * Math.PI * 2) * 200;
      trend.requests.push(Math.max(0, baseRequests + requestVariation + Math.random() * 100));
      
      trend.responseTimes.push(10 + Math.random() * 20);
      trend.errorRates.push(Math.random() * 0.01);
      trend.costs.push(0.1 + Math.random() * 0.05);
    }
    
    return trend;
  }
}
```

### 2. 成本分析面板

```typescript
// 成本趋势分析
interface CostAnalysis {
  period: {
    start: string;
    end: string;
    days: number;
  };
  
  current: {
    dailyCost: number;
    projectedMonthlyCost: number;
    actualMonthlyCost: number;
  };
  
  breakdown: {
    requestCost: number;
    durationCost: number;
    storageCost: number;
    percentages: {
      requests: number;
      duration: number;
      storage: number;
    };
  };
  
  trends: {
    daily: Array<{
      date: string;
      requests: number;
      cost: number;
      activeDOs: number;
      avgDurationHours: number;
    }>;
    weekly: Array<{
      week: string;
      totalCost: number;
      avgDailyCost: number;
      peakDailyCost: number;
    }>;
  };
  
  optimization: {
    potentialSavings: number;
    recommendations: Array<{
      type: 'cost_reduction' | 'efficiency_improvement';
      title: string;
      description: string;
      estimatedSavings: number;
      effort: 'low' | 'medium' | 'high';
    }>;
  };
  
  forecasting: {
    nextMonth: {
      projected: number;
      confidence: number;
      factors: string[];
    };
    nextQuarter: {
      projected: number;
      confidence: number;
      assumptions: string[];
    };
  };
}

class CostAnalyzer {
  async generateCostAnalysis(env: Env, days: number = 30): Promise<CostAnalysis> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    
    const [current, breakdown, trends, optimization, forecasting] = await Promise.all([
      this.getCurrentCosts(env),
      this.getCostBreakdown(env),
      this.getCostTrends(env, startDate, endDate),
      this.generateOptimizationRecommendations(env),
      this.generateCostForecast(env)
    ]);
    
    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days
      },
      current,
      breakdown,
      trends,
      optimization,
      forecasting
    };
  }

  private async generateOptimizationRecommendations(env: Env): Promise<any> {
    const recommendations = [];
    const metrics = await this.getCurrentMetrics(env);
    
    // 分析空闲DO优化机会
    if (metrics.idleDOPercentage > 0.3) {
      recommendations.push({
        type: 'cost_reduction',
        title: '优化空闲DO休眠',
        description: `当前有${Math.round(metrics.idleDOPercentage * 100)}%的DO处于空闲状态，启用自动休眠可显著节省成本`,
        estimatedSavings: metrics.idleCost * 0.8,
        effort: 'low'
      });
    }
    
    // 分析批量处理优化
    if (metrics.avgBatchSize < 5) {
      recommendations.push({
        type: 'efficiency_improvement',
        title: '增加批量处理大小',
        description: '当前批量大小较小，增加到10可减少持久化频率，降低成本',
        estimatedSavings: metrics.persistenceCost * 0.4,
        effort: 'medium'
      });
    }
    
    // 分析数据清理机会
    if (metrics.oldDataPercentage > 0.5) {
      recommendations.push({
        type: 'cost_reduction',
        title: '清理历史数据',
        description: '超过50%的数据为30天前的历史数据，清理可节省存储成本',
        estimatedSavings: metrics.storageCost * 0.5,
        effort: 'low'
      });
    }
    
    const totalSavings = recommendations.reduce((sum, rec) => sum + rec.estimatedSavings, 0);
    
    return {
      potentialSavings: totalSavings,
      recommendations
    };
  }

  private async generateCostForecast(env: Env): Promise<any> {
    const historicalData = await this.getHistoricalUsage(env, 90); // 90天历史
    const trends = this.analyzeTrends(historicalData);
    
    const nextMonthProjected = this.projectCost(trends, 30);
    const nextQuarterProjected = this.projectCost(trends, 90);
    
    return {
      nextMonth: {
        projected: nextMonthProjected.cost,
        confidence: nextMonthProjected.confidence,
        factors: [
          `基于${trends.requestGrowthRate > 0 ? '增长' : '下降'}${Math.abs(trends.requestGrowthRate * 100).toFixed(1)}%的请求趋势`,
          `考虑${trends.seasonalFactor > 1 ? '季节性增长' : '季节性下降'}因素`,
          '假设当前优化策略持续有效'
        ]
      },
      nextQuarter: {
        projected: nextQuarterProjected.cost,
        confidence: nextQuarterProjected.confidence,
        assumptions: [
          '用户增长率保持当前水平',
          '没有重大架构变更',
          'Cloudflare定价保持稳定',
          '数据保留策略不变'
        ]
      }
    };
  }

  private projectCost(trends: any, days: number): { cost: number; confidence: number } {
    // 基于趋势数据投射成本
    const baseDaily = trends.avgDailyCost;
    const growthRate = trends.requestGrowthRate;
    const seasonalFactor = trends.seasonalFactor;
    
    // 简化的投射模型
    const projectedDaily = baseDaily * (1 + growthRate) * seasonalFactor;
    const projectedTotal = projectedDaily * days;
    
    // 置信度基于历史数据的稳定性
    const volatility = trends.volatility || 0.1;
    const confidence = Math.max(0.5, 1 - volatility);
    
    return {
      cost: projectedTotal,
      confidence
    };
  }

  private analyzeTrends(historicalData: any[]): any {
    if (historicalData.length < 7) {
      return {
        avgDailyCost: 0.5,
        requestGrowthRate: 0,
        seasonalFactor: 1,
        volatility: 0.1
      };
    }
    
    const costs = historicalData.map(d => d.cost);
    const avgCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    
    // 计算增长率（简化线性回归）
    const recentCosts = costs.slice(-7);
    const olderCosts = costs.slice(0, 7);
    const recentAvg = recentCosts.reduce((sum, cost) => sum + cost, 0) / recentCosts.length;
    const olderAvg = olderCosts.reduce((sum, cost) => sum + cost, 0) / olderCosts.length;
    
    const growthRate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
    
    // 计算波动性
    const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - avgCost, 2), 0) / costs.length;
    const volatility = Math.sqrt(variance) / avgCost;
    
    return {
      avgDailyCost: avgCost,
      requestGrowthRate: growthRate,
      seasonalFactor: 1 + Math.sin(Date.now() / (30 * 24 * 60 * 60 * 1000)) * 0.1, // 模拟季节性
      volatility
    };
  }
}
```

## 故障恢复

### 1. 自动降级策略

```typescript
// 自动降级机制
class FallbackStrategy {
  private fallbackMode = false;
  private fallbackStartTime = 0;
  private maxFallbackDuration = 60 * 60 * 1000; // 1小时最大降级时间
  
  async recordPath(env: Env, clientIP: string, path: string, method: string, metadata: any): Promise<void> {
    // 检查是否在降级模式
    if (this.fallbackMode) {
      await this.recordPathKV(env, path, method, metadata);
      return;
    }
    
    try {
      // 尝试 DO 方案
      await this.recordPathToDO(env, clientIP, path, method, metadata);
      
      // 成功后检查是否可以退出降级模式
      if (this.fallbackMode && this.shouldExitFallback()) {
        await this.exitFallbackMode(env);
      }
      
    } catch (error) {
      console.error('DO path collection failed:', error);
      
      // 检查是否需要启用降级
      if (await this.shouldEnableFallback(error)) {
        await this.enableFallbackMode(env, error);
      }
      
      // 降级到 KV 方案
      await this.recordPathKV(env, path, method, metadata);
    }
  }
  
  private async shouldEnableFallback(error: any): Promise<boolean> {
    // 检查错误类型和频率
    const errorPatterns = [
      /timeout/i,
      /connection/i,
      /internal server error/i,
      /service unavailable/i
    ];
    
    const isSystemError = errorPatterns.some(pattern => 
      pattern.test(error.message || error.toString())
    );
    
    if (!isSystemError) return false;
    
    // 检查错误频率
    const recentErrors = await this.getRecentErrorCount();
    const errorThreshold = 5; // 5分钟内5个错误
    
    return recentErrors >= errorThreshold;
  }
  
  private async enableFallbackMode(env: Env, error: any): Promise<void> {
    this.fallbackMode = true;
    this.fallbackStartTime = Date.now();
    
    // 记录降级事件
    await this.logFallbackEvent(env, 'ENABLED', {
      reason: error.message,
      timestamp: Date.now()
    });
    
    // 发送告警
    await this.sendFallbackAlert(env, {
      type: 'fallback_enabled',
      reason: error.message,
      expectedDuration: '1 hour maximum'
    });
  }
  
  private shouldExitFallback(): boolean {
    // 检查是否超过最大降级时间
    if (Date.now() - this.fallbackStartTime > this.maxFallbackDuration) {
      return true;
    }
    
    // 检查系统恢复状况
    // 这里可以添加健康检查逻辑
    
    return false;
  }
  
  private async exitFallbackMode(env: Env): Promise<void> {
    this.fallbackMode = false;
    
    // 记录恢复事件
    await this.logFallbackEvent(env, 'DISABLED', {
      duration: Date.now() - this.fallbackStartTime,
      timestamp: Date.now()
    });
    
    // 发送恢复通知
    await this.sendFallbackAlert(env, {
      type: 'fallback_disabled',
      duration: Math.round((Date.now() - this.fallbackStartTime) / 1000 / 60) + ' minutes'
    });
  }

  private async recordPathToDO(env: Env, clientIP: string, path: string, method: string, metadata: any): Promise<void> {
    const doId = env.PATH_COLLECTOR.idFromName(clientIP);
    const collector = env.PATH_COLLECTOR.get(doId);
    
    const url = new URL('http://dummy/record');
    url.searchParams.set('path', path);
    url.searchParams.set('method', method);
    if (metadata.userAgent) url.searchParams.set('userAgent', metadata.userAgent);
    if (metadata.country) url.searchParams.set('country', metadata.country);
    
    const response = await collector.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`DO request failed with status ${response.status}`);
    }
  }
  
  private async recordPathKV(env: Env, path: string, method: string, metadata: any): Promise<void> {
    // 降级到原有KV方案
    const pathKey = `${method}:${path}`;
    const unifiedKey = 'unified-paths-v2';
    
    try {
      const existing = await env.API_GATEWAY_STORAGE.get(unifiedKey, 'json') || {};
      
      if (!existing[pathKey]) {
        existing[pathKey] = {};
      }
      
      const ipKey = metadata.clientIP || 'unknown';
      if (!existing[pathKey][ipKey]) {
        existing[pathKey][ipKey] = {
          count: 0,
          firstSeen: new Date().toISOString(),
          method,
          userAgent: metadata.userAgent,
          country: metadata.country
        };
      }
      
      existing[pathKey][ipKey].count++;
      existing[pathKey][ipKey].lastAccessed = new Date().toISOString();
      
      await env.API_GATEWAY_STORAGE.put(unifiedKey, JSON.stringify(existing));
      
    } catch (kvError) {
      console.error('KV fallback also failed:', kvError);
      // 最后的降级：记录到日志
      await this.logFailedRequest(env, { path, method, metadata, error: kvError });
    }
  }
}
```

### 2. 数据恢复工具

```typescript
// 数据恢复工具
class DataRecovery {
  
  /**
   * 从备份恢复丢失的数据
   */
  async recoverFromBackup(env: Env, backupId: string, targetIPs?: string[]): Promise<RecoveryReport> {
    const report = {
      success: false,
      processedIPs: 0,
      restoredPaths: 0,
      errors: [] as string[],
      duration: 0
    };
    
    const startTime = Date.now();
    
    try {
      // 获取备份数据
      const backupData = await this.loadBackupData(env, backupId);
      if (!backupData) {
        report.errors.push(`Backup ${backupId} not found`);
        return report;
      }
      
      // 过滤目标IP（如果指定）
      const ipsToRecover = targetIPs || Object.keys(backupData);
      report.processedIPs = ipsToRecover.length;
      
      // 批量恢复
      const batchSize = 20;
      for (let i = 0; i < ipsToRecover.length; i += batchSize) {
        const batch = ipsToRecover.slice(i, i + batchSize);
        const batchResult = await this.recoverBatch(env, batch, backupData);
        
        report.restoredPaths += batchResult.restoredPaths;
        report.errors.push(...batchResult.errors);
      }
      
      report.success = report.errors.length === 0;
      report.duration = Date.now() - startTime;
      
    } catch (error) {
      report.errors.push(`Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return report;
  }
  
  /**
   * 数据一致性检查和修复
   */
  async validateAndRepairData(env: Env, sampleSize: number = 100): Promise<ConsistencyReport> {
    const report = {
      totalChecked: 0,
      inconsistencies: 0,
      repairs: 0,
      errors: [] as string[]
    };
    
    try {
      // 获取样本IP
      const allIPs = await this.getAllActiveIPs(env);
      const sampleIPs = this.selectRandomSample(allIPs, sampleSize);
      report.totalChecked = sampleIPs.length;
      
      for (const ip of sampleIPs) {
        try {
          const inconsistency = await this.checkIPConsistency(env, ip);
          
          if (inconsistency.hasIssues) {
            report.inconsistencies++;
            
            // 尝试修复
            const repairResult = await this.repairIPData(env, ip, inconsistency);
            if (repairResult.success) {
              report.repairs++;
            } else {
              report.errors.push(`Failed to repair IP ${ip}: ${repairResult.error}`);
            }
          }
          
        } catch (error) {
          report.errors.push(`Failed to check IP ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
    } catch (error) {
      report.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return report;
  }
  
  private async checkIPConsistency(env: Env, ip: string): Promise<InconsistencyReport> {
    const report = {
      ip,
      hasIssues: false,
      issues: [] as string[],
      doData: null,
      expectedData: null
    };
    
    try {
      // 获取DO中的数据
      const doId = env.PATH_COLLECTOR.idFromName(ip);
      const collector = env.PATH_COLLECTOR.get(doId);
      
      const pathsResponse = await collector.fetch('http://dummy/paths');
      if (pathsResponse.ok) {
        report.doData = await pathsResponse.json();
      } else {
        report.issues.push('Cannot fetch DO data');
        report.hasIssues = true;
      }
      
      // 获取预期数据（从聚合统计或其他来源）
      report.expectedData = await this.getExpectedDataForIP(env, ip);
      
      // 比较数据
      if (report.doData && report.expectedData) {
        const comparison = this.compareData(report.doData, report.expectedData);
        report.issues.push(...comparison.issues);
        report.hasIssues = comparison.issues.length > 0;
      }
      
    } catch (error) {
      report.issues.push(`Consistency check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      report.hasIssues = true;
    }
    
    return report;
  }
  
  private async repairIPData(env: Env, ip: string, inconsistency: InconsistencyReport): Promise<RepairResult> {
    try {
      // 根据不一致类型选择修复策略
      if (inconsistency.issues.includes('missing_paths')) {
        return await this.repairMissingPaths(env, ip, inconsistency);
      }
      
      if (inconsistency.issues.includes('incorrect_counts')) {
        return await this.repairIncorrectCounts(env, ip, inconsistency);
      }
      
      if (inconsistency.issues.includes('corrupted_data')) {
        return await this.repairCorruptedData(env, ip, inconsistency);
      }
      
      return { success: false, error: 'Unknown inconsistency type' };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  private async repairMissingPaths(env: Env, ip: string, inconsistency: InconsistencyReport): Promise<RepairResult> {
    try {
      const doId = env.PATH_COLLECTOR.idFromName(ip);
      const collector = env.PATH_COLLECTOR.get(doId);
      
      // 从预期数据中恢复缺失的路径
      const missingPaths = this.findMissingPaths(inconsistency.doData, inconsistency.expectedData);
      
      for (const pathData of missingPaths) {
        const recordUrl = new URL('http://dummy/record');
        recordUrl.searchParams.set('path', pathData.path);
        recordUrl.searchParams.set('method', pathData.method);
        
        // 重建计数（最多重建100次，避免过度恢复）
        const count = Math.min(pathData.count, 100);
        for (let i = 0; i < count; i++) {
          await collector.fetch(recordUrl.toString());
        }
      }
      
      return { success: true };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  /**
   * 紧急数据导出
   */
  async emergencyExport(env: Env, outputFormat: 'json' | 'csv' = 'json'): Promise<ExportResult> {
    const result = {
      success: false,
      exportPath: '',
      recordCount: 0,
      fileSize: 0,
      errors: [] as string[]
    };
    
    try {
      const allIPs = await this.getAllActiveIPs(env);
      const exportData = [];
      
      // 快速导出所有数据
      const batchSize = 50;
      for (let i = 0; i < allIPs.length; i += batchSize) {
        const batch = allIPs.slice(i, i + batchSize);
        const batchData = await this.exportBatch(env, batch);
        exportData.push(...batchData);
      }
      
      result.recordCount = exportData.length;
      
      // 格式化并存储
      const formattedData = outputFormat === 'csv' 
        ? this.formatAsCSV(exportData)
        : JSON.stringify(exportData, null, 2);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `emergency-export-${timestamp}.${outputFormat}`;
      
      if (env.BACKUP_STORAGE) {
        await env.BACKUP_STORAGE.put(fileName, formattedData);
        result.exportPath = `R2:${fileName}`;
      } else {
        await env.API_GATEWAY_STORAGE.put(`export:${fileName}`, formattedData);
        result.exportPath = `KV:export:${fileName}`;
      }
      
      result.fileSize = formattedData.length;
      result.success = true;
      
    } catch (error) {
      result.errors.push(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return result;
  }
}

interface RecoveryReport {
  success: boolean;
  processedIPs: number;
  restoredPaths: number;
  errors: string[];
  duration: number;
}

interface ConsistencyReport {
  totalChecked: number;
  inconsistencies: number;
  repairs: number;
  errors: string[];
}

interface InconsistencyReport {
  ip: string;
  hasIssues: boolean;
  issues: string[];
  doData: any;
  expectedData: any;
}

interface RepairResult {
  success: boolean;
  error?: string;
}

interface ExportResult {
  success: boolean;
  exportPath: string;
  recordCount: number;
  fileSize: number;
  errors: string[];
}
```

## Prometheus集成

### DO指标导出器

```typescript
// src/lib/metrics-exporter.ts
export class DOMetricsExporter {
  
  /**
   * 收集并导出 Prometheus 格式的指标
   */
  async exportPrometheusMetrics(env: Env): Promise<string> {
    const activeIPs = await this.getActiveIPs(env);
    const metrics = {
      total_active_dos: 0,
      total_requests: 0,
      total_paths: 0,
      total_errors: 0,
      per_do_metrics: []
    };

    // 批量收集 DO 指标
    const batchSize = 50;
    for (let i = 0; i < activeIPs.length; i += batchSize) {
      const batch = activeIPs.slice(i, i + batchSize);
      await this.collectBatchMetrics(env, batch, metrics);
    }

    return this.formatPrometheusMetrics(metrics);
  }

  private async collectBatchMetrics(env: Env, ipBatch: string[], metrics: any): Promise<void> {
    const promises = ipBatch.map(async (ip) => {
      try {
        const doId = env.PATH_COLLECTOR.idFromName(ip);
        const collector = env.PATH_COLLECTOR.get(doId);
        
        const healthResponse = await collector.fetch('http://dummy/health');
        if (healthResponse.ok) {
          const health = await healthResponse.json();
          
          metrics.total_active_dos++;
          metrics.total_requests += health.totalRequests || 0;
          metrics.total_paths += health.pathCount || 0;
          
          metrics.per_do_metrics.push({
            ip: ip,
            requests: health.totalRequests || 0,
            paths: health.pathCount || 0,
            memory_usage: health.memoryUsage || 0,
            uptime: health.uptime || 0
          });
        }
      } catch (error) {
        metrics.total_errors++;
      }
    });
    
    await Promise.allSettled(promises);
  }

  private formatPrometheusMetrics(metrics: any): string {
    const output: string[] = [];
    
    // 总体指标
    output.push('# HELP path_collector_active_dos Total number of active Durable Objects');
    output.push('# TYPE path_collector_active_dos gauge');
    output.push(`path_collector_active_dos ${metrics.total_active_dos}`);
    
    output.push('# HELP path_collector_total_requests Total number of requests processed');
    output.push('# TYPE path_collector_total_requests counter');
    output.push(`path_collector_total_requests ${metrics.total_requests}`);
    
    output.push('# HELP path_collector_total_paths Total number of unique paths');
    output.push('# TYPE path_collector_total_paths gauge');
    output.push(`path_collector_total_paths ${metrics.total_paths}`);
    
    output.push('# HELP path_collector_collection_errors Total number of collection errors');
    output.push('# TYPE path_collector_collection_errors counter');
    output.push(`path_collector_collection_errors ${metrics.total_errors}`);
    
    // 每个DO的详细指标
    output.push('# HELP path_collector_do_requests Number of requests per DO');
    output.push('# TYPE path_collector_do_requests gauge');
    for (const doMetric of metrics.per_do_metrics) {
      output.push(`path_collector_do_requests{ip="${doMetric.ip}"} ${doMetric.requests}`);
    }
    
    output.push('# HELP path_collector_do_paths Number of paths per DO');
    output.push('# TYPE path_collector_do_paths gauge');
    for (const doMetric of metrics.per_do_metrics) {
      output.push(`path_collector_do_paths{ip="${doMetric.ip}"} ${doMetric.paths}`);
    }
    
    output.push('# HELP path_collector_do_memory_usage Memory usage per DO in bytes');
    output.push('# TYPE path_collector_do_memory_usage gauge');
    for (const doMetric of metrics.per_do_metrics) {
      output.push(`path_collector_do_memory_usage{ip="${doMetric.ip}"} ${doMetric.memory_usage}`);
    }
    
    return output.join('\n');
  }
}

// GET /api/admin/metrics - Prometheus指标端点
app.get('/metrics', async (c) => {
  try {
    const exporter = new DOMetricsExporter();
    const metrics = await exporter.exportPrometheusMetrics(c.env);
    
    return new Response(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
      }
    });
  } catch (error) {
    return c.json({ error: 'Failed to export metrics' }, 500);
  }
});
```

## 总结

本监控与运维系统提供了：

### ✅ 全面监控
- **多层指标**：成本、性能、业务指标全覆盖
- **实时监控**：毫秒级响应时间监控
- **趋势分析**：历史数据分析和预测

### ✅ 智能运维
- **自动优化**：成本和性能自动优化
- **智能告警**：分级告警和去重机制
- **自动清理**：数据生命周期自动管理

### ✅ 故障恢复
- **自动降级**：故障时自动切换到KV模式
- **数据恢复**：多种数据恢复和修复机制
- **一致性检查**：自动数据完整性验证

### ✅ 可视化面板
- **实时仪表板**：关键指标实时展示
- **成本分析**：详细的成本分析和优化建议
- **Prometheus集成**：标准化监控指标导出

## 下一步

继续实施后续阶段：

- **[06-security-protection.md](./06-security-protection.md)** - 安全防护机制
- **[07-implementation-plan.md](./07-implementation-plan.md)** - 实施计划与成本分析