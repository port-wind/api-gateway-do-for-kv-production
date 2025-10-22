# API Gateway Reference Documentation

## Overview

This is a high-performance API Gateway built on Cloudflare Workers with Hono.js, providing advanced caching, rate limiting, geo-blocking, and traffic monitoring capabilities.

## 🚀 Features

- **Multi-route Proxy**: Supports multiple upstream services
- **Smart Caching**: Version-controlled caching with automatic invalidation
- **Rate Limiting**: IP-based rate limiting with configurable thresholds
- **Geo-blocking**: Country-based access control
- **Traffic Monitoring**: Real-time traffic analysis and alerting
- **Performance Optimization**: Connection pooling, request coalescing, compression
- **Structured Logging**: JSON-formatted logs with full observability
- **Real-time Configuration**: Dynamic configuration updates via Admin API

## 📋 Table of Contents

- [Proxy Routes](#proxy-routes)
- [Admin API](#admin-api)
  - [Cache Management](#cache-management)
  - [Rate Limiting](#rate-limiting)
  - [Geo-blocking](#geo-blocking)
  - [Traffic Monitoring](#traffic-monitoring)
- [Authentication & Security](#authentication--security)
- [Response Headers](#response-headers)
- [Error Handling](#error-handling)
- [Performance Features](#performance-features)

## 🔄 Proxy Routes

The API Gateway proxies requests to multiple upstream services:

### KV Service Proxy
- **Route**: `/kv/*`
- **Upstream**: `https://dokv.pwtk.cc`
- **Caching**: Enabled by default
- **Example**: `GET /kv/suppart-image-service/meta/generations-list`

### Business Client Proxy  
- **Route**: `/biz-client/*`
- **Upstream**: `https://biz-client.pwtk.cc`
- **Caching**: Enabled by default
- **Example**: `GET /biz-client/api/status`

## 🔧 Admin API

The Admin API provides complete control over the gateway configuration.

### Cache Management

#### Get Cache Configuration
```http
GET /admin/cache/config
```

**Response:**
```json
{
  "enabled": true,
  "version": 1,
  "defaultTtl": 3600,
  "whitelist": ["/kv/*", "/biz-client/*"],
  "pathConfigs": {
    "/kv/critical-data": {
      "enabled": true,
      "ttl": 1800,
      "version": 2
    }
  }
}
```

#### Update Cache Configuration
```http
PUT /admin/cache/config
Content-Type: application/json

{
  "enabled": true,
  "version": 2,
  "whitelist": ["/kv/*", "/biz-client/*"],
  "pathConfigs": {
    "/kv/critical-data": {
      "enabled": true,
      "ttl": 1800,
      "version": 3
    }
  }
}
```

#### Flush Cache (NEW) 🆕
```http
POST /admin/cache/flush
Content-Type: application/json

{
  "keys": ["api/list", "api/users"]
}
```

**Alternative - Pattern-based flush:**
```http
POST /admin/cache/flush
Content-Type: application/json

{
  "pattern": "/api/user/*"
}
```

**Response:**
```json
{
  "success": true,
  "message": "缓存刷新完成",
  "result": {
    "flushedCount": 5,
    "failedKeys": [],
    "totalTime": 120
  },
  "timestamp": "2024-03-20T10:30:00Z"
}
```

#### Preview Cache (NEW) 🆕
```http
GET /admin/cache/preview/{path}?includeContent=true&version=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/api/list",
    "version": 1,
    "createdAt": 1640995200000,
    "expiresAt": 1640998800000,
    "ttl": 3600,
    "remainingTTL": 2400,
    "size": 2048,
    "compressed": true,
    "headers": {
      "content-type": "application/json",
      "etag": "\"abc123\""
    },
    "etag": "\"abc123\"",
    "lastModified": "2024-03-20T09:30:00Z",
    "content": "..."
  },
  "timestamp": "2024-03-20T10:30:00Z"
}
```

#### Batch Cache Operations (NEW) 🆕
```http
POST /admin/cache/batch
Content-Type: application/json

{
  "operation": "flush",
  "paths": ["/api/list", "/api/users"],
  "options": {
    "includeContent": false,
    "version": 1
  }
}
```

**Supported Operations:**
- `"flush"` - 批量刷新缓存
- `"preview"` - 批量预览缓存
- `"stats"` - 批量获取统计信息

**Response:**
```json
{
  "success": true,
  "operation": "flush",
  "results": [
    {
      "path": "/api/list",
      "success": true,
      "deletedCount": 3
    },
    {
      "path": "/api/users",
      "success": true,
      "deletedCount": 1
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  },
  "timestamp": "2024-03-20T10:30:00Z"
}
```

#### Get Cache Statistics
```http
GET /admin/cache/stats
```

**Response:**
```json
{
  "totalEntries": 1247,
  "pathCount": 23,
  "indexSize": 45678,
  "estimatedSize": 6235000,
  "hitRate": 87.5,
  "missRate": 12.5
}
```

#### Invalidate Cache
```http
POST /admin/cache/invalidate
Content-Type: application/json

{
  "pattern": "/kv/user-data/*"
}
```

**Response:**
```json
{
  "success": true,
  "invalidatedKeys": 45,
  "pattern": "/kv/user-data/*"
}
```

#### Batch Path Operations
```http
POST /admin/cache/paths/batch
Content-Type: application/json

{
  "operation": "add",
  "paths": [
    {
      "path": "/kv/new-service/*",
      "enabled": true,
      "ttl": 7200,
      "version": 1
    }
  ]
}
```

### Rate Limiting

#### Get Rate Limit Configuration
```http
GET /admin/rate-limit/config
```

**Response:**
```json
{
  "enabled": true,
  "defaultLimit": 100,
  "windowSeconds": 60,
  "pathLimits": {
    "/admin/*": 10,
    "/kv/heavy-endpoint": 20
  }
}
```

#### Update Rate Limit Configuration
```http
PUT /admin/rate-limit/config
Content-Type: application/json

{
  "enabled": true,
  "defaultLimit": 200,
  "windowSeconds": 60,
  "pathLimits": {
    "/admin/*": 15,
    "/kv/heavy-endpoint": 30
  }
}
```

#### Reset Rate Limit for IP
```http
POST /admin/rate-limit/reset/192.168.1.100
```

**Response:**
```json
{
  "success": true,
  "ip": "192.168.1.100",
  "resetAt": "2024-03-20T10:30:00Z"
}
```

### Geo-blocking

#### Get Geo-blocking Configuration
```http
GET /admin/geo/config
```

**Response:**
```json
{
  "enabled": true,
  "mode": "blacklist",
  "countries": ["CN", "RU", "KP"],
  "pathOverrides": {
    "/kv/public/*": ["US", "CA", "GB", "DE", "FR"]
  }
}
```

#### Update Geo-blocking Configuration
```http
PUT /admin/geo/config
Content-Type: application/json

{
  "enabled": true,
  "mode": "whitelist",
  "countries": ["US", "CA", "GB", "DE", "FR", "JP"],
  "pathOverrides": {
    "/admin/*": ["US", "CA"]
  }
}
```

### Traffic Monitoring

#### Get Traffic Statistics
```http
GET /admin/traffic/stats
```

**Response:**
```json
{
  "stats": {
    "currentRpm": 245,
    "peakRpm": 890,
    "totalRequests": 1567890,
    "cacheHitRate": 87.3,
    "autoCache": false
  },
  "currentWindow": {
    "start": "2024-03-20T10:25:00Z",
    "requests": 1235,
    "cacheHits": 1078,
    "duration": 4.5,
    "threshold": 10000,
    "thresholdExceeded": false
  },
  "topPaths": [
    {"path": "/kv/popular-data", "requests": 456},
    {"path": "/biz-client/api/users", "requests": 234}
  ]
}
```

#### Update Traffic Configuration
```http
PUT /admin/traffic/config
Content-Type: application/json

{
  "alertThreshold": 15000,
  "autoEnableCache": true,
  "measurementWindow": 300
}
```

## 🔐 Authentication & Security

### API Key Authentication (Future Feature)
```http
GET /admin/cache/config
Authorization: Bearer your-api-key-here
```

### Rate Limiting
All endpoints are subject to rate limiting:
- **Default**: 100 requests per minute
- **Admin endpoints**: 10 requests per minute  
- **Custom limits**: Configurable per path

## 📤 Response Headers

### Standard Headers
All responses include these headers:

```http
X-Proxy-By: api-gateway
X-Proxy-Route: /kv
X-Proxy-Target: https://dokv.pwtk.cc
X-Request-ID: uuid4-generated-id
X-Proxy-Timing: {"total": 45, "upstream": 32}
```

### Cache Headers
For cacheable responses:

```http
X-Cache-Status: HIT|MISS|BYPASS
X-Cache-Version: 1
X-Cache-Created: 2024-03-20T10:30:00Z
X-Cache-Key: cache:v1:/kv/data:abc123...
```

### TTL Cache Headers (NEW) 🆕
For TTL-enabled cache responses:

```http
X-Cache-TTL: 3600
X-Cache-Remaining-TTL: 2400
X-Cache-Expires: 2024-03-20T11:30:00Z
ETag: "abc123def456"
Last-Modified: Wed, 20 Mar 2024 10:30:00 GMT
```

**Header Descriptions:**
- `X-Cache-TTL`: 原始TTL设置（秒）
- `X-Cache-Remaining-TTL`: 剩余TTL时间（秒）
- `X-Cache-Expires`: 缓存过期时间（ISO 8601格式）
- `ETag`: 缓存内容的ETag标识
- `Last-Modified`: 缓存内容的最后修改时间

### Rate Limiting Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 2024-03-20T10:31:00Z
X-RateLimit-Reset-Seconds: 45
X-RateLimit-Client-IP: 192.168.1.100
Retry-After: 45
```

### Geo-blocking Headers
```http
X-Geo-Country: US
X-Geo-Allowed: true
X-Geo-Mode: whitelist
```

## ❌ Error Handling

### Rate Limit Exceeded (429)
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Limit: 100 per 60 seconds",
  "retryAfter": 45,
  "limit": 100,
  "remaining": 0,
  "resetAt": "2024-03-20T10:31:00Z"
}
```

### Geo-blocked (403)
```json
{
  "error": "Access denied",
  "message": "Access from your location (CN) is not permitted",
  "country": "CN",
  "path": "/kv/restricted-data",
  "mode": "blacklist"
}
```

### Proxy Error (502)
```json
{
  "error": "Bad Gateway",
  "message": "Failed to proxy request to https://dokv.pwtk.cc",
  "details": "Connection timeout",
  "route": "/kv",
  "requestId": "uuid4-generated-id"
}
```

### Validation Error (400)
```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "boolean",
      "received": "string",
      "path": ["enabled"],
      "message": "Expected boolean, received string"
    }
  ]
}
```

## ⚡ Performance Features

### Connection Pooling
- **Keep-alive connections** to upstream services
- **HTTP/2 support** when available
- **Connection reuse** reduces latency by ~20ms per request

### Request Coalescing
- **Duplicate request detection** for identical GET requests
- **Response sharing** prevents unnecessary upstream calls
- **5-second coalescing window** for optimal performance

### Compression
- **Automatic compression** for responses > 10KB
- **Brotli, Gzip, Deflate** support
- **Content-Encoding** headers preserved

### Smart Caching
- **Version-based invalidation** prevents stale data
- **Path-specific configuration** for fine-grained control
- **Batch operations** for efficient KV usage
- **Compression** for large cache entries

### Performance Monitoring
- **Response time tracking** (P50, P95, P99)
- **Throughput monitoring** (requests/second)
- **Cache performance metrics** (hit rates, sizes)
- **Error rate monitoring** with automatic alerting

## 🔧 Configuration Examples

### High-Performance Setup
```json
{
  "cache": {
    "enabled": true,
    "version": 1,
    "whitelist": ["/*"],
    "pathConfigs": {
      "/kv/hot-data/*": {"version": 1, "enabled": true},
      "/api/users/*": {"version": 2, "enabled": true}
    }
  },
  "rateLimit": {
    "enabled": true,
    "defaultLimit": 1000,
    "windowSeconds": 60,
    "pathLimits": {
      "/admin/*": 50,
      "/api/upload": 10
    }
  },
  "geo": {
    "enabled": true,
    "mode": "whitelist",
    "countries": ["US", "CA", "GB", "DE", "FR", "JP", "AU"]
  }
}
```

### Security-Focused Setup
```json
{
  "rateLimit": {
    "enabled": true,
    "defaultLimit": 100,
    "windowSeconds": 60,
    "pathLimits": {
      "/admin/*": 5,
      "/api/auth/*": 10,
      "/api/sensitive/*": 20
    }
  },
  "geo": {
    "enabled": true,
    "mode": "blacklist",
    "countries": ["CN", "RU", "KP", "IR"],
    "pathOverrides": {
      "/admin/*": []
    }
  }
}
```

## 🚀 Quick Start Examples

### Basic Proxy Request
```bash
curl https://your-gateway.workers.dev/kv/test-endpoint
```

### Check Rate Limit Status
```bash
curl -I https://your-gateway.workers.dev/kv/test-endpoint
# Check X-RateLimit-* headers
```

### Update Cache Configuration
```bash
curl -X PUT https://your-gateway.workers.dev/admin/cache/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "version": 2}'
```

### Monitor Traffic
```bash
curl https://your-gateway.workers.dev/admin/traffic/stats | jq .
```

## 📊 Monitoring & Observability

### Health Check
```http
GET /health
```

### OpenAPI Documentation
```http
GET /openapi.json
GET /docs
```

### Performance Metrics
The gateway automatically tracks:
- Request/response times
- Cache hit ratios  
- Error rates
- Geographic request distribution
- Rate limit effectiveness

All metrics are available through the Admin API and Cloudflare Workers Analytics.

---

## 🛡️ Best Practices

1. **Cache Strategy**: Use version numbers to invalidate cache when data changes
2. **Rate Limiting**: Set appropriate limits based on your upstream capacity
3. **Geo-blocking**: Use whitelist mode for maximum security
4. **Monitoring**: Set up alerts for high error rates or traffic spikes
5. **Performance**: Enable compression and caching for better user experience

For more detailed configuration examples and troubleshooting, see the main [README.md](./README.md).