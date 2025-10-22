#!/usr/bin/env node

/**
 * 缓存测试用的后端模拟服务器
 * 用于记录实际到达后端的请求次数，验证缓存是否生效
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 服务器配置
const PORT = 3001;
const HOST = 'localhost';

// 请求统计数据
let requestStats = {
  totalRequests: 0,
  requests: [],
  startTime: Date.now()
};

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const requestId = ++requestStats.totalRequests;
  
  console.log(`\n🔄 收到请求 #${requestId}`);
  console.log(`   方法: ${req.method}`);
  console.log(`   路径: ${req.url}`);
  console.log(`   时间: ${new Date().toISOString()}`);
  
  // 记录请求信息
  const requestInfo = {
    id: requestId,
    method: req.method,
    url: req.url,
    headers: req.headers,
    timestamp: Date.now(),
    processTime: 0
  };

  // 读取请求体
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    requestInfo.body = body;
    requestInfo.processTime = Date.now() - startTime;
    requestStats.requests.push(requestInfo);

    // 根据路径处理不同的请求
    if (req.url === '/stats') {
      handleStatsRequest(res);
    } else if (req.url === '/reset') {
      handleResetRequest(res);
    } else if (req.url.startsWith('/api/test')) {
      handleTestRequest(req, res, requestInfo);
    } else {
      handleDefaultRequest(req, res, requestInfo);
    }
  });
});

/**
 * 处理统计请求
 */
function handleStatsRequest(res) {
  const uptime = Date.now() - requestStats.startTime;
  const stats = {
    totalRequests: requestStats.totalRequests,
    uptime,
    startTime: new Date(requestStats.startTime).toISOString(),
    requests: requestStats.requests.map(req => ({
      id: req.id,
      method: req.method,
      url: req.url,
      timestamp: new Date(req.timestamp).toISOString(),
      processTime: req.processTime,
      bodyLength: req.body ? req.body.length : 0
    }))
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(stats, null, 2));
  
  console.log(`📊 返回统计信息: ${requestStats.totalRequests} 个请求`);
}

/**
 * 处理重置请求
 */
function handleResetRequest(res) {
  console.log('🔄 重置统计数据');
  requestStats = {
    totalRequests: 0,
    requests: [],
    startTime: Date.now()
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ success: true, message: 'Stats reset' }));
}

/**
 * 处理测试 API 请求
 */
function handleTestRequest(req, res, requestInfo) {
  // 模拟一些处理时间（证明这是真实的后端请求）
  const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms
  
  setTimeout(() => {
    const responseData = {
      success: true,
      message: 'Hello from mock backend!',
      requestId: requestInfo.id,
      totalRequests: requestStats.totalRequests,
      timestamp: new Date().toISOString(),
      serverDelay: delay,
      receivedData: requestInfo.body ? JSON.parse(requestInfo.body || '{}') : null,
      headers: {
        'x-backend-request-id': requestInfo.id.toString(),
        'x-backend-total-requests': requestStats.totalRequests.toString(),
        'x-backend-delay': delay.toString()
      }
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Backend-Request-ID': requestInfo.id.toString(),
      'X-Backend-Total-Requests': requestStats.totalRequests.toString(),
      'X-Backend-Delay': delay.toString()
    });
    res.end(JSON.stringify(responseData, null, 2));
    
    console.log(`✅ 响应请求 #${requestInfo.id}, 延迟: ${delay}ms`);
  }, delay);
}

/**
 * 处理默认请求
 */
function handleDefaultRequest(req, res, requestInfo) {
  const responseData = {
    success: true,
    message: 'Mock backend server response',
    requestId: requestInfo.id,
    totalRequests: requestStats.totalRequests,
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(responseData, null, 2));
  
  console.log(`✅ 响应默认请求 #${requestInfo.id}`);
}

// 启动服务器
server.listen(PORT, HOST, () => {
  console.log(`🚀 模拟后端服务器启动成功!`);
  console.log(`   地址: http://${HOST}:${PORT}`);
  console.log(`   测试端点: http://${HOST}:${PORT}/api/test`);
  console.log(`   统计端点: http://${HOST}:${PORT}/stats`);
  console.log(`   重置端点: http://${HOST}:${PORT}/reset`);
  console.log(`\n📊 服务器将记录所有到达的请求，用于验证缓存效果`);
  console.log(`⏰ 启动时间: ${new Date().toISOString()}\n`);
});

// 处理进程退出
process.on('SIGINT', () => {
  console.log('\n📊 最终统计:');
  console.log(`   总请求数: ${requestStats.totalRequests}`);
  console.log(`   运行时长: ${Math.round((Date.now() - requestStats.startTime) / 1000)}秒`);
  console.log('\n👋 服务器关闭');
  process.exit(0);
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});