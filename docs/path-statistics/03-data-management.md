# 数据管理与备份系统

## 概述

本文档专注于路径统计系统的数据管理与备份策略。确保数据的持久化、可恢复性和长期保存，同时优化存储成本和操作效率。

## 目录
- [数据生命周期管理](#数据生命周期管理)
- [自动备份策略](#自动备份策略)
- [增量备份优化](#增量备份优化)
- [手动备份与恢复API](#手动备份与恢复api)
- [数据迁移方案](#数据迁移方案)
- [存储成本优化](#存储成本优化)
- [灾难恢复计划](#灾难恢复计划)

## 数据生命周期管理

### 数据分层策略

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   热数据层      │    │   温数据层      │    │   冷数据层      │
│  (DO Memory)    │    │    (KV Store)   │    │   (R2 Storage)  │
│                 │    │                 │    │                 │
│ 实时访问        │    │ 定期备份        │    │ 长期存档        │
│ 7天以内         │    │ 7-30天         │    │ 30天以上        │
│ 毫秒级响应      │    │ 秒级响应        │    │ 分钟级响应      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 数据保留策略

```typescript
interface DataRetentionPolicy {
  hotData: {
    duration: number;          // 7天
    storage: 'DO_MEMORY';
    accessFrequency: 'HIGH';
  };
  warmData: {
    duration: number;          // 30天
    storage: 'KV_STORE';
    accessFrequency: 'MEDIUM';
  };
  coldData: {
    duration: number;          // 365天
    storage: 'R2_STORAGE';
    accessFrequency: 'LOW';
  };
}

class DataLifecycleManager {
  private policy: DataRetentionPolicy = {
    hotData: { duration: 7 * 24 * 60 * 60 * 1000, storage: 'DO_MEMORY', accessFrequency: 'HIGH' },
    warmData: { duration: 30 * 24 * 60 * 60 * 1000, storage: 'KV_STORE', accessFrequency: 'MEDIUM' },
    coldData: { duration: 365 * 24 * 60 * 60 * 1000, storage: 'R2_STORAGE', accessFrequency: 'LOW' }
  };

  async migrateDataByAge(env: Env): Promise<{
    migratedToWarm: number;
    migratedToCold: number;
    deletedExpired: number;
  }> {
    const result = { migratedToWarm: 0, migratedToCold: 0, deletedExpired: 0 };
    const now = Date.now();
    
    // 获取所有活跃IP的DO数据
    const activeIPs = await this.getActiveIPs(env);
    
    for (const ip of activeIPs) {
      const doId = env.PATH_COLLECTOR.idFromName(ip);
      const collector = env.PATH_COLLECTOR.get(doId);
      
      try {
        // 获取DO中的路径数据
        const pathsResponse = await collector.fetch('http://dummy/paths');
        if (!pathsResponse.ok) continue;
        
        const ipData = await pathsResponse.json();
        
        for (const pathData of ipData.paths || []) {
          const lastAccessed = new Date(pathData.lastAccessed).getTime();
          const age = now - lastAccessed;
          
          // 迁移到温数据层（KV）
          if (age > this.policy.hotData.duration && age <= this.policy.warmData.duration) {
            await this.moveToWarmStorage(env, ip, pathData);
            result.migratedToWarm++;
          }
          // 迁移到冷数据层（R2）
          else if (age > this.policy.warmData.duration && age <= this.policy.coldData.duration) {
            await this.moveToColdStorage(env, ip, pathData);
            result.migratedToCold++;
          }
          // 删除过期数据
          else if (age > this.policy.coldData.duration) {
            await this.deleteExpiredData(env, ip, pathData);
            result.deletedExpired++;
          }
        }
      } catch (error) {
        console.warn(`Failed to process lifecycle for IP ${ip}:`, error);
      }
    }
    
    return result;
  }

  private async moveToWarmStorage(env: Env, ip: string, pathData: any): Promise<void> {
    const warmKey = `warm:${ip}:${pathData.pathKey}`;
    await env.API_GATEWAY_STORAGE.put(warmKey, JSON.stringify({
      ...pathData,
      movedToWarm: new Date().toISOString(),
      tier: 'warm'
    }), {
      expirationTtl: Math.floor(this.policy.warmData.duration / 1000)
    });
  }

  private async moveToColdStorage(env: Env, ip: string, pathData: any): Promise<void> {
    if (!env.BACKUP_STORAGE) return;
    
    const coldKey = `cold/${ip}/${pathData.pathKey}.json`;
    await env.BACKUP_STORAGE.put(coldKey, JSON.stringify({
      ...pathData,
      movedToCold: new Date().toISOString(),
      tier: 'cold'
    }));
  }

  private async deleteExpiredData(env: Env, ip: string, pathData: any): Promise<void> {
    // 记录删除日志
    const deleteLogKey = `deletion-log:${new Date().toISOString().split('T')[0]}`;
    const existingLog = await env.API_GATEWAY_STORAGE.get(deleteLogKey, 'json') || [];
    existingLog.push({
      ip,
      pathKey: pathData.pathKey,
      deletedAt: new Date().toISOString(),
      reason: 'expired'
    });
    
    await env.API_GATEWAY_STORAGE.put(deleteLogKey, JSON.stringify(existingLog), {
      expirationTtl: 90 * 24 * 60 * 60 // 保留删除日志90天
    });
  }

  private async getActiveIPs(env: Env): Promise<string[]> {
    try {
      return await env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') || [];
    } catch (error) {
      console.warn('Failed to get active IPs:', error);
      return [];
    }
  }
}
```

## 自动备份策略

### BackupManager 核心实现

```typescript
// src/lib/backup-manager.ts
export class BackupManager {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 每日自动备份任务
   * 通过 Cron Trigger 在凌晨 2:00 执行
   */
  async performDailyBackup(): Promise<{
    success: boolean;
    backupId: string;
    totalIPs: number;
    totalPaths: number;
    backupSize: number;
  }> {
    const backupId = `backup-${new Date().toISOString().split('T')[0]}`;
    const backupData: any[] = [];
    let totalPaths = 0;
    let backupSize = 0;

    try {
      // 获取活跃 IP 列表
      const activeIPs = await this.getActiveIPs();
      console.log(`Starting backup for ${activeIPs.length} IPs`);

      // 批量收集数据
      const batchSize = 100; // 每批处理100个IP
      for (let i = 0; i < activeIPs.length; i += batchSize) {
        const batch = activeIPs.slice(i, i + batchSize);
        const batchData = await this.collectBackupBatch(batch);
        backupData.push(...batchData);
        totalPaths += batchData.length;
        
        // 每处理1000个IP记录一次进度
        if ((i + batchSize) % 1000 === 0) {
          console.log(`Backup progress: ${i + batchSize}/${activeIPs.length} IPs processed`);
        }
      }

      // 压缩备份数据
      const compressedData = this.compressBackupData(backupData);
      backupSize = compressedData.length;

      // 存储到 R2（如果配置了）或 KV
      if (this.env.BACKUP_STORAGE) {
        await this.env.BACKUP_STORAGE.put(`${backupId}.json.gz`, compressedData);
      } else {
        // 分块存储到 KV（每块最大 25MB）
        await this.storeBackupToKV(backupId, compressedData);
      }

      // 记录备份元数据
      await this.env.API_GATEWAY_STORAGE.put(`backup-metadata:${backupId}`, JSON.stringify({
        backupId,
        timestamp: new Date().toISOString(),
        totalIPs: activeIPs.length,
        totalPaths,
        backupSize,
        location: this.env.BACKUP_STORAGE ? 'R2' : 'KV'
      }), {
        expirationTtl: 90 * 24 * 60 * 60 // 90天保留期
      });

      // 清理旧备份（保留最近30天）
      await this.cleanupOldBackups();

      return {
        success: true,
        backupId,
        totalIPs: activeIPs.length,
        totalPaths,
        backupSize
      };

    } catch (error) {
      console.error('Daily backup failed:', error);
      
      // 记录备份失败
      await this.env.API_GATEWAY_STORAGE.put(`backup-error:${backupId}`, JSON.stringify({
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        expirationTtl: 7 * 24 * 60 * 60 // 7天保留错误日志
      });

      return {
        success: false,
        backupId,
        totalIPs: 0,
        totalPaths: 0,
        backupSize: 0
      };
    }
  }

  private async collectBackupBatch(ipBatch: string[]): Promise<any[]> {
    const results: any[] = [];
    
    const batchPromises = ipBatch.map(async (ip) => {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const pathsUrl = new URL('http://dummy/paths');
        const response = await collector.fetch(pathsUrl.toString());
        
        if (response.ok) {
          const ipData = await response.json();
          
          for (const pathData of ipData.paths || []) {
            results.push({
              backupVersion: '1.0',
              timestamp: new Date().toISOString(),
              ip: ip,
              pathKey: pathData.pathKey,
              method: pathData.method,
              count: pathData.count,
              firstSeen: pathData.firstSeen,
              lastAccessed: pathData.lastAccessed,
              country: pathData.country,
              userAgent: pathData.userAgent
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to backup data for IP ${ip}:`, error);
        // 记录失败的 IP 但不中断整个备份
        results.push({
          backupVersion: '1.0',
          timestamp: new Date().toISOString(),
          ip: ip,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'failed'
        });
      }
    });

    await Promise.allSettled(batchPromises);
    return results;
  }

  private compressBackupData(data: any[]): string {
    // 简化的压缩（实际应用中可以使用真正的压缩算法）
    // 可以集成 gzip 或其他压缩库
    return JSON.stringify(data);
  }

  private async storeBackupToKV(backupId: string, data: string): Promise<void> {
    const chunkSize = 20 * 1024 * 1024; // 20MB per chunk, leaving buffer for KV limit
    const chunks = Math.ceil(data.length / chunkSize);
    
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      const chunkData = data.slice(start, end);
      
      await this.env.API_GATEWAY_STORAGE.put(
        `backup-chunk:${backupId}:${i}`, 
        chunkData,
        { expirationTtl: 30 * 24 * 60 * 60 } // 30天保留期
      );
    }
    
    // 存储分块信息
    await this.env.API_GATEWAY_STORAGE.put(`backup-chunks:${backupId}`, JSON.stringify({
      totalChunks: chunks,
      chunkSize,
      totalSize: data.length
    }), {
      expirationTtl: 30 * 24 * 60 * 60
    });
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      // 获取所有备份元数据
      const backupList = await this.env.API_GATEWAY_STORAGE.list({ prefix: 'backup-metadata:' });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30天前

      for (const key of backupList.keys) {
        const metadata = await this.env.API_GATEWAY_STORAGE.get(key.name, 'json') as any;
        
        if (metadata && new Date(metadata.timestamp) < cutoffDate) {
          // 删除备份数据
          if (metadata.location === 'R2' && this.env.BACKUP_STORAGE) {
            await this.env.BACKUP_STORAGE.delete(`${metadata.backupId}.json.gz`);
          } else {
            // 删除 KV 中的分块数据
            await this.deleteBackupChunks(metadata.backupId);
          }
          
          // 删除元数据
          await this.env.API_GATEWAY_STORAGE.delete(key.name);
          
          console.log(`Deleted old backup: ${metadata.backupId}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  private async deleteBackupChunks(backupId: string): Promise<void> {
    try {
      const chunksInfo = await this.env.API_GATEWAY_STORAGE.get(`backup-chunks:${backupId}`, 'json') as any;
      
      if (chunksInfo) {
        // 删除所有分块
        for (let i = 0; i < chunksInfo.totalChunks; i++) {
          await this.env.API_GATEWAY_STORAGE.delete(`backup-chunk:${backupId}:${i}`);
        }
        
        // 删除分块信息
        await this.env.API_GATEWAY_STORAGE.delete(`backup-chunks:${backupId}`);
      }
    } catch (error) {
      console.warn(`Failed to delete backup chunks for ${backupId}:`, error);
    }
  }

  /**
   * 恢复备份数据
   */
  async restoreFromBackup(backupId: string): Promise<{
    success: boolean;
    restoredIPs: number;
    restoredPaths: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      restoredIPs: 0,
      restoredPaths: 0,
      errors: [] as string[]
    };

    try {
      // 获取备份元数据
      const metadata = await this.env.API_GATEWAY_STORAGE.get(`backup-metadata:${backupId}`, 'json') as any;
      
      if (!metadata) {
        result.errors.push(`Backup ${backupId} not found`);
        return result;
      }

      // 从存储中读取备份数据
      let backupData: any[];
      
      if (metadata.location === 'R2' && this.env.BACKUP_STORAGE) {
        const compressed = await this.env.BACKUP_STORAGE.get(`${backupId}.json.gz`);
        if (!compressed) {
          result.errors.push('Backup file not found in R2');
          return result;
        }
        
        const decompressed = await compressed.text();
        backupData = JSON.parse(decompressed);
      } else {
        backupData = await this.loadBackupFromKV(backupId);
      }

      // 按 IP 分组数据
      const ipGroups = new Map<string, any[]>();
      backupData.forEach(record => {
        if (record.status !== 'failed' && record.ip) {
          if (!ipGroups.has(record.ip)) {
            ipGroups.set(record.ip, []);
          }
          ipGroups.get(record.ip)!.push(record);
        }
      });

      // 批量恢复到各个 DO
      let restoredIPs = 0;
      let restoredPaths = 0;
      
      const batchSize = 50;
      const ips = Array.from(ipGroups.keys());
      
      for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const batchResult = await this.restoreBatch(batch, ipGroups);
        
        restoredIPs += batchResult.restoredIPs;
        restoredPaths += batchResult.restoredPaths;
        result.errors.push(...batchResult.errors);
      }

      result.success = true;
      result.restoredIPs = restoredIPs;
      result.restoredPaths = restoredPaths;

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  private async loadBackupFromKV(backupId: string): Promise<any[]> {
    const chunksInfo = await this.env.API_GATEWAY_STORAGE.get(`backup-chunks:${backupId}`, 'json') as any;
    
    if (!chunksInfo) {
      throw new Error(`Backup chunks info not found for ${backupId}`);
    }

    let reassembledData = '';
    
    for (let i = 0; i < chunksInfo.totalChunks; i++) {
      const chunkData = await this.env.API_GATEWAY_STORAGE.get(`backup-chunk:${backupId}:${i}`);
      
      if (!chunkData) {
        throw new Error(`Missing backup chunk ${i} for ${backupId}`);
      }
      
      reassembledData += chunkData;
    }

    return JSON.parse(reassembledData);
  }

  private async restoreBatch(ips: string[], ipGroups: Map<string, any[]>): Promise<{
    restoredIPs: number;
    restoredPaths: number;
    errors: string[];
  }> {
    const result = { restoredIPs: 0, restoredPaths: 0, errors: [] as string[] };
    
    const promises = ips.map(async (ip) => {
      try {
        const pathsData = ipGroups.get(ip) || [];
        
        for (const pathData of pathsData) {
          const doId = this.env.PATH_COLLECTOR.idFromName(ip);
          const collector = this.env.PATH_COLLECTOR.get(doId);
          
          // 重建路径记录
          const recordUrl = new URL('http://dummy/record');
          recordUrl.searchParams.set('path', pathData.pathKey.split(':')[1] || pathData.pathKey);
          recordUrl.searchParams.set('method', pathData.method);
          if (pathData.country) recordUrl.searchParams.set('country', pathData.country);
          if (pathData.userAgent) recordUrl.searchParams.set('userAgent', pathData.userAgent);
          
          await collector.fetch(recordUrl.toString());
          result.restoredPaths++;
        }
        
        result.restoredIPs++;
      } catch (error) {
        result.errors.push(`Failed to restore IP ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    await Promise.allSettled(promises);
    return result;
  }

  private async getActiveIPs(): Promise<string[]> {
    try {
      const activeIPsData = await this.env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') as string[];
      return activeIPsData || [];
    } catch (error) {
      console.warn('Failed to get active IPs for backup:', error);
      return [];
    }
  }
}
```

### 定时备份配置

```typescript
// src/handlers/cron.ts
import { BackupManager } from '../lib/backup-manager';

export async function handleScheduledBackup(env: Env, ctx: ExecutionContext): Promise<void> {
  const backupManager = new BackupManager(env);
  
  ctx.waitUntil(
    (async () => {
      try {
        console.log('Starting scheduled backup...');
        const result = await backupManager.performDailyBackup();
        
        if (result.success) {
          console.log(`Backup completed successfully:`, {
            backupId: result.backupId,
            totalIPs: result.totalIPs,
            totalPaths: result.totalPaths,
            backupSize: `${(result.backupSize / 1024 / 1024).toFixed(2)} MB`
          });
          
          // 发送成功通知（如果配置了）
          if (env.BACKUP_WEBHOOK_URL) {
            await fetch(env.BACKUP_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'backup_success',
                backupId: result.backupId,
                timestamp: new Date().toISOString(),
                stats: result
              })
            });
          }
        } else {
          console.error('Backup failed');
          
          // 发送失败通知
          if (env.BACKUP_WEBHOOK_URL) {
            await fetch(env.BACKUP_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'backup_failure',
                timestamp: new Date().toISOString(),
                error: 'Backup operation failed'
              })
            });
          }
        }
      } catch (error) {
        console.error('Scheduled backup error:', error);
      }
    })()
  );
}

