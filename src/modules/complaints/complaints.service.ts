import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import {
  ListComplaintsQueryDto,
  SubmitComplaintDto,
  UpdateComplaintStatusDto,
} from './dto/complaint.dto';
import { Complaint } from './entities/complaint.entity';
import { ComplaintStatus } from './enums/complaint-status.enum';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @InjectRepository(Complaint)
    private readonly complaintsRepo: Repository<Complaint>,
  ) {}

  /**
   * Customer or worker submits a complaint.
   * Status starts as PENDING. Admin notification is logged until
   * NotificationsModule is wired (push/in-app later).
   */
  async submit(dto: SubmitComplaintDto): Promise<Complaint> {
    if (dto.userId === dto.againstUserId) {
      throw new BadRequestException('Cannot file a complaint against yourself');
    }

    const complaint = this.complaintsRepo.create({
      userId: dto.userId,
      againstUserId: dto.againstUserId,
      bookingId: dto.bookingId,
      description: dto.description,
      status: ComplaintStatus.PENDING,
      adminNote: null,
    });

    const saved = await this.complaintsRepo.save(complaint);

    // Placeholder for: notify all admins (NotificationsModule)
    this.logger.log(
      `New complaint ${saved.id} submitted by ${saved.userId} against ${saved.againstUserId} — admin review needed`,
    );

    return saved;
  }

  async findAll(query: ListComplaintsQueryDto): Promise<{
    items: Complaint[];
    total: number;
  }> {
    const where: FindOptionsWhere<Complaint> = {};

    if (query.userId) where.userId = query.userId;
    if (query.againstUserId) where.againstUserId = query.againstUserId;
    if (query.bookingId) where.bookingId = query.bookingId;
    if (query.status) where.status = query.status;

    const [items, total] = await this.complaintsRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return { items, total };
  }

  async findOne(id: string): Promise<Complaint> {
    const complaint = await this.complaintsRepo.findOne({ where: { id } });
    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }
    return complaint;
  }

  /**
   * Admin reviews / resolves a complaint.
   * Allowed transitions:
   *   PENDING -> UNDER_REVIEW | RESOLVED
   *   UNDER_REVIEW -> RESOLVED
   *   RESOLVED -> (terminal)
   */
  async updateStatus(
    id: string,
    dto: UpdateComplaintStatusDto,
  ): Promise<Complaint> {
    const complaint = await this.findOne(id);

    this.assertStatusTransition(complaint.status, dto.status);

    complaint.status = dto.status;
    if (dto.adminNote !== undefined) {
      complaint.adminNote = dto.adminNote;
    }

    const saved = await this.complaintsRepo.save(complaint);

    // Placeholder for: notify complainant of status change
    this.logger.log(
      `Complaint ${saved.id} status updated to ${saved.status}`,
    );

    return saved;
  }

  private assertStatusTransition(
    current: ComplaintStatus,
    next: ComplaintStatus,
  ): void {
    const allowed: Record<ComplaintStatus, ComplaintStatus[]> = {
      [ComplaintStatus.PENDING]: [
        ComplaintStatus.UNDER_REVIEW,
        ComplaintStatus.RESOLVED,
      ],
      [ComplaintStatus.UNDER_REVIEW]: [ComplaintStatus.RESOLVED],
      [ComplaintStatus.RESOLVED]: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Cannot change complaint status from ${current} to ${next}`,
      );
    }
  }
}
