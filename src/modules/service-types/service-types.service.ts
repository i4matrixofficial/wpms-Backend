import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ServiceType,
  PricingModel,
  MeasurementUnit,
  PriceTiming,
} from './entities/service-type.entity';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';

@Injectable()
export class ServiceTypesService {
  constructor(
    @InjectRepository(ServiceType) private repo: Repository<ServiceType>,
  ) {}

  async create(dto: CreateServiceTypeDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException('Service type name already exists');
    }
    return this.repo.save(
      this.repo.create({
        name: dto.name,
        displayName: dto.displayName,
        pricingModel: dto.pricingModel as PricingModel,
        unit: dto.unit as MeasurementUnit,
        baseRate: dto.baseRate,
        priceTiming: dto.priceTiming as PriceTiming,
      }),
    );
  }

  async update(id: string, dto: UpdateServiceTypeDto) {
    const st = await this.repo.findOne({ where: { id } });
    if (!st) throw new NotFoundException('Service type not found');
    Object.assign(st, dto);
    return this.repo.save(st);
  }

  // public list — only active ones (what customers/workers pick from)
  findActive() {
    return this.repo.find({
      where: { isActive: true },
      order: { displayName: 'ASC' },
    });
  }

  // admin list — everything
  findAll() {
    return this.repo.find({ order: { displayName: 'ASC' } });
  }

  // used by jobs later to validate + price
  async findByIdActive(id: string) {
    const st = await this.repo.findOne({ where: { id, isActive: true } });
    if (!st) throw new NotFoundException('Service type not found or inactive');
    return st;
  }
}
