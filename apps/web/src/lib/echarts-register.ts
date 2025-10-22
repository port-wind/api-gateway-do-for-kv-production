/**
 * ECharts 地图注册工具
 * 懒加载世界地图 GeoJSON 数据
 */

import * as echarts from 'echarts'

let mapRegistered = false

/**
 * 注册世界地图（懒加载）
 */
export async function registerWorldMap() {
    if (mapRegistered) {
        return
    }

    try {
        // 使用本地地图文件（避免 CDN 被屏蔽问题）
        // 完整版世界地图，来源：Gitee ECharts 地图数据镜像
        const response = await fetch('/maps/world.json')

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        const worldJson = await response.json()

        // 注册地图
        echarts.registerMap('world', worldJson)

        mapRegistered = true
    } catch (error) {
        console.error('Failed to load world map:', error)
        // 降级处理：使用空地图（仍然可以显示散点）
        echarts.registerMap('world', {
            type: 'FeatureCollection',
            features: [],
        })
        mapRegistered = true
    }
}

