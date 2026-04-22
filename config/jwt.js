const FALLBACK_JWT_SECRET = 'ikenas-dev-jwt-secret-change-me';
const FALLBACK_JWT_EXPIRE = '7d';

const getJwtConfig = () => {
  const isFallback = !process.env.JWT_SECRET;

  // In production, refuse to start with the insecure fallback secret
  if (isFallback && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production. Refusing to start.');
  }

  const secret = process.env.JWT_SECRET || FALLBACK_JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRE || FALLBACK_JWT_EXPIRE;

  return {
    secret,
    expiresIn,
    isFallback,
  };
};

module.exports = {
  getJwtConfig,
};