import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@gym-app/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException('دسترسی مجاز نیست: نقش کاربری مشخص نشده است.');
    }

    const hasRole = requiredRoles.includes(user.role) || user.role === UserRole.SUPER_ADMIN;
    if (!hasRole) {
      throw new ForbiddenException(`دسترسی غیرمجاز: این عملیات نیازمند نقش [${requiredRoles.join(', ')}] می‌باشد.`);
    }

    return true;
  }
}
