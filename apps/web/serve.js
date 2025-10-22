#!/usr/bin/env node

/**
 * 生产环境 SPA 静态文件服务器
 * 支持客户端路由的正确回退
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

// ES modules 中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const PORT = process.env.PORT || 14289;
const DIST_DIR = path.join(__dirname, 'dist');

// 检查 dist 目录是否存在
if (!fs.existsSync(DIST_DIR)) {
  console.error(`错误: dist 目录不存在: ${DIST_DIR}`);
  console.error('请先运行 npm run build 构建项目');
  process.exit(1);
}

// 创建 Express 应用
const app = express();

// 日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// 静态文件服务 - 先尝试提供静态文件
app.use(express.static(DIST_DIR, {
  maxAge: '1d', // 静态资源缓存1天
  etag: true,
  lastModified: true,
  // 不对 HTML 文件设置缓存
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// API 路由代理（如果需要的话）
// 注意：在生产环境，API 通常部署在不同的域名或端口
app.all('/api/*', (req, res) => {
  // 如果需要代理到后端 API，在这里配置
  res.status(404).json({ 
    error: 'API endpoint not configured for production',
    message: '请配置生产环境 API 端点'
  });
});

// SPA 回退 - 所有其他路由返回 index.html
app.get('*', (req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  
  // 检查 index.html 是否存在
  if (!fs.existsSync(indexPath)) {
    res.status(500).send('错误: index.html 文件不存在');
    return;
  }
  
  // 发送 index.html，让客户端路由接管
  res.sendFile(indexPath);
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('Internal Server Error');
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('API Gateway Web 服务器已启动');
  console.log(`端口: ${PORT}`);
  console.log(`本地访问: http://localhost:${PORT}`);
  
  // 获取所有网络接口的 IP 地址
  const networkInterfaces = os.networkInterfaces();
  
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`网络访问: http://${iface.address}:${PORT}`);
      }
    });
  });
  
  console.log('========================================');
  console.log('提示: 所有客户端路由都会正确处理');
  console.log('按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});