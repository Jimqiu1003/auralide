import { z } from 'zod';
import { elementIdSchema, slideIdSchema, revisionSchema } from '@auralide/core';
import type { Presentation, Result } from '@auralide/core';
import type { FileError } from './document-files.js';
import type { SourceScan } from '@auralide/html-bridge';

export const sourceRequestSchema = z.strictObject({
  expectedRevision: revisionSchema,
  slideId: slideIdSchema,
  elementId: elementIdSchema,
  expectedSourceRevision: revisionSchema,
});
export type SourceRequest = z.infer<typeof sourceRequestSchema>;
const literalColor = z.string().regex(/^(#[a-f0-9]{3,8}|[a-z]{1,20})$/i);
export const sourceStylesSchema = z
  .strictObject({
    fontFamily: z
      .string()
      .regex(/^[\p{L}\p{N} _-]{1,100}$/u)
      .optional(),
    fontSize: z.number().min(1).max(100000).optional(),
    color: literalColor.optional(),
    backgroundColor: literalColor.optional(),
    borderColor: literalColor.optional(),
    borderWidth: z.number().min(0).max(100).optional(),
    borderStyle: z.enum(['none', 'solid', 'dashed', 'dotted', 'double']).optional(),
    opacity: z.number().min(0).max(1).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    width: z.number().min(1).max(100000).optional(),
    height: z.number().min(1).max(100000).optional(),
    offsetX: z.number().min(-1000000).max(1000000).optional(),
    offsetY: z.number().min(-1000000).max(1000000).optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).length > 0 && Object.values(value).every((item) => item !== undefined),
  );
export type SourceStyles = z.infer<typeof sourceStylesSchema>;
export const nodeIdSchema = z
  .string()
  .max(64)
  .regex(/^node-[0-9]+$/);
export const sourceChangeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'),
    nodeId: nodeIdSchema,
    text: z
      .string()
      .max(50000)
      .refine(
        (text) => !/auralide-(?:asset|style|event):[a-f0-9]{64}/.test(text),
        '文字包含保留的资源标记。',
      ),
  }),
  z.strictObject({ type: z.literal('style'), nodeId: nodeIdSchema, styles: sourceStylesSchema }),
  z.strictObject({ type: z.literal('source'), html: z.string().max(100 * 1024 * 1024) }),
]);
export type SourceChange = z.infer<typeof sourceChangeSchema>;
export interface SourceSnapshot {
  readonly document: Presentation;
  readonly sourceRevision: number;
  readonly assetId: string;
  readonly html: string;
  readonly nodes: SourceScan['nodes'];
  readonly width: number;
  readonly height: number;
}
export interface SourceSelection {
  readonly nodeId: string;
  readonly tag: string;
  readonly text: string;
  readonly editableText: boolean;
  readonly styles: Required<SourceStyles>;
  readonly baseTranslate: string;
}
export interface SourceViewStatus {
  readonly selection: SourceSelection | null;
  readonly move: { nodeId: string; offsetX: number; offsetY: number; sequence: number } | null;
  readonly escape: boolean;
  readonly focus: boolean;
}
export type SourceResult<T> = Result<T, FileError>;
