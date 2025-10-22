import { createFileRoute } from '@tanstack/react-router'
import PathManagement from '@/features/paths'

export const Route = createFileRoute('/_authenticated/paths/')({
  component: PathManagement,
})