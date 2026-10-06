// services/fileSaver.ts
// ---------------------------------------------------------------------------
// Handing a generated file — a report, a bill, a picture — to the person who
// asked for it, on whatever they are holding.
//
// `<a download>` is not enough. In an app opened from the iOS home screen the
// download attribute is ignored outright: the click does nothing, no error, no
// file, and the tutor is left tapping a button that appears to be broken. That
// is the bug behind "I can't download from my phone when the app is on my home
// screen".
//
// So there are three ways out, in order of how well they work:
//   1. the share sheet, which is what a phone actually wants — and the file is
//      usually going to WhatsApp anyway;
//   2. a plain download, for desktop and Android;
//   3. opening the file, for an iOS home-screen app where neither of the above
//      lands — the system viewer has its own share and save.
// ---------------------------------------------------------------------------

/** An app launched from the iOS home screen. `navigator.standalone` is Safari's
 *  own flag and exists nowhere else, which is exactly the case we need: Android
 *  installed apps download perfectly well and must not get the fallback. */
const isIOSHomeScreenApp = (): boolean => {
  try {
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
};

/** True when the share sheet will take this file — used to label the button
 *  "Share" rather than "Download" before anything is generated. */
export const canShareFiles = (type = 'application/pdf'): boolean => {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    return navigator.canShare({ files: [new File([new Blob([])], 'f', { type })] });
  } catch { return false; }
};

/**
 * Give `blob` to the user as `filename`.
 *
 * Call it straight off the click where you can: iOS only allows the share sheet
 * while the tap is still "live", so a long render in between can cost you the
 * sheet and drop you to the fallbacks.
 */
export async function saveOrShareFile(blob: Blob, filename: string, title?: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: title ?? filename });
      return;
    }
  } catch (e) {
    // Dismissing the share sheet is a decision, not a failure — don't then
    // shove the file at them a second way.
    if ((e as Error)?.name === 'AbortError') return;
    console.warn('share failed, falling back to download:', e);
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // On iOS that click did nothing at all. Show the file instead.
    if (isIOSHomeScreenApp()) window.open(url, '_blank');
  } finally {
    // Long enough for the download or the new tab to have taken the data.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
