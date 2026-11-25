import { AuthModule } from './auth/index.js';
import { UsersModule } from './users/index.js';

/**
 * Registry of business features. Adding a feature = adding its module here
 * (`pnpm gen:feature` does it for you).
 */
export const FEATURE_MODULES = [
  UsersModule,
  AuthModule,
  // <gen:modules> — generator anchor, do not remove
];
