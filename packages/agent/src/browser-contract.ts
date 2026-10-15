import { elementIdSchema, revisionSchema, slideIdSchema } from '@auralide/core';
import { z } from 'zod';

const tabId = z.string().regex(/^aura-[1-9][0-9]*$/);
const tabRevision = { tabId, expectedRevision: revisionSchema };
export const auraRequestSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('preview.render'), input: z.strictObject({ slideId: slideIdSchema, expectedRevision: revisionSchema }) }),
  z.strictObject({ tool: z.literal('browser.open'), input: z.strictObject({ fixture: z.literal('layout-basics') }) }),
  z.strictObject({ tool: z.literal('browser.listTabs'), input: z.strictObject({}) }),
  z.strictObject({ tool: z.literal('browser.close'), input: z.strictObject({ tabId }) }),
  z.strictObject({ tool: z.literal('browser.activate'), input: z.strictObject({ tabId }) }),
  z.strictObject({ tool: z.literal('preview.inspectElement'), input: z.strictObject({ ...tabRevision, elementId: elementIdSchema }) }),
  z.strictObject({ tool: z.literal('preview.getDiagnostics'), input: z.strictObject(tabRevision) }),
  z.strictObject({ tool: z.literal('preview.screenshot'), input: z.strictObject(tabRevision) }),
]);
export type AuraRequest = z.input<typeof auraRequestSchema>;
export interface AuraTab { readonly id: string; readonly mode: 'slide-preview' | 'html-lab'; readonly revision: number; readonly slideId: string | null }
export interface AuraElement { readonly id: string; readonly tag: string; readonly text: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface AuraDiagnostics { readonly tabId: string; readonly revision: number; readonly mode: AuraTab['mode']; readonly elementCount: number; readonly scriptCount: number; readonly title: string; readonly currentRevision: number; readonly stale: boolean; readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }; readonly minimized: boolean; readonly visible: boolean }
export interface AuraScreenshot { readonly tabId: string; readonly revision: number; readonly mimeType: 'image/png'; readonly base64: string }
export type AuraData = AuraTab | readonly AuraTab[] | AuraElement | AuraDiagnostics | AuraScreenshot | null;
export type AuraErrorCode = 'invalid-input' | 'revision-conflict' | 'not-found' | 'permission-denied' | 'runtime-error';
export type AuraResult = { readonly ok: true; readonly value: AuraData } | { readonly ok: false; readonly error: { readonly code: AuraErrorCode; readonly message: string } };
export interface AuraAuditEntry { readonly tool: string; readonly actor: 'human/desktop'; readonly timestamp: string; readonly revision: number; readonly outcome: 'ok' | AuraErrorCode }

