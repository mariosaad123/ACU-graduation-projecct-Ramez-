/**
 * Serves the built web app and passes /api requests to the API server, so the browser sees one
 * origin: the session cookie stays first-party and no CORS is needed. Static files and client-side
 * routes never reach this code; Cloudflare answers them from the assets.
 */
interface Env {
  /** The API server, e.g. https://acu-languages-api.onrender.com. */
  API_ORIGIN: string;
}

/** Headers about the hop to Cloudflare that must not be passed on as if the browser sent them. */
const DROPPED = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-real-ip'];

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, env.API_ORIGIN);

    const headers = new Headers(request.headers);
    for (const name of DROPPED) {
      headers.delete(name);
    }
    headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-forwarded-host', url.host);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    try {
      // Redirects, such as the one back from Google, go to the browser untouched.
      return await fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : null,
        redirect: 'manual',
      });
    } catch {
      // The free API host sleeps when idle; the app shows its "server unavailable" state.
      return Response.json(
        { error: { code: 'NETWORK_ERROR', message: 'The API is unavailable' } },
        { status: 502, headers: { 'cache-control': 'no-store' } },
      );
    }
  },
};

export default worker;
