import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequestsService } from './requests.service';
import { CreateRequestDto, createRequestSchema } from './dto/create-request.dto';
import { ListRequestsDto, listRequestsSchema } from './dto/list-requests.dto';

@UseGuards(AuthGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createRequestSchema)) dto: CreateRequestDto,
    @Req() request: Request,
  ) {
    return this.requests.create(user.id, dto, request);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listRequestsSchema)) query: ListRequestsDto,
  ) {
    return this.requests.list(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.requests.findOne(user.id, id);
  }

  @Get(':id/files/:fileId/url')
  download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() request: Request,
  ) {
    return this.requests.issueDownloadUrl(user.id, id, fileId, request);
  }
}
