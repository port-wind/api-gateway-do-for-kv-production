/**
 * 城市数据 API
 * 
 * 提供城市列表供前端选择器使用
 */

import { Hono } from 'hono';
import { CITY_COORDS } from '../../lib/geo-city-coords';

const app = new Hono();

/**
 * GET /admin/cities
 * 
 * 获取所有 Tier 1 城市列表
 * 
 * Query参数:
 * - search: 搜索关键词（可选）
 * - limit: 返回数量限制（可选，默认1000）
 * 
 * 响应:
 * {
 *   cities: [
 *     { name: "Shanghai", country: "CN", population: 24874500, coords: [121.45806, 31.22222] },
 *     ...
 *   ],
 *   total: 1000
 * }
 */
app.get('/', (c) => {
    const search = c.req.query('search')?.toLowerCase() || '';
    const limit = Math.min(parseInt(c.req.query('limit') || '1000', 10), 1000);

    // 获取所有城市
    const allCities = Object.entries(CITY_COORDS).map(([name, info]) => ({
        name,
        country: info.country,
        population: info.population,
        coords: info.coords,
        geonameId: info.geonameId,
    }));

    // 搜索过滤
    let filteredCities = allCities;
    if (search) {
        filteredCities = allCities.filter(city =>
            city.name.toLowerCase().includes(search) ||
            city.country.toLowerCase().includes(search)
        );
    }

    // 按人口降序排序
    filteredCities.sort((a, b) => b.population - a.population);

    // 限制数量
    const cities = filteredCities.slice(0, limit);

    return c.json({
        cities,
        total: filteredCities.length,
        limit,
        search: search || undefined,
    });
});

/**
 * GET /admin/cities/:name
 * 
 * 获取单个城市的详细信息
 */
app.get('/:name', (c) => {
    const name = c.req.param('name');
    const cityInfo = CITY_COORDS[name];

    if (!cityInfo) {
        return c.json({ error: 'City not found' }, 404);
    }

    return c.json({
        name,
        ...cityInfo,
    });
});

export default app;

