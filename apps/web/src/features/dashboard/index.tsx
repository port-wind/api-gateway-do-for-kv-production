import { lazy, Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AlertBadge } from '@/components/alert-badge'
import { StatsCards } from './components/stats-cards'
import { TrafficChart } from './components/traffic-chart'
import { TopPaths } from './components/top-paths'

// 懒加载实时地图组件（优化首屏加载）
const RealtimeMap = lazy(() =>
  import('./components/realtime-map').then((m) => ({ default: m.RealtimeMap }))
)

export function Dashboard() {
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        {/* 顶部导航栏已移除，仪表盘只有单一视图 */}
        <div className='ms-auto flex items-center space-x-4'>
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-4 flex items-center justify-between space-y-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>API Gateway Dashboard</h1>
            <p className='text-sm text-muted-foreground'>
              实时监控流量、缓存、限流和安全数据
            </p>
          </div>
        </div>

        <div className='space-y-4'>
          {/* 告警徽章（最顶部） */}
          <AlertBadge />

          {/* 实时地图（置顶） */}
          <Card>
            <CardHeader>
              <CardTitle>全球流量实时地图</CardTitle>
              <CardDescription>
                显示 Top 20 请求来源到 Cloudflare 边缘节点的实时流量
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className='h-[500px] w-full' />}>
                <RealtimeMap />
              </Suspense>
            </CardContent>
          </Card>

          {/* 核心指标卡片 */}
          <StatsCards />

          {/* 图表区域 */}
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
            {/* 流量趋势图 */}
            <Card className='col-span-1 lg:col-span-4'>
              <CardHeader>
                <CardTitle>流量趋势</CardTitle>
                <CardDescription>最近 7 天的请求量和缓存命中趋势</CardDescription>
              </CardHeader>
              <CardContent className='pt-2'>
                <TrafficChart />
              </CardContent>
            </Card>

            {/* Top Paths */}
            <Card className='col-span-1 lg:col-span-3'>
              <CardHeader>
                <CardTitle>热门路径</CardTitle>
                <CardDescription>请求量最高的 API 路径</CardDescription>
              </CardHeader>
              <CardContent>
                <TopPaths />
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}

// 仪表盘顶部导航已移除（单一视图无需切换）
