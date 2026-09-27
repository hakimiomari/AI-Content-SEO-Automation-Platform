import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Jobs, publishes and team actions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Activity className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium">No activity yet</p>
          <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
            Once you add a website and run keyword research, the audit trail streams in here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
