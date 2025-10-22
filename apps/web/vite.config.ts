import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { inspectorServer } from '@react-dev-inspector/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    // React Dev Inspector - 开发工具：点击元素跳转到代码
    inspectorServer(),
  ],
  define: {
    // 注入构建时间戳，用于版本标识
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(
      new Date().toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\//g, '-').replace(/,/, '')
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // 代理所有 /api/* 请求到后端 API
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    },
    // 配置中间件处理SPA路由回退
    middlewareMode: false,
  },
  // 配置开发服务器的history API回退
  appType: 'spa'
})
