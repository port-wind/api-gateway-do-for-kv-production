/**
 * 幂等 ID 生成器
 * 
 * 用于 Phase 1 双写场景的去重，确保同一请求不会被计数两次。
 * 
 * 格式：{timestamp}-{hash8}
 * 示例：1730956800000-a1b2c3d4
 */

/**
 * 生成幂等 ID
 * 
 * @param timestamp 事件时间戳（毫秒）
 * @param clientIP 客户端 IP
 * @param path 请求路径
 * @param requestId 请求 ID（如 CF-Ray）
 * @returns 幂等 ID（格式：timestamp-hash8）
 * 
 * @example
 * const id = await generateIdempotentId(
 *   Date.now(),
 *   '192.168.1.1',
 *   '/api/users',
 *   'req-123'
 * );
 * // 返回：1730956800000-a1b2c3d4
 */
export async function generateIdempotentId(
  timestamp: number,
  clientIP: string,
  path: string,
  requestId: string
): Promise<string> {
  // 拼接唯一标识
  const raw = `${clientIP}:${path}:${requestId}`;
  
  // 计算 SHA-256 哈希
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  );
  
  // 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // 格式：timestamp-hash8（前 8 位哈希）
  return `${timestamp}-${hashHex.slice(0, 8)}`;
}

/**
 * 验证幂等 ID 格式
 * 
 * @param id 幂等 ID
 * @returns 是否有效
 * 
 * @example
 * isValidIdempotentId('1730956800000-a1b2c3d4'); // true
 * isValidIdempotentId('invalid'); // false
 */
export function isValidIdempotentId(id: string): boolean {
  // 格式：13位时间戳-8位十六进制
  const pattern = /^\d{13}-[0-9a-f]{8}$/;
  return pattern.test(id);
}

/**
 * 从幂等 ID 中提取时间戳
 * 
 * @param id 幂等 ID
 * @returns 时间戳（毫秒），无效时返回 null
 * 
 * @example
 * extractTimestamp('1730956800000-a1b2c3d4'); // 1730956800000
 * extractTimestamp('invalid'); // null
 */
export function extractTimestamp(id: string): number | null {
  if (!isValidIdempotentId(id)) {
    return null;
  }
  const timestamp = parseInt(id.split('-')[0], 10);
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * 计算 IP 哈希
 * 
 * 用于唯一 IP 统计（不存储原始 IP，只存储哈希值）
 * 
 * @param ip 客户端 IP
 * @returns 哈希值（十六进制字符串，前 16 位）
 * 
 * @example
 * const hash = await hashIP('192.168.1.1');
 * // 返回：a1b2c3d4e5f6a7b8
 */
export async function hashIP(ip: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // 取前 16 位（64 位）
}

