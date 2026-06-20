/**
 * Copy text to clipboard on all browsers including iOS Safari.
 *
 * iOS Safari rejects navigator.clipboard.writeText() when called after an
 * await (the user-gesture context is consumed). We fall back to the native
 * Web Share API (available iOS 12.1+) which has no such restriction, and
 * finally to the legacy execCommand approach for older browsers.
 */
export async function safeCopy(text: string): Promise<void> {
  // 1. Standard Clipboard API (works on desktop and Chrome on iOS)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to share / execCommand
    }
  }
  // 2. Web Share API — works on iOS Safari even from async callbacks
  if (navigator.share) {
    try {
      await navigator.share({ url: text, title: '' });
      return;
    } catch {
      // user dismissed share sheet — not a real error
      return;
    }
  }
  // 3. Legacy execCommand fallback
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(el);
}

export const getBirthdayStatus = (dob: string): 'TODAY' | 'TOMORROW' | 'NONE' => {
    if (!dob) return 'NONE';

    // Get today's date, ignoring the time component for accurate comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const birthDate = new Date(dob);
    
    const isBirthdayToday = today.getMonth() === birthDate.getMonth() && today.getDate() === birthDate.getDate();
    if (isBirthdayToday) return 'TODAY';

    const isBirthdayTomorrow = tomorrow.getMonth() === birthDate.getMonth() && tomorrow.getDate() === birthDate.getDate();
    if (isBirthdayTomorrow) return 'TOMORROW';

    return 'NONE';
};
