/* Local drafts of unsaved editor work, keyed by user and prompt. They are
   cleared on sign-out and on account deletion so nothing lingers on a shared
   machine. */

export const DRAFT_PREFIX = "41p:draft:";

export function draftKey(userId: string, promptId: string) {
  return `${DRAFT_PREFIX}${userId}:${promptId}`;
}

export function clearLocalDrafts() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("41p:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}
