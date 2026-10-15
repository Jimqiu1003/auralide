import { PREVIEW_CSP } from '@auralide/renderer';

/** Reviewed local layout fixture; arbitrary HTML loading is outside this POC. */
export const LAB_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><title>Aura HTML Lab</title><style>body{margin:0;font:16px Arial,sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:32px}</style></head><body><main><section data-element-id="el_lab-heading"><h1>HTML Lab</h1><p>Reviewed inert layout fixture.</p></section><section data-element-id="el_lab-shape"><svg width="160" height="120" viewBox="0 0 160 120"><circle cx="80" cy="60" r="48" fill="#5468ff"/></svg></section></main></body></html>`;
