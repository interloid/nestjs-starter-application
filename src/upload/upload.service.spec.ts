import { Test, TestingModule } from '@nestjs/testing';
import { UploadService } from './upload.service';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('crypto', () => ({
  ...(jest.requireActual('crypto') as unknown as typeof crypto),
  randomUUID: jest.fn(),
}));

describe('UploadService', () => {
  let service: UploadService;
  let configService: ConfigService;

  const mockBucketName = 'test-bucket';
  const mockRegion = 'ap-south-1';
  const mockUUID = '123e4567-e89b-12d3-a456-426614174000';

  const mockConfigStore: Record<string, string> = {
    AWS_S3_BUCKET_NAME: mockBucketName,
    AWS_REGION: mockRegion,
    AWS_ACCESS_KEY_ID: 'mock-access-key',
    AWS_SECRET_ACCESS_KEY: 'mock-secret-key',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfigStore[key]),
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    configService = module.get<ConfigService>(ConfigService);

    (crypto.randomUUID as jest.Mock).mockReturnValue(mockUUID);
  });

  it('should be successfully defined with its configurations mapped during bootstrapping', () => {
    const infoSpy = jest.spyOn(configService, 'get');

    expect(service).toBeDefined();
    expect(infoSpy).toHaveBeenCalledWith('AWS_S3_BUCKET_NAME', { infer: true });
    expect(infoSpy).toHaveBeenCalledWith('AWS_REGION', { infer: true });
  });

  describe('createPresignedUrl', () => {
    const mockFileName = 'avatar.jpeg';
    const mockFileType = 'image/jpeg';
    const mockPresignedUrl = 'https://test-bucket.s3.ap-south-1.amazonaws.com/signed-path-string';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should successfully build a secure presigned upload payload structure', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(mockPresignedUrl);

      const result = await service.createPresignedUrl(mockFileName, mockFileType);

      const expectedKey = `profiles/${mockUUID}.jpeg`;
      const expectedFileUrl = `https://${mockBucketName}.s3.${mockRegion}.amazonaws.com/${expectedKey}`;

      expect(result).toEqual({
        uploadUrl: mockPresignedUrl,
        fileUrl: expectedFileUrl,
      });

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: mockBucketName,
        Key: expectedKey,
        ContentType: mockFileType,
      });
    });

    it('should fallback to a default png extension formatting if file extension cannot be determined', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(mockPresignedUrl);

      const result = await service.createPresignedUrl('no-extension-file', 'image/png');

      const expectedKey = `profiles/${mockUUID}.png`;
      expect(result.fileUrl).toContain(expectedKey);
    });

    it('should gracefully bubble an InternalServerErrorException if the S3 Client command fails', async () => {
      const s3ErrorReason = 'AWS Network Timeout Exception';
      (getSignedUrl as jest.Mock).mockRejectedValue(new Error(s3ErrorReason));

      await expect(service.createPresignedUrl(mockFileName, mockFileType)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
