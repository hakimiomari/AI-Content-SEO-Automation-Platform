'use client';

import * as React from 'react';
import { MotionConfig } from 'framer-motion';

/** Honour the OS "reduce motion" preference for every framer-motion animation. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
