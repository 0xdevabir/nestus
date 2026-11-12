import type { AuthApiKey, AuthUser, RequestContext } from './request-context';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiKey?: AuthApiKey;
      ctx?: RequestContext;
    }
  }
}

export {};