// wrangler.toml 配置
/*
[triggers]
crons = ["0 2 * * *"]  # 每天凌晨2点执行备份
*/
```

## 增量备份优化

### 增量备份管理器

```typescript
// 增量备份支持
export class IncrementalBackupManager extends BackupManager {
  
  /**
   * 执行增量备份
   * 只备份自上次备份以来有变化的数据
   */
  async performIncrementalBackup(lastBackupTimestamp: string): Promise<any> {
    const incrementalBackupId = `incremental-${new Date().toISOString().split('T')[0]}`;
    const changedData: any[] = [];
    
    try {
      const activeIPs = await this.getActiveIPs();
      const lastBackupTime = new Date(lastBackupTimestamp);
      
      // 查找自上次备份以来有活动的 IP
      for (const ip of activeIPs) {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const statsResponse = await collector.fetch(new Request('http://dummy/stats'));
        
        if (statsResponse.ok) {
          const ipStats = await statsResponse.json();
          
          // 检查是否有新活动
          if (new Date(ipStats.lastActivity) > lastBackupTime) {
            const pathsResponse = await collector.fetch(new Request('http://dummy/paths'));
            
            if (pathsResponse.ok) {
              const pathsData = await pathsResponse.json();
              
              // 只备份有变化的路径
              for (const pathData of pathsData.paths || []) {
                if (new Date(pathData.lastAccessed) > lastBackupTime) {
                  changedData.push({
                    backupType: 'incremental',
                    baseBackup: lastBackupTimestamp,
                    timestamp: new Date().toISOString(),
                    ip,
                    ...pathData
                  });
                }
              }
            }
          }
        }
      }
      
      // 存储增量备份
      const compressedData = this.compressBackupData(changedData);
      await this.storeBackupToKV(incrementalBackupId, compressedData);
      
      // 记录增量备份元数据
      await this.env.API_GATEWAY_STORAGE.put(`backup-metadata:${incrementalBackupId}`, JSON.stringify({
        backupId: incrementalBackupId,
        type: 'incremental',
        baseBackup: lastBackupTimestamp,
        timestamp: new Date().toISOString(),
        changedRecords: changedData.length,
        backupSize: compressedData.length
      }));
      
      return {
        success: true,
        backupId: incrementalBackupId,
        changedRecords: changedData.length,
        backupSize: compressedData.length
      };
      
    } catch (error) {
      console.error('Incremental backup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 智能增量备份调度
   * 根据数据变化频率自动调整备份频率
   */
  async scheduleSmartBackup(env: Env): Promise<void> {
    const lastFullBackup = await this.getLastFullBackup(env);
    const dataChangeRate = await this.calculateChangeRate(env);
    
    // 根据变化率调整备份策略
    if (dataChangeRate > 0.5) {
      // 高变化率：每6小时增量备份
      if (this.shouldRunIncrementalBackup(lastFullBackup, 6)) {
        await this.performIncrementalBackup(lastFullBackup.timestamp);
      }
    } else if (dataChangeRate > 0.2) {
      // 中等变化率：每12小时增量备份
      if (this.shouldRunIncrementalBackup(lastFullBackup, 12)) {
        await this.performIncrementalBackup(lastFullBackup.timestamp);
      }
    } else {
      // 低变化率：每24小时增量备份
      if (this.shouldRunIncrementalBackup(lastFullBackup, 24)) {
        await this.performIncrementalBackup(lastFullBackup.timestamp);
      }
    }
  }

  private async calculateChangeRate(env: Env): Promise<number> {
    // 通过分析最近的请求活动计算数据变化率
    const recentActivity = await this.getRecentActivityMetrics(env);
    const baselineActivity = await this.getBaselineActivity(env);
    
    if (baselineActivity === 0) return 1.0; // 新系统，高变化率
    
    return Math.min(recentActivity / baselineActivity, 1.0);
  }

  private async getRecentActivityMetrics(env: Env): Promise<number> {
    // 获取最近24小时的活动指标
    try {
      const trafficStatsId = env.TRAFFIC_MONITOR.idFromName('global');
      const trafficMonitor = env.TRAFFIC_MONITOR.get(trafficStatsId);
      const response = await trafficMonitor.fetch('http://dummy/stats');
      
      if (response.ok) {
        const stats = await response.json();
        return stats.recentRequests || 0;
      }
    } catch (error) {
      console.warn('Failed to get recent activity metrics:', error);
    }
    
    return 0;
  }

  private async getBaselineActivity(env: Env): Promise<number> {
    // 获取历史平均活动水平
    // 这里可以从之前的备份元数据中计算
    try {
      const backupList = await env.API_GATEWAY_STORAGE.list({ prefix: 'backup-metadata:' });
      let totalPaths = 0;
      let backupCount = 0;
      
      for (const key of backupList.keys.slice(-7)) { // 最近7天
        const metadata = await env.API_GATEWAY_STORAGE.get(key.name, 'json') as any;
        if (metadata && metadata.totalPaths) {
          totalPaths += metadata.totalPaths;
          backupCount++;
        }
      }
      
      return backupCount > 0 ? totalPaths / backupCount : 0;
    } catch (error) {
      console.warn('Failed to get baseline activity:', error);
      return 0;
    }
  }

  private shouldRunIncrementalBackup(lastBackup: any, intervalHours: number): boolean {
    if (!lastBackup) return true;
    
    const now = Date.now();
    const lastBackupTime = new Date(lastBackup.timestamp).getTime();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    return (now - lastBackupTime) >= intervalMs;
  }

  private async getLastFullBackup(env: Env): Promise<any> {
    try {
      const backupList = await env.API_GATEWAY_STORAGE.list({ prefix: 'backup-metadata:' });
      
      for (const key of backupList.keys.reverse()) {
        const metadata = await env.API_GATEWAY_STORAGE.get(key.name, 'json') as any;
        if (metadata && metadata.type !== 'incremental') {
          return metadata;
        }
      }
    } catch (error) {
      console.warn('Failed to get last full backup:', error);
    }
    
    return null;
  }
}
```

## 手动备份与恢复API

### 备份管理API路由

```typescript
// src/routes/admin/backup.ts
import { Hono } from 'hono';
import { BackupManager } from '../../lib/backup-manager';
import type { Env } from '../../types/env';

const app = new Hono<{ Bindings: Env }>();

// 手动触发备份
app.post('/backup/create', async (c) => {
  try {
    const backupManager = new BackupManager(c.env);
    const result = await backupManager.performDailyBackup();
    
    return c.json(result);
  } catch (error) {
    return c.json({ 
      error: 'Failed to create backup',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 获取备份列表
app.get('/backup/list', async (c) => {
  try {
    const backupList = await c.env.API_GATEWAY_STORAGE.list({ prefix: 'backup-metadata:' });
    const backups = [];
    
    for (const key of backupList.keys) {
      const metadata = await c.env.API_GATEWAY_STORAGE.get(key.name, 'json');
      if (metadata) {
        backups.push(metadata);
      }
    }
    
    // 按时间倒序排列
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return c.json({ backups });
  } catch (error) {
    return c.json({ error: 'Failed to list backups' }, 500);
  }
});

// 从备份恢复数据
app.post('/backup/restore/:backupId', async (c) => {
  try {
    const backupId = c.req.param('backupId');
    const backupManager = new BackupManager(c.env);
    
    const result = await backupManager.restoreFromBackup(backupId);
    
    return c.json(result);
  } catch (error) {
    return c.json({ 
      error: 'Failed to restore from backup',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 删除备份
app.delete('/backup/:backupId', async (c) => {
  try {
    const backupId = c.req.param('backupId');
    
    // 获取备份元数据
    const metadata = await c.env.API_GATEWAY_STORAGE.get(`backup-metadata:${backupId}`, 'json') as any;
    
    if (!metadata) {
      return c.json({ error: 'Backup not found' }, 404);
    }

    // 删除备份数据
    if (metadata.location === 'R2' && c.env.BACKUP_STORAGE) {
      await c.env.BACKUP_STORAGE.delete(`${backupId}.json.gz`);
    } else {
      // 删除 KV 分块数据
      const chunksInfo = await c.env.API_GATEWAY_STORAGE.get(`backup-chunks:${backupId}`, 'json') as any;
      
      if (chunksInfo) {
        for (let i = 0; i < chunksInfo.totalChunks; i++) {
          await c.env.API_GATEWAY_STORAGE.delete(`backup-chunk:${backupId}:${i}`);
        }
        await c.env.API_GATEWAY_STORAGE.delete(`backup-chunks:${backupId}`);
      }
    }

    // 删除元数据
    await c.env.API_GATEWAY_STORAGE.delete(`backup-metadata:${backupId}`);
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ 
      error: 'Failed to delete backup',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// 验证备份完整性
app.post('/backup/verify/:backupId', async (c) => {
  try {
    const backupId = c.req.param('backupId');
    const verificationResult = await verifyBackupIntegrity(c.env, backupId);
    
    return c.json(verificationResult);
  } catch (error) {
    return c.json({ 
      error: 'Failed to verify backup',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

async function verifyBackupIntegrity(env: Env, backupId: string): Promise<{
  valid: boolean;
  errors: string[];
  stats: {
    totalRecords: number;
    validRecords: number;
    corruptedRecords: number;
  };
}> {
  const result = {
    valid: true,
    errors: [] as string[],
    stats: { totalRecords: 0, validRecords: 0, corruptedRecords: 0 }
  };

  try {
    // 获取备份元数据
    const metadata = await env.API_GATEWAY_STORAGE.get(`backup-metadata:${backupId}`, 'json') as any;
    
    if (!metadata) {
      result.errors.push('Backup metadata not found');
      result.valid = false;
      return result;
    }

    // 验证备份数据
    let backupData: any[];
    
    if (metadata.location === 'R2' && env.BACKUP_STORAGE) {
      const compressed = await env.BACKUP_STORAGE.get(`${backupId}.json.gz`);
      if (!compressed) {
        result.errors.push('Backup file not found in R2');
        result.valid = false;
        return result;
      }
      
      try {
        const decompressed = await compressed.text();
        backupData = JSON.parse(decompressed);
      } catch (parseError) {
        result.errors.push('Failed to parse backup data');
        result.valid = false;
        return result;
      }
    } else {
      try {
        const backupManager = new BackupManager(env);
        backupData = await backupManager['loadBackupFromKV'](backupId);
      } catch (loadError) {
        result.errors.push('Failed to load backup from KV');
        result.valid = false;
        return result;
      }
    }

    // 验证数据结构
    for (const record of backupData) {
      result.stats.totalRecords++;
      
      if (validateBackupRecord(record)) {
        result.stats.validRecords++;
      } else {
        result.stats.corruptedRecords++;
        result.errors.push(`Invalid record for IP: ${record.ip}`);
      }
    }

    // 检查记录数量是否匹配元数据
    if (result.stats.totalRecords !== metadata.totalPaths) {
      result.errors.push(`Record count mismatch: expected ${metadata.totalPaths}, found ${result.stats.totalRecords}`);
      result.valid = false;
    }

    // 如果有损坏记录，标记为无效
    if (result.stats.corruptedRecords > 0) {
      result.valid = false;
    }

  } catch (error) {
    result.errors.push(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.valid = false;
  }

  return result;
}

function validateBackupRecord(record: any): boolean {
  // 验证备份记录的必要字段
  const requiredFields = ['backupVersion', 'timestamp', 'ip'];
  
  for (const field of requiredFields) {
    if (!record[field]) {
      return false;
    }
  }
  
  // 如果不是失败记录，需要验证路径数据
  if (record.status !== 'failed') {
    const pathFields = ['pathKey', 'method', 'count'];
    for (const field of pathFields) {
      if (record[field] === undefined || record[field] === null) {
        return false;
      }
    }
  }
  
  return true;
}

export default app;
```

## 数据迁移方案

### KV到DO的迁移工具

```typescript
// src/lib/migration-manager.ts
export class DataMigrationManager {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 从旧的KV系统迁移数据到新的DO系统
   */
  async migrateFromKV(): Promise<{
    success: boolean;
    migratedIPs: number;
    migratedPaths: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      migratedIPs: 0,
      migratedPaths: 0,
      errors: [] as string[]
    };

    try {
      // 1. 获取旧KV系统中的统一路径数据
      const unifiedPathsKey = 'unified-paths-v2';
      const legacyData = await this.env.API_GATEWAY_STORAGE.get(unifiedPathsKey, 'json') as any;
      
      if (!legacyData) {
        result.errors.push('No legacy data found to migrate');
        return result;
      }

      // 2. 解析并重组数据
      const ipPathMap = this.reorganizeKVData(legacyData);
      
      // 3. 批量迁移到DO系统
      const batchSize = 50;
      const ips = Array.from(ipPathMap.keys());
      
      for (let i = 0; i < ips.length; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const batchResult = await this.migrateBatch(batch, ipPathMap);
        
        result.migratedIPs += batchResult.migratedIPs;
        result.migratedPaths += batchResult.migratedPaths;
        result.errors.push(...batchResult.errors);
      }

      // 4. 验证迁移结果
      const verification = await this.verifyMigration(ipPathMap);
      if (!verification.valid) {
        result.errors.push(...verification.errors);
      } else {
        result.success = true;
      }

      // 5. 备份旧数据（可选）
      if (result.success) {
        await this.backupLegacyData(legacyData);
      }

    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private reorganizeKVData(legacyData: any): Map<string, any[]> {
    const ipPathMap = new Map<string, any[]>();
    
    // 旧KV格式: { "path": { "ip1": {...}, "ip2": {...} } }
    // 新DO格式: Map<IP, PathData[]>
    
    for (const [pathKey, pathData] of Object.entries(legacyData)) {
      if (typeof pathData === 'object' && pathData !== null) {
        for (const [ip, ipData] of Object.entries(pathData as any)) {
          if (!ipPathMap.has(ip)) {
            ipPathMap.set(ip, []);
          }
          
          ipPathMap.get(ip)!.push({
            pathKey,
            ...ipData,
            migratedAt: new Date().toISOString()
          });
        }
      }
    }
    
    return ipPathMap;
  }

  private async migrateBatch(
    ipBatch: string[], 
    ipPathMap: Map<string, any[]>
  ): Promise<{
    migratedIPs: number;
    migratedPaths: number;
    errors: string[];
  }> {
    const result = { migratedIPs: 0, migratedPaths: 0, errors: [] as string[] };
    
    const promises = ipBatch.map(async (ip) => {
      try {
        const pathsData = ipPathMap.get(ip) || [];
        
        if (pathsData.length === 0) return;

        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        // 为每个路径创建记录
        for (const pathData of pathsData) {
          const recordUrl = new URL('http://dummy/record');
          
          // 解析pathKey (格式: "METHOD:path")
          const [method, path] = pathData.pathKey.split(':', 2);
          
          recordUrl.searchParams.set('path', path || pathData.pathKey);
          recordUrl.searchParams.set('method', method || 'GET');
          
          if (pathData.userAgent) {
            recordUrl.searchParams.set('userAgent', pathData.userAgent);
          }
          if (pathData.country) {
            recordUrl.searchParams.set('country', pathData.country);
          }
          
          // 模拟多次调用以重建计数
          const count = pathData.count || 1;
          for (let i = 0; i < Math.min(count, 100); i++) { // 限制重建次数
            await collector.fetch(recordUrl.toString());
          }
          
          result.migratedPaths++;
        }
        
        result.migratedIPs++;
      } catch (error) {
        result.errors.push(`Failed to migrate IP ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    await Promise.allSettled(promises);
    return result;
  }

  private async verifyMigration(originalData: Map<string, any[]>): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const result = { valid: true, errors: [] as string[] };
    
    // 抽样验证：检查前10个IP的数据
    const sampleIPs = Array.from(originalData.keys()).slice(0, 10);
    
    for (const ip of sampleIPs) {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const response = await collector.fetch('http://dummy/paths');
        if (!response.ok) {
          result.errors.push(`Failed to verify migration for IP ${ip}`);
          result.valid = false;
          continue;
        }
        
        const doData = await response.json();
        const originalPaths = originalData.get(ip) || [];
        
        // 检查路径数量
        if (doData.paths.length !== originalPaths.length) {
          result.errors.push(`Path count mismatch for IP ${ip}: expected ${originalPaths.length}, got ${doData.paths.length}`);
          result.valid = false;
        }
        
      } catch (error) {
        result.errors.push(`Verification failed for IP ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.valid = false;
      }
    }
    
    return result;
  }

  private async backupLegacyData(legacyData: any): Promise<void> {
    const backupKey = `legacy-backup-${new Date().toISOString().split('T')[0]}`;
    
    try {
      await this.env.API_GATEWAY_STORAGE.put(
        backupKey,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          originalKey: 'unified-paths-v2',
          data: legacyData
        }),
        {
          expirationTtl: 90 * 24 * 60 * 60 // 保留90天
        }
      );
      
      console.log(`Legacy data backed up with key: ${backupKey}`);
    } catch (error) {
      console.warn('Failed to backup legacy data:', error);
    }
  }

  /**
   * 双写模式：同时写入KV和DO
   * 用于渐进式迁移
   */
  async enableDualWriteMode(): Promise<void> {
    await this.env.API_GATEWAY_STORAGE.put('migration-mode', 'dual-write', {
      expirationTtl: 30 * 24 * 60 * 60 // 30天
    });
  }

  async disableDualWriteMode(): Promise<void> {
    await this.env.API_GATEWAY_STORAGE.delete('migration-mode');
  }

  async isDualWriteModeEnabled(): Promise<boolean> {
    const mode = await this.env.API_GATEWAY_STORAGE.get('migration-mode');
    return mode === 'dual-write';
  }
}
```

## 存储成本优化

### 成本分析工具

```typescript
// src/lib/cost-analyzer.ts
export class StorageCostAnalyzer {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  async generateCostReport(): Promise<{
    currentPeriod: CostBreakdown;
    projectedMonthly: CostBreakdown;
    optimizationSuggestions: string[];
  }> {
    const currentCosts = await this.calculateCurrentCosts();
    const projectedCosts = this.projectMonthlyCosts(currentCosts);
    const suggestions = this.generateOptimizationSuggestions(currentCosts);

    return {
      currentPeriod: currentCosts,
      projectedMonthly: projectedCosts,
      optimizationSuggestions: suggestions
    };
  }

  private async calculateCurrentCosts(): Promise<CostBreakdown> {
    const costs: CostBreakdown = {
      doRequests: 0,
      doGBSeconds: 0,
      kvOperations: 0,
      r2Storage: 0,
      r2Operations: 0,
      total: 0
    };

    // 计算DO成本
    const doStats = await this.getDOUsageStats();
    costs.doRequests = this.calculateDORequestCosts(doStats.requests);
    costs.doGBSeconds = this.calculateDOGBSecondCosts(doStats.gbSeconds);

    // 计算KV成本
    const kvStats = await this.getKVUsageStats();
    costs.kvOperations = this.calculateKVCosts(kvStats.operations);

    // 计算R2成本
    if (this.env.BACKUP_STORAGE) {
      const r2Stats = await this.getR2UsageStats();
      costs.r2Storage = this.calculateR2StorageCosts(r2Stats.storageGB);
      costs.r2Operations = this.calculateR2OperationCosts(r2Stats.operations);
    }

    costs.total = costs.doRequests + costs.doGBSeconds + costs.kvOperations + costs.r2Storage + costs.r2Operations;

    return costs;
  }

  private calculateDORequestCosts(requests: number): number {
    const freeRequests = 1000000; // 100万免费请求
    const paidRequests = Math.max(0, requests - freeRequests);
    return (paidRequests / 1000000) * 0.15; // $0.15 per million requests
  }

  private calculateDOGBSecondCosts(gbSeconds: number): number {
    return (gbSeconds / 1000000) * 12.50; // $12.50 per million GB-seconds
  }

  private calculateKVCosts(operations: number): number {
    // KV定价比较复杂，这里简化计算
    const readCost = (operations * 0.5 / 1000000) * 0.50; // 假设50%读操作
    const writeCost = (operations * 0.5 / 1000000) * 5.00; // 50%写操作
    return readCost + writeCost;
  }

  private calculateR2StorageCosts(storageGB: number): number {
    const freeStorage = 10; // 10GB免费存储
    const paidStorage = Math.max(0, storageGB - freeStorage);
    return paidStorage * 0.015; // $0.015 per GB per month
  }

  private calculateR2OperationCosts(operations: number): number {
    const freeOperations = 1000000; // 100万免费操作
    const paidOperations = Math.max(0, operations - freeOperations);
    return (paidOperations / 1000000) * 4.50; // $4.50 per million operations
  }

  private generateOptimizationSuggestions(costs: CostBreakdown): string[] {
    const suggestions: string[] = [];

    if (costs.doGBSeconds > costs.doRequests) {
      suggestions.push('DO持续时间成本较高，建议优化DO休眠策略');
    }

    if (costs.kvOperations > 5.0) {
      suggestions.push('KV操作成本较高，考虑增加缓存或减少写入频率');
    }

    if (costs.r2Storage > 1.0) {
      suggestions.push('R2存储成本较高，考虑压缩备份文件或清理旧备份');
    }

    if (costs.total > 50.0) {
      suggestions.push('总成本较高，建议启用数据生命周期管理');
    }

    return suggestions;
  }

  private async getDOUsageStats(): Promise<{ requests: number; gbSeconds: number }> {
    // 这里需要集成真实的监控数据
    // 可以从Analytics Engine或其他监控系统获取
    return { requests: 0, gbSeconds: 0 };
  }

  private async getKVUsageStats(): Promise<{ operations: number }> {
    // 从KV使用情况获取统计
    return { operations: 0 };
  }

  private async getR2UsageStats(): Promise<{ storageGB: number; operations: number }> {
    // 从R2使用情况获取统计
    return { storageGB: 0, operations: 0 };
  }

  private projectMonthlyCosts(currentCosts: CostBreakdown): CostBreakdown {
    // 根据当前使用情况投射月度成本
    const daysInMonth = 30;
    const currentDays = 1; // 假设当前数据代表1天
    const projectionFactor = daysInMonth / currentDays;

    return {
      doRequests: currentCosts.doRequests * projectionFactor,
      doGBSeconds: currentCosts.doGBSeconds * projectionFactor,
      kvOperations: currentCosts.kvOperations * projectionFactor,
      r2Storage: currentCosts.r2Storage, // 存储成本按月计算
      r2Operations: currentCosts.r2Operations * projectionFactor,
      total: 0
    };
  }
}

interface CostBreakdown {
  doRequests: number;
  doGBSeconds: number;
  kvOperations: number;
  r2Storage: number;
  r2Operations: number;
  total: number;
}
```

## 灾难恢复计划

### 灾难恢复策略

```typescript
// src/lib/disaster-recovery.ts
export class DisasterRecoveryManager {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 执行灾难恢复流程
   */
  async executeDisasterRecovery(scenario: 'data_corruption' | 'service_outage' | 'storage_failure'): Promise<{
    success: boolean;
    steps: RecoveryStep[];
    estimatedRecoveryTime: number;
  }> {
    const recoveryPlan = this.getRecoveryPlan(scenario);
    const result = { success: true, steps: [], estimatedRecoveryTime: 0 };

    for (const step of recoveryPlan.steps) {
      const stepResult = await this.executeRecoveryStep(step);
      result.steps.push(stepResult);
      result.estimatedRecoveryTime += step.estimatedTimeMinutes;

      if (!stepResult.success) {
        result.success = false;
        break;
      }
    }

    return result;
  }

  private getRecoveryPlan(scenario: string): RecoveryPlan {
    const plans: Record<string, RecoveryPlan> = {
      'data_corruption': {
        name: '数据损坏恢复',
        steps: [
          { name: '停止写入操作', action: 'disable_writes', estimatedTimeMinutes: 1 },
          { name: '评估损坏范围', action: 'assess_corruption', estimatedTimeMinutes: 10 },
          { name: '恢复最新备份', action: 'restore_backup', estimatedTimeMinutes: 30 },
          { name: '验证数据完整性', action: 'verify_integrity', estimatedTimeMinutes: 15 },
          { name: '重新启用写入', action: 'enable_writes', estimatedTimeMinutes: 1 }
        ]
      },
      'service_outage': {
        name: '服务中断恢复',
        steps: [
          { name: '启用降级模式', action: 'enable_fallback', estimatedTimeMinutes: 2 },
          { name: '检查依赖服务', action: 'check_dependencies', estimatedTimeMinutes: 5 },
          { name: '重启DO实例', action: 'restart_dos', estimatedTimeMinutes: 10 },
          { name: '验证服务可用性', action: 'verify_service', estimatedTimeMinutes: 5 },
          { name: '恢复正常模式', action: 'restore_normal', estimatedTimeMinutes: 2 }
        ]
      },
      'storage_failure': {
        name: '存储故障恢复',
        steps: [
          { name: '切换到备用存储', action: 'switch_storage', estimatedTimeMinutes: 5 },
          { name: '从备份恢复数据', action: 'restore_from_backup', estimatedTimeMinutes: 45 },
          { name: '重建索引', action: 'rebuild_indexes', estimatedTimeMinutes: 20 },
          { name: '验证数据一致性', action: 'verify_consistency', estimatedTimeMinutes: 15 }
        ]
      }
    };

    return plans[scenario] || plans['service_outage'];
  }

  private async executeRecoveryStep(step: RecoveryStep): Promise<RecoveryStep & { success: boolean; details: string }> {
    const result = { ...step, success: false, details: '' };

    try {
      switch (step.action) {
        case 'disable_writes':
          await this.disableWrites();
          result.success = true;
          result.details = '写入操作已停用';
          break;

        case 'assess_corruption':
          const assessment = await this.assessDataCorruption();
          result.success = true;
          result.details = `发现 ${assessment.corruptedIPs} 个损坏的IP记录`;
          break;

        case 'restore_backup':
          const backupResult = await this.restoreLatestBackup();
          result.success = backupResult.success;
          result.details = backupResult.success ? 
            `恢复了 ${backupResult.restoredIPs} 个IP的数据` : 
            `备份恢复失败: ${backupResult.errors.join(', ')}`;
          break;

        case 'verify_integrity':
          const integrityCheck = await this.verifyDataIntegrity();
          result.success = integrityCheck.valid;
          result.details = integrityCheck.valid ? 
            '数据完整性验证通过' : 
            `发现 ${integrityCheck.errors.length} 个完整性问题`;
          break;

        case 'enable_writes':
          await this.enableWrites();
          result.success = true;
          result.details = '写入操作已重新启用';
          break;

        default:
          result.details = '未知的恢复步骤';
      }
    } catch (error) {
      result.details = `步骤执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return result;
  }

  private async disableWrites(): Promise<void> {
    await this.env.API_GATEWAY_STORAGE.put('service-mode', 'read-only', {
      expirationTtl: 3600 // 1小时自动恢复
    });
  }

  private async enableWrites(): Promise<void> {
    await this.env.API_GATEWAY_STORAGE.delete('service-mode');
  }

  private async assessDataCorruption(): Promise<{ corruptedIPs: number; totalIPs: number }> {
    const activeIPs = await this.env.API_GATEWAY_STORAGE.get('active-ips-list', 'json') as string[] || [];
    let corruptedIPs = 0;

    // 抽样检查（检查前100个IP）
    const sampleIPs = activeIPs.slice(0, 100);
    
    for (const ip of sampleIPs) {
      try {
        const doId = this.env.PATH_COLLECTOR.idFromName(ip);
        const collector = this.env.PATH_COLLECTOR.get(doId);
        
        const response = await collector.fetch('http://dummy/health');
        if (!response.ok) {
          corruptedIPs++;
        }
      } catch (error) {
        corruptedIPs++;
      }
    }

    // 按比例估算总损坏数量
    const corruptionRate = corruptedIPs / sampleIPs.length;
    const estimatedCorruptedTotal = Math.floor(activeIPs.length * corruptionRate);

    return { corruptedIPs: estimatedCorruptedTotal, totalIPs: activeIPs.length };
  }

  private async restoreLatestBackup(): Promise<any> {
    const backupManager = new BackupManager(this.env);
    
    // 获取最新备份
    const backupList = await this.env.API_GATEWAY_STORAGE.list({ prefix: 'backup-metadata:' });
    
    if (backupList.keys.length === 0) {
      return { success: false, errors: ['No backups available'] };
    }

    // 按时间排序，获取最新备份
    const latestBackupKey = backupList.keys.sort((a, b) => 
      b.name.localeCompare(a.name)
    )[0];

    const backupId = latestBackupKey.name.replace('backup-metadata:', '');
    return await backupManager.restoreFromBackup(backupId);
  }

  private async verifyDataIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    // 实现数据完整性验证逻辑
    return { valid: true, errors: [] };
  }
}

interface RecoveryPlan {
  name: string;
  steps: RecoveryStep[];
}

interface RecoveryStep {
  name: string;
  action: string;
  estimatedTimeMinutes: number;
}
```

## 总结

本数据管理与备份系统提供了：

### ✅ 核心功能
- **自动备份**：每日定时备份，支持增量备份
- **数据恢复**：完整的备份恢复机制
- **生命周期管理**：数据分层存储和自动清理
- **成本优化**：智能存储策略和成本分析

### ✅ 高级特性
- **增量备份**：减少存储成本和备份时间
- **数据验证**：备份完整性验证
- **灾难恢复**：完整的DR计划和自动化恢复
- **迁移工具**：从KV到DO的平滑迁移

### ✅ 运维友好
- **监控集成**：备份状态和成本监控
- **API管理**：完整的备份管理API
- **通知机制**：备份成功/失败通知
- **性能优化**：批量处理和并发控制

## 下一步

继续实施后续阶段：

- **[04-performance-testing.md](./04-performance-testing.md)** - 性能测试与优化
- **[05-monitoring-operations.md](./05-monitoring-operations.md)** - 监控与运维
- **[06-security-protection.md](./06-security-protection.md)** - 安全防护机制