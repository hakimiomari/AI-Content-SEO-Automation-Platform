import { NotificationType } from '@acsp/database';
import { prisma } from './prisma';
import { logger } from './logger';

export interface NotifyInput {
  companyId: string;
  userId?: string | null;
  type?: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}

/** Creates an in-app Notification. Failures are logged, never thrown (notifications are best-effort). */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        type: input.type ?? NotificationType.INFO,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 5_000),
        link: input.link ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, companyId: input.companyId }, 'Failed to create notification');
  }
}
