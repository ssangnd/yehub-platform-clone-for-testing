import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../../../generated/prisma/client';

export const ROLES_KEY = 'projectRoles';
export const ProjectRoles = (...roles: ProjectRole[]) =>
  SetMetadata(ROLES_KEY, roles);

// Keep backward-compatible alias
export const Roles = ProjectRoles;
