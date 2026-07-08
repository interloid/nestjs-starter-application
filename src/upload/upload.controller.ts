import { Controller, BadRequestException, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { UploadService } from './upload.service';
import { seconds, Throttle } from '@nestjs/throttler';

@ApiTags('Upload')
@Public()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: seconds(60) } }) // 3 uploads per minute max for anonymous users
  @Get('presigned-url')
  @ApiOperation({ summary: 'Get a temporary secure S3 URL for direct file upload' })
  getPresignedUrl(@Query('fileName') fileName: string, @Query('fileType') fileType: string) {
    if (!fileName || !fileType) {
      throw new BadRequestException('fileName and fileType are required');
    }

    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(fileType)) {
      throw new BadRequestException('Invalid file type');
    }

    return this.uploadService.createPresignedUrl(fileName, fileType);
  }
}
