import type { AppError } from '@/errors';
import { AppError as AppErrorValue } from '@/errors';
import { start } from '@/app';

export type Lazy = import('@/app').Start;
export const load = async () => import('@/app');
export const required = require('@/app');
export { start as again } from '@/app';
export * from '@/app';
export const all = [start, AppErrorValue] as const;
export type Failure = AppError;
