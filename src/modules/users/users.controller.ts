import { Body, Controller, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { SetActiveSchema } from './dto/set-active.dto';
import type { SetActiveDto } from './dto/set-active.dto';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  // ADMIN activates / deactivates any account
  @Patch(':id/active')
  @Roles(Role.ADMIN)
  setActive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetActiveSchema)) dto: SetActiveDto,
  ) {
    return this.users.setActive(id, dto.isActive);
  }
}
