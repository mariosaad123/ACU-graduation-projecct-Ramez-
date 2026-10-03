import { ApiError } from './api';

/** The name the server gave the file, from Content-Disposition (RFC 5987 first, then plain). */
function fileNameOf(header: string | null, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '')?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // A broken header is not worth failing the download for.
    }
  }
  return /filename="([^"]+)"/i.exec(header ?? '')?.[1] ?? fallback;
}

/**
 * Downloads a file the API builds on request, such as an Excel export: fetched with the session,
 * then handed to the browser as a download under the name the server chose.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'The download failed',
    );
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileNameOf(response.headers.get('Content-Disposition'), fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has taken the file by the next task; the address can go.
  window.setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 1000);
}
