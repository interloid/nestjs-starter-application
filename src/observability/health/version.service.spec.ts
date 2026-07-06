import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VersionService } from './version.service';

describe('VersionService', () => {
  let service: VersionService;
  let configService: ConfigService;

  const mockConfigValues = {
    GIT_COMMIT: 'abcdef1234567890',
    BUILD_TIME: '2026-07-06T14:00:00Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfigValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<VersionService>(VersionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('info (getter)', () => {
    it('should correctly fetch and return git commit and build time from configuration settings', () => {
      const result = service.info;

      expect(configService.get).toHaveBeenCalledWith('GIT_COMMIT', { infer: true });
      expect(configService.get).toHaveBeenCalledWith('BUILD_TIME', { infer: true });

      expect(result).toEqual({
        commit: 'abcdef1234567890',
        buildTime: '2026-07-06T14:00:00Z',
      });
    });
  });
});
