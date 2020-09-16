declare module 'memcached-promisify' {
  import Memcached from 'memcached';

  class Cache extends Memcached {

    constructor(config: { cacheHost: string }, options: Memcached.options);
    get(key: string): Promise<string>;

    touch(key: string, lifetime: number): Promise<void>;

    gets(key: string): Promise<{ [key: string]: any; cas: string }>;

    getMulti(keys: string[]): Promise<{ [key: string]: any }>;

    set(key: string, value: any, lifetime: number): Promise<boolean>;
  }

  export default Cache;
}
