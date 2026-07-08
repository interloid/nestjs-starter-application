import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Env } from '../config/env.validation';
import * as crypto from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucketName = this.config.get('AWS_S3_BUCKET_NAME', { infer: true });
    this.region = this.config.get('AWS_REGION', { infer: true });

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  async createPresignedUrl(fileName: string, fileType: string) {
    const fileExtension = fileName.split('.');
    const extension = fileExtension.length > 1 ? fileExtension.pop() : 'png';

    const uniqueKey = `profiles/${crypto.randomUUID()}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: uniqueKey,
      ContentType: fileType,
    });

    try {
      // URL expires in 300 seconds (5 minutes)
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 300 });

      return {
        uploadUrl,
        fileUrl: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${uniqueKey}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown S3 error';
      throw new InternalServerErrorException(
        `Failed to generate secure upload path: ${errorMessage}`,
      );
    }
  }
}
