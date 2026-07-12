import { Body, Controller, Param, Patch } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { SetActiveSchema } from './dto/set-active.dto';
import type { SetActiveDto } from './dto/set-active.dto';

@ApiTags('Users (Admin)')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Patch(':id/active')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Activate or deactivate an account',
    description:
      "Admin only. Sets a user active/inactive. Deactivation takes effect on the user's next request (instant lockout via live JWT check).",
  })
  @ApiParam({
    name: 'id',
    description: 'User id (UUID) to activate/deactivate',
  })
  @ZodApiBody(SetActiveSchema)
  @ApiResponse({ status: 200, description: 'Account active state updated' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  @ApiResponse({ status: 404, description: 'User not found' })
  setActive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetActiveSchema)) dto: SetActiveDto,
  ) {
    return this.users.setActive(id, dto.isActive);
  }
}
