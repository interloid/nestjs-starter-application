import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestStore = Map<string, unknown>;

@Injectable()
export class RequestContext {
  private readonly als = new AsyncLocalStorage<RequestStore>();

  run<T>(store: RequestStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.als.getStore()?.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.als.getStore()?.set(key, value);
  }
}
