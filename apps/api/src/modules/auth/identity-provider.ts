import * as oidc from 'openid-client';

export interface AuthorizationChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface AuthorizationRequest extends AuthorizationChecks {
  url: URL;
}

export interface VerifiedIdentity {
  /** Stable account identifier from the provider (the `sub` claim). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  pictureUrl: string | null;
}

export class IdentityProviderError extends Error {
  constructor(
    readonly reason: 'unavailable' | 'rejected',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'IdentityProviderError';
  }
}

/** Seam between the sign-in routes and the external provider, so tests never call Google. */
export interface IdentityProvider {
  createAuthorizationRequest: (redirectUri: string) => Promise<AuthorizationRequest>;
  completeAuthorization: (
    callbackUrl: URL,
    checks: AuthorizationChecks,
  ) => Promise<VerifiedIdentity>;
}

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

function readString(claims: Record<string, unknown>, key: string): string | null {
  const value = claims[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function createGoogleIdentityProvider(
  clientId: string,
  clientSecret: string,
): IdentityProvider {
  let configuration: Promise<oidc.Configuration> | null = null;

  const discover = () => {
    configuration ??= oidc
      .discovery(GOOGLE_ISSUER, clientId, clientSecret)
      .catch((error: unknown) => {
        configuration = null;
        throw new IdentityProviderError('unavailable', 'Google discovery failed', { cause: error });
      });
    return configuration;
  };

  return {
    async createAuthorizationRequest(redirectUri) {
      const config = await discover();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const codeVerifier = oidc.randomPKCECodeVerifier();

      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        prompt: 'select_account',
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      });

      return { url, state, nonce, codeVerifier };
    },

    async completeAuthorization(callbackUrl, checks) {
      const config = await discover();

      let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
      try {
        tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
          pkceCodeVerifier: checks.codeVerifier,
          expectedState: checks.state,
          expectedNonce: checks.nonce,
          idTokenExpected: true,
        });
      } catch (error) {
        throw new IdentityProviderError('rejected', 'Google did not confirm the sign-in', {
          cause: error,
        });
      }

      const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
      const subject = readString(claims, 'sub');
      const email = readString(claims, 'email');
      if (!subject || !email) {
        throw new IdentityProviderError('rejected', 'Google returned an incomplete profile');
      }

      return {
        subject,
        email: email.toLowerCase(),
        emailVerified: claims.email_verified === true,
        name: readString(claims, 'name') ?? email.split('@')[0] ?? email,
        pictureUrl: readString(claims, 'picture'),
      };
    },
  };
}
