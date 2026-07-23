import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

// Gates on role POSSESSION (user.roles), not active mode or verification.
// Use for onboarding endpoints a user must reach before they're allowed to
// switch into that mode (e.g. uploading worker verification documents).
export const IdentityRoles = (...roles: Role[]) =>
  SetMetadata('identityRoles', roles);
