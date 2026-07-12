import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkerDocumentsService } from './worker-documents.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UploadDocumentSchema } from './dto/upload-document.dto';
import { ReviewDocumentSchema } from './dto/review-document.dto';
import type { ReviewDocumentDto } from './dto/review-document.dto';
import {
  DocumentType,
  VerificationStatus,
} from './entities/worker-document.entity';

@Controller('workers/documents')
export class WorkerDocumentsController {
  constructor(private readonly docs: WorkerDocumentsService) {}

  // WORKER uploads a document
  @Post()
  @Roles(Role.WORKER)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
  ) {
    const result = UploadDocumentSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    const dto = result.data;
    return this.docs.upload(
      user.userId,
      dto.type as DocumentType,
      file,
      dto.issuedAt,
    );
  }

  @Get('mine')
  @Roles(Role.WORKER)
  mine(@CurrentUser() user: { userId: string }) {
    return this.docs.myDocuments(user.userId);
  }

  // ADMIN lists pending docs (each with a view URL)
  @Get('pending')
  @Roles(Role.ADMIN)
  listPending() {
    return this.docs.listPending();
  }

  @Get(':workerId/:type/history')
  @Roles(Role.ADMIN)
  history(@Param('workerId') workerId: string, @Param('type') type: string) {
    return this.docs.getHistory(workerId, type as DocumentType);
  }

  // ADMIN approves / rejects
  @Patch(':id/review')
  @Roles(Role.ADMIN)
  review(
    @CurrentUser() admin: { userId: string },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReviewDocumentSchema)) dto: ReviewDocumentDto,
  ) {
    return this.docs.review(
      id,
      admin.userId,
      dto.status as VerificationStatus.APPROVED | VerificationStatus.REJECTED,
      dto.rejectionReason,
    );
  }
}
