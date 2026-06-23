import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }
  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }
  create(data: { email: string; passwordHash: string; role: Role }) {
    return this.repo.save(this.repo.create(data));
  }
}
