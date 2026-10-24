'use strict';

const PROJECTS = Object.freeze({
  test: 'fhxdpupascsikjsycpbi',
  production: 'ctskglmglevronvnkpmm'
});

function readEnvironment(source = process.env) {
  const environment = String(source.ACHANG_ENVIRONMENT || '').trim().toLowerCase();
  const expectedProjectRef = String(source.EXPECTED_SUPABASE_PROJECT_REF || '').trim();
  const supabaseUrl = String(source.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publishableKey = String(source.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const vercelEnvironment = String(source.VERCEL_ENV || '').trim().toLowerCase();
  const errors = [];
  let actualProjectRef = '';

  if (!Object.hasOwn(PROJECTS, environment)) errors.push('ACHANG_ENVIRONMENT_INVALID');
  if (!expectedProjectRef) errors.push('EXPECTED_PROJECT_REF_MISSING');
  if (!supabaseUrl) errors.push('SUPABASE_URL_MISSING');
  if (!publishableKey) errors.push('SUPABASE_PUBLISHABLE_KEY_MISSING');

  if (supabaseUrl) {
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
  }

  if (expectedProjectRef && actualProjectRef && expectedProjectRef !== actualProjectRef) errors.push('PROJECT_REF_URL_MISMATCH');
  if (environment && Object.hasOwn(PROJECTS, environment) && expectedProjectRef !== PROJECTS[environment]) errors.push('PROJECT_REF_ENVIRONMENT_MISMATCH');
  if (environment === 'test' && source.ACHANG_TEST_ISOLATED !== '1') errors.push('TEST_ISOLATION_FLAG_MISSING');
  if (environment === 'test' && vercelEnvironment === 'production') errors.push('TEST_MUST_NOT_USE_VERCEL_PRODUCTION');

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    environment,
    expectedProjectRef,
    actualProjectRef,
    supabaseUrl,
    publishableKey,
    vercelEnvironment
  });
}

module.exports = {PROJECTS, readEnvironment};
