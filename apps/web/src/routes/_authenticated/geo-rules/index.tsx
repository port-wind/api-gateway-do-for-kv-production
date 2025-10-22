import { createFileRoute } from '@tanstack/react-router';
import GeoRulesManagement from '@/features/geo-rules';

export const Route = createFileRoute('/_authenticated/geo-rules/')({
    component: GeoRulesManagement,
});

