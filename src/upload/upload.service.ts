import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Env } from '../config/env.validation';
import * as crypto from 'crypto';

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

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const hasExtension = file.originalname.includes('.');
    const fileExtension = hasExtension ? file.originalname.split('.').pop() : 'png';

    const uniqueKey = `profiles/${crypto.randomUUID()}.${fileExtension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: uniqueKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.s3Client.send(command);

      return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${uniqueKey}`;
    } catch (error) {
      throw new InternalServerErrorException('Failed to upload profile image to cloud storage', {
        cause: error,
      });
    }
  }
}
