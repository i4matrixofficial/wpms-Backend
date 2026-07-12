import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum PricingModel {
  FLAT = 'flat', // fixed price, ignore quantity
  PER_UNIT = 'per_unit', // quantity × baseRate
}

export enum MeasurementUnit {
  HOUR = 'hour',
  SQUARE_METER = 'square_meter',
  ROOM = 'room',
  UNIT = 'unit',
  FLAT = 'flat', // for flat pricing
}

export enum PriceTiming {
  UPFRONT = 'upfront', // price known at booking → no confirmation
  ON_COMPLETION = 'on_completion', // worker sets at end → customer confirms
}

@Entity('service_types')
export class ServiceType extends BaseEntity {
  @Index({ unique: true })
  @Column()
  name: string; // machine key: "plumbing", "ac_repair"

  @Column()
  displayName: string; // shown to users: "Plumbing"

  @Column({ type: 'enum', enum: PricingModel })
  pricingModel: PricingModel;

  @Column({ type: 'enum', enum: MeasurementUnit })
  unit: MeasurementUnit;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  baseRate: number; // per-unit rate, or the flat amount

  @Column({ type: 'enum', enum: PriceTiming })
  priceTiming: PriceTiming;

  @Column({ default: true })
  isActive: boolean; // admin can disable without deleting
}
