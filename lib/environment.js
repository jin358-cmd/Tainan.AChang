'use strict';

const TEST_PROJECT_REF = 'fhxdpupascsikjsycpbi';

function readEnvironment(source = process.env) {
  const environment = String(source.ACHANG_ENVIRONMENT || '').trim().toLowerCase();
  const expectedProjectRef = String(source.EXPECTED_SUPABASE_PROJECT_REF || '').trim();
  const supabaseUrl = String(source.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publishableKey = String(source.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const vercelEnvironment = String(source.VERCEL_ENV || '').trim().toLowerCase();
  const errors = [];
  let actualProjectRef = '';

  if (environment !== 'test') errors.push('TEST_ENVIRONMENT_REQUIRED');
  if (source.ACHANG_TEST_ISOLATED !== '1') errors.push('TEST_ISOLATION_FLAG_MISSING');
  if (vercelEnvironment === 'production') errors.push('TEST_MUST_NOT_USE_VERCEL_PRODUCTION');
  if (expectedProjectRef !== TEST_PROJECT_REF) errors.push('TEST_PROJECT_REF_REQUIRED');
  if (!publishableKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) errors.push('PUBLISHABLE_KEY_INVALID');

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname)) {
      errors.push('SUPABASE_URL_INVALID');
    } else {
      actualProjectRef = parsed.hostname.split('.')[0];
    }
  } catch {
    errors.push('SUPABASE_URL_INVALID');
  }
  if (actualProjectRef !== TEST_PROJECT_REF || actualProjectRef !== expectedProjectRef) errors.push('TEST_PROJECT_MISMATCH');

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    environment,
    projectRef: actualProjectRef,
    supabaseUrl,
    publishableKey
  });
}

module.exports = {TEST_PROJECT_REF, readEnvironment};
