import type { ProxyRoute, UnifiedPathConfig } from '../types/config';

/**
 * 路径匹配工具类
 * 负责处理精确路径与代理路由的匹配关系
 */
export class PathMatcher {
  /**
   * 找到最匹配的代理路由
   * 基于最长前缀匹配原则，优先匹配最具体的代理路由
   * @param path 精确路径
   * @param proxyRoutes 代理路由列表
   * @returns 匹配的代理路由，如果没有匹配则返回 null
   */
  static findMatchingProxy(path: string, proxyRoutes: ProxyRoute[]): ProxyRoute | null {
    // 过滤出启用的代理路由并按优先级排序
    const enabledProxies = proxyRoutes
      .filter(proxy => proxy.enabled && proxy.pattern) // 确保 pattern 存在
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    let bestMatch: ProxyRoute | null = null;
    let longestMatch = -1;

    for (const proxy of enabledProxies) {
      try {
        // 确保 pattern 字段存在
        if (!proxy.pattern) {
          console.warn('Proxy route missing pattern field:', proxy.id);
          continue;
        }
        
        // 将通配符模式转换为正则表达式
        // 支持 /api/* 和 /api/** 格式
        const pattern = proxy.pattern
          .replace(/\*\*/g, '.*')  // /** 匹配任意深度
          .replace(/\*/g, '[^/]*'); // /* 匹配单级路径
        
        // 创建正则表达式进行匹配
        const regex = new RegExp(`^${pattern}(/|$)`);
        
        if (regex.test(path)) {
          // 计算匹配长度（不包含通配符的部分）
          const staticPart = proxy.pattern?.replace(/\/\*.*$/, '') || '';
          const matchLength = staticPart.length;
          
          // 选择匹配长度最长的代理（最具体的匹配）
          if (matchLength > longestMatch) {
            bestMatch = proxy;
            longestMatch = matchLength;
          }
        }
      } catch (error) {
        console.warn('Error matching proxy pattern:', proxy.id, error);
        continue;
      }
    }
    
    return bestMatch;
  }

  /**
   * 获取指定代理下的所有路径
   * @param proxyId 代理路由 ID
   * @param paths 路径列表
   * @returns 属于该代理的路径列表
   */
  static getPathsByProxy(proxyId: string, paths: UnifiedPathConfig[]): UnifiedPathConfig[] {
    return paths.filter(path => path.proxyId === proxyId);
  }

  /**
   * 自动归类路径到代理
   * 为未分配代理的路径自动匹配合适的代理路由
   * @param paths 路径列表
   * @param proxyRoutes 代理路由列表
   * @returns 更新后的路径列表
   */
  static autoAssignProxyToPaths(
    paths: UnifiedPathConfig[], 
    proxyRoutes: ProxyRoute[]
  ): UnifiedPathConfig[] {
    return paths.map(path => {
      // 跳过已经分配了代理的路径
      if (path.proxyId) {
        return path;
      }

      // 查找匹配的代理路由
      const matchingProxy = this.findMatchingProxy(path.path, proxyRoutes);
      
      if (matchingProxy) {
        // 自动分配到匹配的代理
        return {
          ...path,
          proxyId: matchingProxy.id,
          proxyPattern: matchingProxy.pattern,
          metadata: {
            ...path.metadata,
            autoAssigned: true,
            updatedAt: new Date()
          }
        } as UnifiedPathConfig;
      }
      
      // 没有匹配的代理，保持原状
      return path;
    });
  }

  /**
   * 验证路径是否匹配代理模式
   * @param path 精确路径
   * @param pattern 代理模式
   * @returns 是否匹配
   */
  static isPathMatchingPattern(path: string, pattern: string): boolean {
    try {
      // 确保 pattern 存在
      if (!pattern) {
        return false;
      }
      
      // 将通配符模式转换为正则表达式
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      
      const regex = new RegExp(`^${regexPattern}(/|$)`);
      return regex.test(path);
    } catch (error) {
      console.warn('Error matching pattern:', pattern, error);
      return false;
    }
  }

  /**
   * 获取代理路由的统计信息
   * @param proxyId 代理路由 ID
   * @param paths 路径列表
   * @returns 统计信息
   */
  static getProxyStats(proxyId: string, paths: UnifiedPathConfig[]): { 
    pathCount: number; 
    lastUpdated: Date;
  } {
    const proxyPaths = this.getPathsByProxy(proxyId, paths);
    
    // 找到最后更新时间
    const lastUpdated = proxyPaths.reduce((latest, path) => {
      const pathUpdated = path.metadata?.updatedAt || new Date(0);
      return pathUpdated > latest ? pathUpdated : latest;
    }, new Date(0));

    return {
      pathCount: proxyPaths.length,
      lastUpdated: lastUpdated > new Date(0) ? lastUpdated : new Date()
    };
  }

  /**
   * 检测路径分配冲突
   * 检查是否有路径被分配到了不匹配的代理
   * @param paths 路径列表
   * @param proxyRoutes 代理路由列表
   * @returns 冲突的路径列表
   */
  static detectAssignmentConflicts(
    paths: UnifiedPathConfig[],
    proxyRoutes: ProxyRoute[]
  ): Array<{ path: UnifiedPathConfig; expectedProxy: ProxyRoute | null }> {
    const conflicts: Array<{ path: UnifiedPathConfig; expectedProxy: ProxyRoute | null }> = [];
    
    for (const path of paths) {
      if (!path.proxyId) continue;
      
      // 找到期望的代理
      const expectedProxy = this.findMatchingProxy(path.path, proxyRoutes);
      
      // 检查当前分配的代理是否正确
      if (!expectedProxy || expectedProxy.id !== path.proxyId) {
        conflicts.push({
          path,
          expectedProxy
        });
      }
    }
    
    return conflicts;
  }
}

// 导出单例实例
export const pathMatcher = new PathMatcher();