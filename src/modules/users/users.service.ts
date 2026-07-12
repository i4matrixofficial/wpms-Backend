import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }
  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }
  create(data: {
    fullName: string;
    email: string;
    passwordHash: string;
    role: Role;
  }) {
    return this.repo.save(this.repo.create(data));
  }
  async setActive(userId: string, isActive: boolean) {
    const user = await this.repo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = isActive;
    await this.repo.save(user);
    return { id: user.id, isActive: user.isActive };
  }
}
