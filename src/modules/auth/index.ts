/** Public API of the auth feature. */
export { AuthModule } from './auth.module.js';
export { AuthService, type AuthResult, type TokenPair } from './application/auth.service.js';
export * from './domain/auth.errors.js';
