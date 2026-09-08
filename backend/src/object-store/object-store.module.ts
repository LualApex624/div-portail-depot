import { Global, Module } from '@nestjs/common';
import { ObjectStoreService } from './object-store.service';

@Global()
@Module({
  providers: [ObjectStoreService],
  exports: [ObjectStoreService],
})
export class ObjectStoreModule {}
