import { createFileRoute } from '@tanstack/react-router'
import ProxyRouteManagement from '@/features/proxy-routes'

export const Route = createFileRoute('/_authenticated/proxy-routes/')({
  component: ProxyRouteManagement,
})