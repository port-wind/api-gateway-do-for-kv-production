import { DurableObject } from 'cloudflare:workers';

export class Counter extends DurableObject {
  private value: number = 0;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<number>('value');
      this.value = stored ?? 0;
    });
  }

  async increment(): Promise<number> {
    this.value++;
    await this.ctx.storage.put('value', this.value);
    return this.value;
  }

  async decrement(): Promise<number> {
    this.value--;
    await this.ctx.storage.put('value', this.value);
    return this.value;
  }

  async getValue(): Promise<number> {
    return this.value;
  }

  async reset(): Promise<number> {
    this.value = 0;
    await this.ctx.storage.put('value', this.value);
    return this.value;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/increment':
          return new Response(JSON.stringify({ value: await this.increment() }), {
            headers: { 'Content-Type': 'application/json' },
          });
        case '/decrement':
          return new Response(JSON.stringify({ value: await this.decrement() }), {
            headers: { 'Content-Type': 'application/json' },
          });
        case '/value':
          return new Response(JSON.stringify({ value: await this.getValue() }), {
            headers: { 'Content-Type': 'application/json' },
          });
        case '/reset':
          return new Response(JSON.stringify({ value: await this.reset() }), {
            headers: { 'Content-Type': 'application/json' },
          });
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(`Error: ${error}`, { status: 500 });
    }
  }
}