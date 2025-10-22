import { createFileRoute } from '@tanstack/react-router'
import IpMonitor from '@/features/ip-monitor'

export const Route = createFileRoute('/_authenticated/ip-monitor/')({
  component: IpMonitor,
})

