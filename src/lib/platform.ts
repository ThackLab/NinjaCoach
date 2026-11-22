// Small platform layer so the same build runs in browsers and inside the
// Android app, whose WebView can't download blobs and exposes a native bridge.

interface AndroidBridge {
  /** Writes a file to the device's Downloads folder; returns where it went ('' on failure). */
  saveFile(name: string, mime: string, content: string): string;
  copyText(text: string): void;
  /** Vibrates in a pattern of on/off milliseconds, comma-separated (app version 1.1 and later). */
  vibrate?(pattern: string): void;
  /** Keeps the screen on, or lets it sleep (app version 1.3 and later). */
  keepScreenOn?(on: boolean): void;
  /** Writes a file in Downloads/Ninja Coach, replacing it if it is there; returns where ('' on failure). App 1.6 and later. */
  writeFile?(name: string, mime: string, content: string): string;
  /** Starts/stops the service that keeps reviews going with the screen off, or updates its notification. App 1.7 and later. */
  backgroundWork?(on: boolean, text: string): void;
  batteryExempt?(): boolean;
  askBatteryExempt?(): void;
}

const bridge = (globalThis as { NinjaCoachAndroid?: AndroidBridge }).NinjaCoachAndroid;

export const isAndroidApp = !!bridge;

/** Whether this device can vibrate: the Android app, or a browser with the Vibration API (not iOS). */
export const canVibrate = typeof bridge?.vibrate === 'function' || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');

export function vibrate(pattern: number[]) {
  try {
    if (typeof bridge?.vibrate === 'function') bridge.vibrate(pattern.join(','));
    else navigator.vibrate?.(pattern);
  } catch {
    // Some browsers refuse without a recent tap; that's fine.
  }
}

let lock: { release(): Promise<void> } | null = null;

/** Keeps the screen from sleeping (the Android app, or a browser with the Wake Lock API), or lets it sleep again. */
export function keepScreenOn(on: boolean) {
  try {
    if (typeof bridge?.keepScreenOn === 'function') return bridge.keepScreenOn(on);
    const wl = (navigator as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (on && !lock && wl && document.visibilityState === 'visible')
      void wl
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    if (!on && lock) {
      void lock.release().catch(() => undefined);
      lock = null;
    }
  } catch {
    // Not available here: the screen just sleeps as usual.
  }
}

export const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** An iPhone or iPad (iPadOS says it's a Mac, but Macs have no touch screen). */
export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/** An Android phone's browser, rather than the Android app. */
export const isAndroidBrowser = !isAndroidApp && typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

/** Opened from a home-screen icon (or the Android app) rather than a browser tab. */
export const isInstalled = () =>
  isAndroidApp || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Saves text as a file. Returns a short description of where it was saved, if known. */
export function saveTextFile(name: string, mime: string, text: string): string | null {
  if (bridge) {
    const where = bridge.saveFile(name, mime, text);
    if (!where) throw new Error('Could not save the file');
    return where;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return null;
}

/** Whether reviews can carry on with the screen off (the Android app). */
export const canWorkLocked = typeof bridge?.backgroundWork === 'function';

let working = false;
let lastText = '';
/** Keeps the app working with the screen off (Android), with `text` in its notification; off when `on` is false. */
export function setBackgroundWork(on: boolean, text = '') {
  if (typeof bridge?.backgroundWork !== 'function') return;
  if (!on && !working) return;
  if (on && working && text === lastText) return;
  working = on;
  lastText = text;
  try {
    bridge.backgroundWork(on, text);
  } catch {
    // An older app: reviews pause when the screen locks, as before.
  }
}

/** Whether Android leaves the app out of battery optimisation (true where it doesn't apply). */
export function isBatteryExempt(): boolean {
  try {
    return typeof bridge?.batteryExempt === 'function' ? bridge.batteryExempt() : true;
  } catch {
    return true;
  }
}

export function askBatteryExempt() {
  bridge?.askBatteryExempt?.();
}

/** Whether this device can keep a file up to date by itself (the Android app). */
export const canKeepFiles = typeof bridge?.writeFile === 'function';

/** Rewrites a file kept on the phone (Downloads/Ninja Coach); null where that isn't possible. */
export function keepFileUpdated(name: string, mime: string, text: string): string | null {
  if (typeof bridge?.writeFile !== 'function') return null;
  return bridge.writeFile(name, mime, text) || null;
}

/**
 * Hands a file to the phone's share sheet, which offers "Save to Files",
 * iCloud Drive, Google Drive and so on; falls back to a download. Resolves to
 * where it went, or null if the person cancelled.
 */
export async function shareOrSaveFile(name: string, mime: string, text: string): Promise<'shared' | 'downloaded' | string | null> {
  if (bridge) return saveTextFile(name, mime, text);
  const file = typeof File !== 'undefined' ? new File([text], name, { type: mime }) : null;
  if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Ninja Coach backup' });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
    }
  }
  saveTextFile(name, mime, text);
  return 'downloaded';
}

export async function copyText(text: string): Promise<void> {
  if (bridge) {
    bridge.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
