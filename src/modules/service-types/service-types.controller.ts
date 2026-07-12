import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceTypesService } from './service-types.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CreateServiceTypeSchema } from './dto/create-service-type.dto';
import type { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeSchema } from './dto/update-service-type.dto';
import type { UpdateServiceTypeDto } from './dto/update-service-type.dto';

@ApiTags('Service Types')
@Controller('service-types')
export class ServiceTypesController {
  constructor(private service: ServiceTypesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active service types',
    description:
      'Public. The services customers can book and workers can offer.',
  })
  list() {
    return this.service.findActive();
  }

  @Get('all')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List all service types (admin)',
    description: 'Admin only. Includes inactive types.',
  })
  listAll() {
    return this.service.findAll();
  }

  @Post()
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create a service type',
    description: 'Admin only. Adds a new bookable service with its pricing.',
  })
  @ZodApiBody(CreateServiceTypeSchema)
  create(
    @Body(new ZodValidationPipe(CreateServiceTypeSchema))
    dto: CreateServiceTypeDto,
  ) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update a service type',
    description: 'Admin only. Rename, change rate, or activate/deactivate.',
  })
  @ZodApiBody(UpdateServiceTypeSchema)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServiceTypeSchema))
    dto: UpdateServiceTypeDto,
  ) {
    return this.service.update(id, dto);
  }
}
