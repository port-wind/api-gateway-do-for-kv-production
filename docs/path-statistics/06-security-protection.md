# 安全防护机制

API 网关作为系统的入口点，需要面对各种安全威胁。本文档详细描述了基于 Durable Objects 的路径统计系统的安全防护机制，包括 DDoS 防护、异常行为检测、数据隐私保护等核心安全功能。

## 目录

- [DDoS 防护策略](#ddos-防护策略)
- [异常行为检测](#异常行为检测)
- [自适应限流](#自适应限流)
- [数据隐私保护](#数据隐私保护)
- [输入验证与安全](#输入验证与安全)
- [安全监控与告警](#安全监控与告警)
- [最佳实践建议](#最佳实践建议)

## DDoS 防护策略

### 多层防护架构

实现基于多层检查的 DDoS 防护系统，提供全面的攻击防护能力。

```typescript
// src/lib/security-manager.ts
export class SecurityManager {
  
  /**
   * DDoS 防护检查
   * 实现多层防护机制，确保系统安全
   */
  async checkDDoSProtection(
    env: Env,
    clientIP: string,
    path: string,
    context: RequestContext
  ): Promise<SecurityCheckResult> {
    
    // 第一层：IP 级别限流
    const ipRateLimit = await this.checkIPRateLimit(env, clientIP);
    if (!ipRateLimit.allowed) {
      return {
        allowed: false,
        reason: 'IP_RATE_LIMIT_EXCEEDED',
        resetAt: ipRateLimit.resetAt
      };
    }
    
    // 第二层：路径级别限流
    const pathRateLimit = await this.checkPathRateLimit(env, path);
    if (!pathRateLimit.allowed) {
      return {
        allowed: false,
        reason: 'PATH_RATE_LIMIT_EXCEEDED',
        resetAt: pathRateLimit.resetAt
      };
    }
    
    // 第三层：异常行为检测
    const behaviorCheck = await this.checkAbnormalBehavior(env, clientIP, context);
    if (!behaviorCheck.allowed) {
      return {
        allowed: false,
        reason: 'ABNORMAL_BEHAVIOR_DETECTED',
        details: behaviorCheck.details
      };
    }
    
    return { allowed: true };
  }

  /**
   * IP 级别限流检查
   * 基于滑动窗口算法实现 IP 级限流
   */
  private async checkIPRateLimit(
    env: Env,
    clientIP: string
  ): Promise<RateLimitResult> {
    
    // 获取 IP 专用的 DO 实例
    const doId = env.RATE_LIMITER.idFromName(clientIP);
    const rateLimiter = env.RATE_LIMITER.get(doId);
    
    const response = await rateLimiter.fetch(new Request('http://dummy/check-rate-limit', {
      method: 'POST',
      body: JSON.stringify({
        clientIP,
        timestamp: Date.now()
      })
    }));
    
    return await response.json();
  }

  /**
   * 路径级别限流检查
   * 防止特定路径被过度访问
   */
  private async checkPathRateLimit(
    env: Env,
    path: string
  ): Promise<RateLimitResult> {
    
    // 对敏感路径实施更严格的限流
    const pathLimits = {
      '/api/admin/*': { limit: 10, window: 60 }, // 管理接口：每分钟10次
      '/api/auth/*': { limit: 5, window: 300 },  // 认证接口：每5分钟5次
      '/api/*': { limit: 100, window: 60 },      // 一般API：每分钟100次
      '*': { limit: 200, window: 60 }            // 其他路径：每分钟200次
    };
    
    const config = this.getPathLimitConfig(path, pathLimits);
    const key = `path_limit:${path}`;
    
    // 使用 KV 存储路径访问计数（简单场景足够）
    const current = await env.API_GATEWAY_STORAGE.get(key, 'json') || { count: 0, window: Date.now() };
    const now = Date.now();
    
    // 检查窗口是否需要重置
    if (now - current.window > config.window * 1000) {
      current.count = 0;
      current.window = now;
    }
    
    current.count++;
    
    // 更新计数
    await env.API_GATEWAY_STORAGE.put(key, JSON.stringify(current), {
      expirationTtl: config.window
    });
    
    return {
      allowed: current.count <= config.limit,
      remaining: Math.max(0, config.limit - current.count),
      resetAt: current.window + (config.window * 1000)
    };
  }
}
```

## 异常行为检测

### 智能威胁检测

实现基于行为模式的异常检测系统，自动识别和阻止恶意行为。

```typescript
/**
 * 异常行为检测
 * 基于多个指标进行综合威胁评估
 */
private async checkAbnormalBehavior(
  env: Env,
  clientIP: string,
  context: RequestContext
): Promise<SecurityCheckResult> {
  
  // 检测指标
  const indicators = {
    // 高频请求模式
    highFrequencyPattern: await this.detectHighFrequencyPattern(env, clientIP),
    
    // 路径爬虫行为
    crawlerBehavior: await this.detectCrawlerBehavior(env, clientIP),
    
    // IP 伪造检测
    ipSpoofing: await this.detectIPSpoofing(context),
    
    // User-Agent 分析
    suspiciousUserAgent: this.analyzeSuspiciousUserAgent(context.userAgent)
  };
  
  // 威胁评分计算
  const threatScore = this.calculateThreatScore(indicators);
  
  if (threatScore > 75) { // 高威胁阈值
    // 添加到黑名单
    await this.addToBlacklist(env, clientIP, {
      reason: 'HIGH_THREAT_SCORE',
      score: threatScore,
      indicators,
      timestamp: Date.now()
    });
    
    return {
      allowed: false,
      reason: 'HIGH_THREAT_SCORE',
      details: { score: threatScore, indicators }
    };
  }
  
  return { allowed: true };
}

/**
 * 高频请求模式检测
 * 识别异常的请求频率模式
 */
private async detectHighFrequencyPattern(
  env: Env,
  clientIP: string
): Promise<boolean> {
  
  // 从 PathCollectorDO 获取请求历史
  const doId = env.PATH_COLLECTOR.idFromName(clientIP);
  const collector = env.PATH_COLLECTOR.get(doId);
  
  const response = await collector.fetch(new Request('http://dummy/get-request-pattern'));
  const pattern = await response.json();
  
  // 检测指标
  const indicators = [
    pattern.requestsPerSecond > 10,        // 每秒超过10个请求
    pattern.burstRequests > 50,            // 突发请求超过50个
    pattern.pathVariety < 3,               // 访问路径种类少于3个
    pattern.userAgentConsistency > 0.95    // User-Agent 一致性过高
  ];
  
  // 多个指标同时满足认为是异常
  return indicators.filter(Boolean).length >= 3;
}

/**
 * 爬虫行为检测
 * 识别可能的恶意爬虫活动
 */
private async detectCrawlerBehavior(
  env: Env,
  clientIP: string
): Promise<boolean> {
  
  const doId = env.PATH_COLLECTOR.idFromName(clientIP);
  const collector = env.PATH_COLLECTOR.get(doId);
  
  const response = await collector.fetch(new Request('http://dummy/analyze-crawler-pattern'));
  const analysis = await response.json();
  
  // 爬虫行为特征
  const crawlerIndicators = [
    analysis.sequentialPathAccess,     // 按顺序访问路径
    analysis.robotsTxtAccess,          // 访问了 robots.txt
    analysis.noJavaScriptSupport,      // 不支持 JavaScript
    analysis.rapidPageTraversal,       // 快速页面遍历
    analysis.unusualUserAgent         // 异常的 User-Agent
  ];
  
  return crawlerIndicators.filter(Boolean).length >= 3;
}

/**
 * IP 伪造检测
 * 检测 IP 地址伪造尝试
 */
private async detectIPSpoofing(context: RequestContext): Promise<boolean> {
  const cfConnectingIP = context.headers['cf-connecting-ip'];
  const xRealIP = context.headers['x-real-ip'];
  const xForwardedFor = context.headers['x-forwarded-for'];
  
  // Cloudflare 的 CF-Connecting-IP 是最可信的
  // 检查是否有多个不一致的 IP 头
  const ipHeaders = [cfConnectingIP, xRealIP, xForwardedFor].filter(Boolean);
  
  if (ipHeaders.length > 1) {
    // 检查 IP 地址的一致性
    const uniqueIPs = new Set(ipHeaders.map(ip => ip.split(',')[0].trim()));
    
    // 如果有多个不同的 IP，可能存在伪造
    if (uniqueIPs.size > 1) {
      return true; // 可能的 IP 伪造
    }
  }
  
  return false;
}

/**
 * 威胁评分计算
 * 基于多个指标计算综合威胁分数
 */
private calculateThreatScore(indicators: SecurityIndicators): number {
  let score = 0;
  
  // 权重配置
  const weights = {
    highFrequencyPattern: 30,
    crawlerBehavior: 25,
    ipSpoofing: 35,
    suspiciousUserAgent: 10
  };
  
  // 计算加权分数
  Object.entries(indicators).forEach(([indicator, detected]) => {
    if (detected && weights[indicator]) {
      score += weights[indicator];
    }
  });
  
  return Math.min(score, 100); // 最高100分
}
```

### IP 黑名单管理

```typescript
/**
 * IP 黑名单管理
 * 动态管理恶意 IP 地址列表
 */
async addToBlacklist(
  env: Env,
  ip: string,
  reason: BlacklistReason
): Promise<void> {
  const blacklistKey = `blacklist:${ip}`;
  const expirationTime = this.getBlacklistDuration(reason);
  
  await env.API_GATEWAY_STORAGE.put(blacklistKey, JSON.stringify({
    ip,
    reason,
    createdAt: Date.now(),
    expiresAt: Date.now() + expirationTime
  }), {
    expirationTtl: Math.floor(expirationTime / 1000)
  });
  
  // 记录安全事件
  await this.logSecurityEvent(env, 'BLACKLIST_ADDED', { ip, reason });
}

/**
 * 检查 IP 是否在黑名单中
 */
async isIPBlacklisted(env: Env, ip: string): Promise<boolean> {
  const blacklistKey = `blacklist:${ip}`;
  const entry = await env.API_GATEWAY_STORAGE.get(blacklistKey, 'json');
  
  if (!entry) return false;
  
  // 检查是否过期
  if (Date.now() > entry.expiresAt) {
    await env.API_GATEWAY_STORAGE.delete(blacklistKey);
    return false;
  }
  
  return true;
}

/**
 * 获取黑名单持续时间
 */
private getBlacklistDuration(reason: BlacklistReason): number {
  const durations = {
    'HIGH_THREAT_SCORE': 24 * 60 * 60 * 1000,     // 24小时
    'REPEATED_VIOLATIONS': 7 * 24 * 60 * 60 * 1000, // 7天
    'SEVERE_ATTACK': 30 * 24 * 60 * 60 * 1000      // 30天
  };
  
  return durations[reason.reason] || 60 * 60 * 1000; // 默认1小时
}
```

## 自适应限流

### 智能流量控制

基于历史行为和当前系统状态动态调整限流策略。

```typescript
// src/lib/adaptive-rate-limiter.ts
export class AdaptiveRateLimiter {
  
  /**
   * 基于流量模式的自适应限流
   * 根据用户行为历史动态调整限流参数
   */
  async getAdaptiveRateLimit(
    env: Env,
    clientIP: string
  ): Promise<RateLimitConfig> {
    
    // 获取历史流量模式
    const trafficPattern = await this.analyzeTrafficPattern(env, clientIP);
    
    // 基础限流配置
    let baseLimit = 100; // 每分钟100请求
    let windowSize = 60; // 60秒窗口
    
    // 根据流量模式调整
    if (trafficPattern.isTrustedClient) {
      baseLimit *= 5; // 信任客户端提高5倍限制
    }
    
    if (trafficPattern.hasRecentViolations) {
      baseLimit *= 0.5; // 有违规记录降低50%限制
    }
    
    // 根据当前系统负载调整
    const systemLoad = await this.getSystemLoad(env);
    if (systemLoad > 80) {
      baseLimit *= 0.7; // 高负载下降低30%限制
    }
    
    return {
      limit: Math.floor(baseLimit),
      window: windowSize,
      strategy: 'adaptive'
    };
  }

  /**
   * 流量模式分析
   * 分析用户的历史访问模式
   */
  private async analyzeTrafficPattern(
    env: Env,
    clientIP: string
  ): Promise<TrafficPattern> {
    
    // 从 DO 获取历史数据
    const doId = env.PATH_COLLECTOR.idFromName(clientIP);
    const collector = env.PATH_COLLECTOR.get(doId);
    
    const response = await collector.fetch(new Request('http://dummy/analyze-pattern'));
    const analysis = await response.json();
    
    return {
      isTrustedClient: analysis.requestPattern === 'regular' && analysis.errorRate < 0.01,
      hasRecentViolations: analysis.recentViolations > 0,
      averageRequestRate: analysis.averageRequestRate,
      peakRequestRate: analysis.peakRequestRate,
      requestConsistency: analysis.requestConsistency
    };
  }

  /**
   * 系统负载监控
   * 获取当前系统负载指标
   */
  private async getSystemLoad(env: Env): Promise<number> {
    // 从监控系统获取负载数据
    const metrics = await this.getSystemMetrics(env);
    
    // 计算综合负载分数
    const loadFactors = [
      metrics.cpuUsage * 0.3,
      metrics.memoryUsage * 0.3,
      metrics.activeConnections / metrics.maxConnections * 0.4
    ];
    
    return loadFactors.reduce((sum, factor) => sum + factor, 0) * 100;
  }
}
```

## 数据隐私保护

### IP 地址处理

在保持统计价值的同时保护用户隐私。

```typescript
// src/lib/privacy-protection.ts
export class PrivacyProtection {
  
  /**
   * IP 地址哈希化
   * 在保留统计价值的同时保护用户隐私
   */
  hashIPAddress(ip: string, salt: string): string {
    // 对于 IPv4，保留前3个字节用于地理位置
    // 对于 IPv6，保留前64位
    
    if (this.isIPv4(ip)) {
      const parts = ip.split('.');
      const geoPrefix = parts.slice(0, 3).join('.');
      const hashedSuffix = this.simpleHash(ip + salt).substring(0, 8);
      return `${geoPrefix}.${hashedSuffix}`;
    } else {
      // IPv6 处理
      const prefix = ip.split(':').slice(0, 4).join(':');
      const hashedSuffix = this.simpleHash(ip + salt).substring(0, 16);
      return `${prefix}:${hashedSuffix}`;
    }
  }

  /**
   * 敏感数据脱敏
   * 清理 User-Agent 中的个人信息
   */
  sanitizeUserAgent(userAgent: string): string {
    // 移除可能的个人标识信息
    return userAgent
      .replace(/\([^)]*\)/g, '(*)') // 移除括号内的详细信息
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X') // 移除版本号
      .trim();
  }

  /**
   * 数据保留策略
   * 自动清理过期的个人数据
   */
  async applyDataRetentionPolicy(env: Env): Promise<void> {
    const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90天
    const cutoff = Date.now() - retentionPeriod;
    
    // 清理过期的个人数据
    const activeIPs = await this.getActiveIPs(env);
    
    for (const ip of activeIPs) {
      const doId = env.PATH_COLLECTOR.idFromName(ip);
      const collector = env.PATH_COLLECTOR.get(doId);
      
      await collector.fetch(new Request(`http://dummy/cleanup-old-data?cutoff=${cutoff}`));
    }
  }

  /**
   * 简单哈希函数
   * 用于 IP 地址哈希化
   */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * IPv4 地址检测
   */
  private isIPv4(ip: string): boolean {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
  }

  /**
   * 获取活跃 IP 列表
   */
  private async getActiveIPs(env: Env): Promise<string[]> {
    // 从 GlobalStatsAggregator 获取活跃 IP 列表
    const aggregatorId = env.GLOBAL_STATS_AGGREGATOR.idFromName('global');
    const aggregator = env.GLOBAL_STATS_AGGREGATOR.get(aggregatorId);
    
    const response = await aggregator.fetch(new Request('http://dummy/get-active-ips'));
    const data = await response.json();
    
    return data.activeIPs || [];
  }
}
```

## 输入验证与安全

### 请求验证

```typescript
/**
 * 输入验证管理器
 * 确保所有输入数据的安全性
 */
export class InputValidator {
  
  /**
   * 路径验证
   * 验证请求路径的合法性
   */
  validatePath(path: string): ValidationResult {
    // 基本安全检查
    const securityChecks = [
      {
        name: 'path_traversal',
        test: (p: string) => !p.includes('../') && !p.includes('..\\'),
        message: '路径遍历攻击检测'
      },
      {
        name: 'null_byte',
        test: (p: string) => !p.includes('\0'),
        message: '空字节注入检测'
      },
      {
        name: 'max_length',
        test: (p: string) => p.length <= 2048,
        message: '路径长度过长'
      },
      {
        name: 'valid_chars',
        test: (p: string) => /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(p),
        message: '包含非法字符'
      }
    ];
    
    for (const check of securityChecks) {
      if (!check.test(path)) {
        return {
          valid: false,
          error: check.message,
          code: check.name.toUpperCase()
        };
      }
    }
    
    return { valid: true };
  }

  /**
   * IP 地址验证
   * 验证客户端 IP 地址格式
   */
  validateIPAddress(ip: string): ValidationResult {
    // IPv4 格式检查
    const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 格式检查
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    
    if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
      return { valid: true };
    }
    
    return {
      valid: false,
      error: '无效的 IP 地址格式',
      code: 'INVALID_IP_FORMAT'
    };
  }
}
```

## 安全监控与告警

### 安全事件记录

```typescript
/**
 * 安全事件记录器
 * 记录和分析安全相关事件
 */
export class SecurityEventLogger {
  
  /**
   * 记录安全事件
   */
  async logSecurityEvent(
    env: Env,
    eventType: string,
    details: SecurityEventDetails
  ): Promise<void> {
    
    const event = {
      timestamp: Date.now(),
      type: eventType,
      severity: this.getSeverityLevel(eventType),
      details,
      source: 'api-gateway'
    };
    
    // 记录到 Analytics Engine
    if (env.ANALYTICS_ENGINE) {
      await env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [
          event.type,
          event.severity,
          JSON.stringify(event.details)
        ],
        doubles: [event.timestamp],
        indexes: [event.source]
      });
    }
    
    // 高严重性事件立即告警
    if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
      await this.sendSecurityAlert(env, event);
    }
  }

  /**
   * 发送安全告警
   */
  private async sendSecurityAlert(
    env: Env,
    event: SecurityEvent
  ): Promise<void> {
    
    const alertMessage = {
      title: `安全告警: ${event.type}`,
      severity: event.severity,
      timestamp: new Date(event.timestamp).toISOString(),
      details: event.details,
      action_required: this.getRecommendedAction(event.type)
    };
    
    // 发送到告警系统（webhook、邮件等）
    if (env.SECURITY_WEBHOOK_URL) {
      await fetch(env.SECURITY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertMessage)
      });
    }
  }

  /**
   * 获取严重性级别
   */
  private getSeverityLevel(eventType: string): string {
    const severityMap = {
      'BLACKLIST_ADDED': 'HIGH',
      'DDoS_ATTACK_DETECTED': 'CRITICAL',
      'IP_SPOOFING_DETECTED': 'HIGH',
      'RATE_LIMIT_EXCEEDED': 'MEDIUM',
      'ABNORMAL_BEHAVIOR': 'MEDIUM',
      'SECURITY_RULE_TRIGGERED': 'LOW'
    };
    
    return severityMap[eventType] || 'LOW';
  }

  /**
   * 获取推荐行动
   */
  private getRecommendedAction(eventType: string): string {
    const actionMap = {
      'BLACKLIST_ADDED': '监控 IP 后续活动，考虑延长封禁时间',
      'DDoS_ATTACK_DETECTED': '立即启用紧急限流，通知运维团队',
      'IP_SPOOFING_DETECTED': '加强 IP 验证，检查网络配置',
      'RATE_LIMIT_EXCEEDED': '观察访问模式，考虑调整限流参数'
    };
    
    return actionMap[eventType] || '继续监控';
  }
}
```

## 最佳实践建议

### 安全配置建议

1. **多层防护**
   - 在 Cloudflare 层面启用 DDoS 防护
   - 应用层实施细粒度访问控制
   - 数据库层实施查询限制

2. **监控告警**
   - 设置实时安全监控
   - 配置自动响应机制
   - 建立安全事件处理流程

3. **数据保护**
   - 最小化个人数据收集
   - 实施数据保留策略
   - 定期安全审计

4. **访问控制**
   - 实施基于角色的访问控制
   - 定期审查访问权限
   - 强制实施最小权限原则

### 安全检查清单

- [ ] DDoS 防护机制已启用
- [ ] 异常行为检测正常运行
- [ ] IP 黑名单功能正常
- [ ] 输入验证覆盖所有接口
- [ ] 安全日志记录完整
- [ ] 告警系统配置正确
- [ ] 数据保留策略已实施
- [ ] 安全监控仪表板可用

### 应急响应流程

1. **检测阶段**
   - 自动安全监控系统检测异常
   - 生成安全告警

2. **分析阶段**
   - 分析攻击类型和严重程度
   - 评估潜在影响范围

3. **响应阶段**
   - 自动触发防护措施
   - 通知安全团队
   - 记录处理过程

4. **恢复阶段**
   - 验证威胁已消除
   - 恢复正常服务
   - 生成事件报告

---

## 相关文档

- [01-核心设计](./01-core-design.md) - 了解 DO 架构安全优势
- [05-监控运维](./05-monitoring-operations.md) - 安全监控集成
- [02-API聚合查询](./02-api-aggregation.md) - API 安全设计

通过实施这些安全防护机制，API 网关能够有效抵御各种安全威胁，确保系统的安全稳定运行。