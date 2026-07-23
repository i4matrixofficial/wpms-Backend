import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { WorkerDocumentsService } from './worker-documents.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ZodApiBody } from '../../common/swagger/zod-api-body';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdentityRoles } from '../../common/decorators/identity-roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UploadDocumentSchema } from './dto/upload-document.dto';
import { ReviewDocumentSchema } from './dto/review-document.dto';
import type { ReviewDocumentDto } from './dto/review-document.dto';
import { ListPendingDocumentsSchema } from './dto/list-pending-documents.dto';
import type { ListPendingDocumentsDto } from './dto/list-pending-documents.dto';
import {
  DocumentType,
  VerificationStatus,
} from './entities/worker-document.entity';

@ApiTags('Worker Documents')
@ApiBearerAuth()
@Controller('workers/documents')
export class WorkerDocumentsController {
  constructor(private readonly docs: WorkerDocumentsService) {}

  @Post()
  @IdentityRoles(Role.WORKER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a verification document',
    description:
      'Worker only (by role, regardless of active mode or verification — this is how you get verified). Uploads one document (multipart/form-data). Re-uploading a type supersedes the previous attempt. Max 5MB; JPEG/PNG/PDF only.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The document file (JPEG/PNG/PDF, max 5MB)',
        },
        type: {
          type: 'string',
          enum: ['nic_front', 'nic_back', 'police_letter', 'proof_of_address'],
          description: 'Which document this is',
        },
        issuedAt: {
          type: 'string',
          example: '2026-05-01',
          description: 'Issue date (ISO), for expiry rules — optional',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded, status pending',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type/size or missing fields',
  })
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
  @IdentityRoles(Role.WORKER)
  @ApiOperation({
    summary: 'List my documents',
    description:
      "Worker only (by role, regardless of active mode or verification). Returns the worker's current documents (latest per type) with status, rejection reason, and a short-lived viewUrl to preview each file.",
  })
  @ApiResponse({
    status: 200,
    description: "Array of the worker's current documents",
  })
  mine(@CurrentUser() user: { userId: string }) {
    return this.docs.myDocuments(user.userId);
  }

  @Get('pending')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List documents pending review',
    description:
      'Admin only. Returns current documents awaiting review, each with a short-lived presigned viewUrl. Optionally scope to one worker with ?workerId= (resolve via GET /workers/by-user/:userId if you only have a userId).',
  })
  @ApiQuery({
    name: 'workerId',
    required: false,
    description: 'Scope the queue down to one worker',
  })
  @ApiResponse({ status: 200, description: 'Array of pending documents' })
  listPending(
    @Query(new ZodValidationPipe(ListPendingDocumentsSchema))
    query: ListPendingDocumentsDto,
  ) {
    return this.docs.listPending(query.workerId);
  }

  @Get(':workerId/:type/history')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Document attempt history',
    description:
      'Admin only. Returns all attempts (rejected + current) for one worker and document type, newest first — context for repeated rejections.',
  })
  @ApiParam({ name: 'workerId', description: 'Worker id (UUID)' })
  @ApiParam({
    name: 'type',
    description: 'Document type',
    enum: ['nic_front', 'nic_back', 'police_letter', 'proof_of_address'],
  })
  @ApiResponse({
    status: 200,
    description: 'Array of all attempts for that type',
  })
  history(@Param('workerId') workerId: string, @Param('type') type: string) {
    return this.docs.getHistory(workerId, type as DocumentType);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Approve or reject a document',
    description:
      "Admin only. Approves or rejects a document (rejection requires a reason). When a worker's full required set is approved, their status auto-flips to verified.",
  })
  @ApiParam({ name: 'id', description: 'Document id (UUID)' })
  @ZodApiBody(ReviewDocumentSchema)
  @ApiResponse({ status: 200, description: 'Document reviewed' })
  @ApiResponse({ status: 404, description: 'Document not found' })
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
