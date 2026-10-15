/**
 * Type contract between the renderer and the preload bridge.
 *
 * This module contains **types only**, so the renderer can import it without pulling any runtime
 * code (and therefore without gaining any capability).
 */

/** How the window was loaded. The two paths differ only in this. */
export type LoadPath = 'development' | 'production';

/** Runtime facts the main process is willing to disclose to the renderer. */
export type RuntimeInfo = {
  readonly appName: string;
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly chromeVersion: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly loadPath: LoadPath;
};

/** Payload accepted by the validated echo. */
export type PingRequest = {
  readonly message: string;
};

/** Result of the validated echo: a success value or a typed refusal, never a thrown transport error. */
export type PingResponse =
  | {
      readonly ok: true;
      readonly echo: string;
      readonly handledAt: string;
      readonly origin: string;
    }
  | {
      readonly ok: false;
      readonly code: 'invalid-payload';
      readonly message: string;
    };

/** The complete surface the preload exposes as `window.auralide`. */
export type AuralideApi = {
  readonly bridgeVersion: string;
  readonly getRuntimeInfo: () => Promise<RuntimeInfo>;
  readonly ping: (request: PingRequest) => Promise<PingResponse>;
};

declare global {
  interface Window {
    /**
     * Declared optional on purpose: the renderer must be able to run without the bridge (a
     * misconfigured preload path or a plain browser load), and it must notice that instead of
     * crashing. The security tests assert that nothing else is exposed either way.
     */
    readonly auralide?: AuralideApi;
  }
}
