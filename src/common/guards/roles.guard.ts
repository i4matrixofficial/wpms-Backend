import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { WorkersService } from '../../modules/workers/workers.service';
import { WorkerStatus } from '../../modules/workers/entities/worker.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private workers: WorkersService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    const identityRequired = this.reflector.getAllAndOverride<Role[]>(
      'identityRoles',
      [context.getHandler(), context.getClass()],
    );
    if (!required && !identityRequired) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // identity-gated: checks role possession only, ignores active mode/verification
    if (identityRequired) {
      if (!identityRequired.some((r) => user.roles?.includes(r))) {
        throw new ForbiddenException(
          `Requires the ${identityRequired.join(' or ')} role`,
        );
      }
      return true;
    }

    // admin bypasses mode logic
    if (user.roles?.includes(Role.ADMIN) && required.includes(Role.ADMIN))
      return true;

    // the user must be operating IN one of the required modes
    if (!required.includes(user.activeMode)) {
      throw new ForbiddenException(
        `Switch to ${required.join(' or ')} mode to do this`,
      );
    }
    // worker mode must be verified (defense in depth — switch already checks, but re-verify)
    if (user.activeMode === Role.WORKER) {
      const status = await this.workers.getStatus(user.userId);
      if (status !== WorkerStatus.VERIFIED)
        throw new ForbiddenException('Worker not verified');
    }
    return true;
  }
}
