'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@acsp/shared';
import { ApiClientError } from '@/lib/api-client';
import { getMe, logout } from '@/lib/auth';

export const userKeys = {
  me: ['me'] as const,
};

/** The signed-in user (`GET /auth/me`). Errors with status 401 when there is no session. */
export function useUser() {
  return useQuery<AuthUser, ApiClientError>({
    queryKey: userKeys.me,
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<void, ApiClientError>({
    mutationFn: logout,
    onSettled: () => {
      // Whether or not the API call succeeded, drop all cached tenant data.
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });
}
