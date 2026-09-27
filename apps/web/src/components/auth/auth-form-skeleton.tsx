import { Skeleton } from '@/components/ui/skeleton';

/** Suspense fallback for the client auth forms (they read `useSearchParams`). */
export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-11 w-full" />
      <Skeleton className="mx-auto h-4 w-40" />
    </div>
  );
}
