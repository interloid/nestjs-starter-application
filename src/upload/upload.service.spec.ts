import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { UploadService } from './upload.service';

let mockUuidValue = '12345678-abcd-ef01-2345-6789abcdef01';
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => mockUuidValue,
}));

const s3Mock = mockClient(S3Client);

describe('Upload Service', () => {
  let service: UploadService;
  let configService: ConfigService;

  const mockConfigValues = {
    AWS_REGION: 'ap-south-1',
    AWS_ACCESS_KEY_ID: 'mock-access-key-id',
    AWS_SECRET_ACCESS_KEY: 'mock-secret-access-key',
    AWS_S3_BUCKET_NAME: 'mock-bucket-name',
  };

  beforeEach(async () => {
    s3Mock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfigValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('uploadProfileImage', () => {
    it('should successfully upload an image and return the absolute S3 string URL path', async () => {
      const mockFile = {
        originalname: 'avatar.png',
        mimetype: 'image/png',
        buffer: Buffer.from('mock-file-binary-stream-buffer-data'),
      } as Express.Multer.File;

      mockUuidValue = '12345678-abcd-ef01-2345-6789abcdef01';
      s3Mock.on(PutObjectCommand).resolves({});

      const resultUrl = await service.uploadFile(mockFile);

      expect(s3Mock.calls()).toHaveLength(1);
      expect(s3Mock.call(0).args[0].input).toEqual({
        Bucket: 'mock-bucket-name',
        Key: `profiles/${mockUuidValue}.png`,
        Body: mockFile.buffer,
        ContentType: 'image/png',
      });

      const expectedUrl = `https://mock-bucket-name.s3.ap-south-1.amazonaws.com/profiles/${mockUuidValue}.png`;
      expect(resultUrl).toBe(expectedUrl);
    });

    it('should default the file extension fallback logic to png if originalname contains no suffix split formatting blocks', async () => {
      const mockFileNoExt = {
        originalname: 'filename-without-extension',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('binary-data'),
      } as Express.Multer.File;

      mockUuidValue = '87654321-abcd-ef01-2345-6789abcdef01';
      s3Mock.on(PutObjectCommand).resolves({});

      // Act
      const resultUrl = await service.uploadFile(mockFileNoExt);
      expect(resultUrl).toMatch(`/profiles/${mockUuidValue}.png`);
    });
  });
});
