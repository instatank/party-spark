// Thin client-side wrapper around the /api/ai proxy endpoint.
//
// Every AI-backed feature in the app goes through this helper rather than
// calling the Anthropic or Gemini SDKs directly in the browser. The keys
// live on the server and never ship in the client bundle.
//
// Usage:
//   const cards = await callAI<string[]>('custom_mlt', { groupType, ... });

interface ApiSuccess<T> { ok: true; data: T }
interface ApiFailure { ok: false; error: string }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Send a typed AI request to /api/ai.
 * Returns the data payload on success, or null if the request failed.
 * Failures are logged to the console with the given label for easy grepping.
 */
export const callAI = async <T>(
    type: string,
    params: Record<string, unknown> = {}
): Promise<T | null> => {
    try {
        const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...params }),
        });

        if (!res.ok) {
            console.error(`[ai/${type}] HTTP ${res.status} ${res.statusText}`);
            // Try to read the error body for diagnostics, but don't throw.
            try {
                const body = await res.json() as ApiResponse<T>;
                if (!body.ok) console.error(`[ai/${type}] server error:`, body.error);
            } catch { /* response wasn't JSON */ }
            return null;
        }

        const body = await res.json() as ApiResponse<T>;
        if (!body.ok) {
            console.error(`[ai/${type}] server error:`, body.error);
            return null;
        }
        return body.data;
    } catch (err) {
        // Network failure, JSON parse, etc.
        console.error(`[ai/${type}] fetch failed:`, err);
        return null;
    }
};
