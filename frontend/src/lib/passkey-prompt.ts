const key = (userId: number) => `passkey_setup_declined:${userId}`;

/**
 * An optional passkey can be refused for good ("don't offer it again"), unlike "later" which
 * only hides the prompt for this session. Kept per person on this browser; a storage that
 * cannot be read just means the prompt comes back.
 */
export function isPasskeyPromptDeclined(userId: number | null): boolean {
    if (userId === null) return false;
    try {
        return localStorage.getItem(key(userId)) === 'true';
    } catch {
        return false;
    }
}

export function declinePasskeyPrompt(userId: number | null): void {
    if (userId === null) return;
    try {
        localStorage.setItem(key(userId), 'true');
    } catch {
        // Nothing to do: the prompt simply keeps coming back.
    }
}
