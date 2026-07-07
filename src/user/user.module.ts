import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/services/password.service';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  providers: [UserService, PasswordService],
  exports: [UserService, PasswordService],
  controllers: [UserController],
})
export class UserModule {}
