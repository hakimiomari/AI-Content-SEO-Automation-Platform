import { PLAN_LIMITS, type Plan } from '@acsp/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANTS: Record<Plan, NonNullable<BadgeProps['variant']>> = {
  FREE: 'secondary',
  STARTER: 'outline',
  GROWTH: 'default',
  AGENCY: 'gradient',
};

export function PlanBadge({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <Badge variant={VARIANTS[plan]} className={className}>
      {PLAN_LIMITS[plan].name}
    </Badge>
  );
}
