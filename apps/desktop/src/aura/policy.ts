import { z } from 'zod';
export const auraBoundsSchema = z.strictObject({ x: z.int().min(0).max(100000), y: z.int().min(0).max(100000), width: z.int().min(0).max(100000), height: z.int().min(0).max(100000), visible: z.boolean() });
export type AuraBounds = z.infer<typeof auraBoundsSchema>;
export const clipBounds = (bounds: AuraBounds, width: number, height: number): AuraBounds => {
  const x = Math.min(bounds.x, width);
  const y = Math.min(bounds.y, height);
  return { x, y, width: Math.min(bounds.width, width - x), height: Math.min(bounds.height, height - y), visible: bounds.visible };
};
