/**
 * 结构化日志记录工具
 * 为 Cloudflare Workers 优化的 JSON 格式日志
 */

export interface LogContext {
  requestId?: string;
  userAgent?: string;
  clientIP?: string;
  path?: string;
  method?: string;
  status?: number;
  duration?: number;
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
  route?: string;
  [key: string]: any;
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * 结构化日志记录器类
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatLogEntry(level, message, context, error);
    const logString = JSON.stringify(logEntry);

    // 根据日志级别选择不同的 console 方法
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logString);
        break;
      case LogLevel.INFO:
        console.log(logString);
        break;
      case LogLevel.WARN:
        console.warn(logString);
        break;
      case LogLevel.ERROR:
        console.error(logString);
        break;
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // 专用方法用于特定的日志事件
  public logRequest(
    method: string,
    path: string,
    status: number,
    duration: number,
    context: LogContext = {}
  ): void {
    this.info('HTTP Request', {
      ...context,
      method,
      path,
      status,
      duration,
      event: 'http_request'
    });
  }

  public logProxyStart(
    method: string,
    path: string,
    targetUrl: string,
    context: LogContext = {}
  ): void {
    this.info('Proxy request started', {
      ...context,
      method,
      path,
      targetUrl,
      event: 'proxy_start'
    });
  }

  public logProxyComplete(
    method: string,
    path: string,
    status: number,
    duration: number,
    context: LogContext = {}
  ): void {
    this.info('Proxy request completed', {
      ...context,
      method,
      path,
      status,
      duration,
      event: 'proxy_complete'
    });
  }

  public logCacheHit(
    path: string,
    version: number,
    context: LogContext = {}
  ): void {
    this.info('Cache hit', {
      ...context,
      path,
      version,
      cacheStatus: 'HIT' as const,
      event: 'cache_hit'
    });
  }

  public logCacheMiss(
    path: string,
    version: number,
    context: LogContext = {}
  ): void {
    this.info('Cache miss', {
      ...context,
      path,
      version,
      cacheStatus: 'MISS' as const,
      event: 'cache_miss'
    });
  }

  public logRateLimitHit(
    clientIP: string,
    path: string,
    limit: number,
    context: LogContext = {}
  ): void {
    this.warn('Rate limit exceeded', {
      ...context,
      clientIP,
      path,
      limit,
      event: 'rate_limit_exceeded'
    });
  }

  public logGeoBlock(
    clientIP: string,
    country: string,
    path: string,
    context: LogContext = {}
  ): void {
    this.warn('Geographic access blocked', {
      ...context,
      clientIP,
      country,
      path,
      event: 'geo_blocked'
    });
  }

  public logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    context: LogContext = {}
  ): void {
    const logLevel = severity === 'critical' || severity === 'high' ? LogLevel.ERROR : LogLevel.WARN;
    
    this.log(logLevel, `Security event: ${eventType}`, {
      ...context,
      eventType,
      severity,
      details,
      event: 'security_event'
    });
  }

  public logPerformanceMetric(
    metric: string,
    value: number,
    unit: string,
    context: LogContext = {}
  ): void {
    this.info('Performance metric', {
      ...context,
      metric,
      value,
      unit,
      event: 'performance_metric'
    });
  }

  public logBusinessEvent(
    eventName: string,
    properties: Record<string, any>,
    context: LogContext = {}
  ): void {
    this.info(`Business event: ${eventName}`, {
      ...context,
      eventName,
      properties,
      event: 'business_event'
    });
  }
}

// 导出全局日志记录器实例
export const logger = Logger.getInstance();

// 便捷函数，用于快速访问
export const logRequest = logger.logRequest.bind(logger);
export const logProxyStart = logger.logProxyStart.bind(logger);
export const logProxyComplete = logger.logProxyComplete.bind(logger);
export const logCacheHit = logger.logCacheHit.bind(logger);
export const logCacheMiss = logger.logCacheMiss.bind(logger);
export const logRateLimitHit = logger.logRateLimitHit.bind(logger);
export const logGeoBlock = logger.logGeoBlock.bind(logger);
export const logSecurityEvent = logger.logSecurityEvent.bind(logger);
export const logPerformanceMetric = logger.logPerformanceMetric.bind(logger);
export const logBusinessEvent = logger.logBusinessEvent.bind(logger);

// 用于从 Hono Context 提取通用日志上下文的辅助函数
export function extractLogContext(c: any): LogContext {
  return {
    requestId: c.req.header('x-request-id') || crypto.randomUUID(),
    userAgent: c.req.header('user-agent')?.substring(0, 200),
    clientIP: c.req.header('cf-connecting-ip') || 
              c.req.header('x-real-ip') || 
              c.req.header('x-forwarded-for')?.split(',')[0].trim(),
    path: new URL(c.req.url).pathname,
    method: c.req.method,
    country: c.req.cf?.country,
  };
}

/**
 * 创建带有请求上下文的日志记录器实例
 */
export function createRequestLogger(c: any): Logger & { context: LogContext } {
  const context = extractLogContext(c);
  const loggerInstance = Logger.getInstance();
  
  return {
    ...loggerInstance,
    context,
    debug: (message: string, additionalContext?: LogContext) => 
      loggerInstance.debug(message, { ...context, ...additionalContext }),
    info: (message: string, additionalContext?: LogContext) => 
      loggerInstance.info(message, { ...context, ...additionalContext }),
    warn: (message: string, additionalContext?: LogContext, error?: Error) => 
      loggerInstance.warn(message, { ...context, ...additionalContext }, error),
    error: (message: string, additionalContext?: LogContext, error?: Error) => 
      loggerInstance.error(message, { ...context, ...additionalContext }, error),
  } as Logger & { context: LogContext };
}