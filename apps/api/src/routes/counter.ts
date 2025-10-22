import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { ErrorResponseSchema } from '../schemas/common';
import { createApp } from '../lib/openapi';
import type { Env } from '../types/env';

const app = createApp();

const counterResponseSchema = z.object({
  value: z.number().describe('The current counter value'),
});

const incrementRoute = createRoute({
  method: 'post',
  path: '/counter/increment',
  tags: ['Counter'],
  summary: 'Increment the counter',
  responses: {
    200: {
      content: {
        'application/json': { schema: counterResponseSchema },
      },
      description: 'Counter incremented successfully',
    },
    500: {
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
      description: 'Internal server error',
    },
  },
});

const decrementRoute = createRoute({
  method: 'post',
  path: '/counter/decrement',
  tags: ['Counter'],
  summary: 'Decrement the counter',
  responses: {
    200: {
      content: {
        'application/json': { schema: counterResponseSchema },
      },
      description: 'Counter decremented successfully',
    },
    500: {
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
      description: 'Internal server error',
    },
  },
});

const getValueRoute = createRoute({
  method: 'get',
  path: '/counter/value',
  tags: ['Counter'],
  summary: 'Get the current counter value',
  responses: {
    200: {
      content: {
        'application/json': { schema: counterResponseSchema },
      },
      description: 'Current counter value',
    },
    500: {
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
      description: 'Internal server error',
    },
  },
});

const resetRoute = createRoute({
  method: 'post',
  path: '/counter/reset',
  tags: ['Counter'],
  summary: 'Reset the counter to zero',
  responses: {
    200: {
      content: {
        'application/json': { schema: counterResponseSchema },
      },
      description: 'Counter reset successfully',
    },
    500: {
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
      description: 'Internal server error',
    },
  },
});

app.openapi(incrementRoute, async (c) => {
  try {
    // 从 Durable Objects 获取 counter 实例
    const id = c.env.COUNTER.idFromName('global-counter');
    const stub = c.env.COUNTER.get(id);
    
    const response = await stub.fetch(
      new Request('http://counter/increment', { method: 'GET' })
    );
    
    const data = await response.json() as { value: number };
    return c.json({ value: data.value }, 200);
  } catch (error) {
    return c.json({ error: `Failed to increment counter: ${error}` }, 500);
  }
});

app.openapi(decrementRoute, async (c) => {
  try {
    // 从 Durable Objects 获取 counter 实例
    const id = c.env.COUNTER.idFromName('global-counter');
    const stub = c.env.COUNTER.get(id);
    
    const response = await stub.fetch(
      new Request('http://counter/decrement', { method: 'GET' })
    );
    
    const data = await response.json() as { value: number };
    return c.json({ value: data.value }, 200);
  } catch (error) {
    return c.json({ error: `Failed to decrement counter: ${error}` }, 500);
  }
});

app.openapi(getValueRoute, async (c) => {
  try {
    // 从 Durable Objects 获取 counter 实例
    const id = c.env.COUNTER.idFromName('global-counter');
    const stub = c.env.COUNTER.get(id);
    
    const response = await stub.fetch(
      new Request('http://counter/value', { method: 'GET' })
    );
    
    const data = await response.json() as { value: number };
    return c.json({ value: data.value }, 200);
  } catch (error) {
    return c.json({ error: `Failed to get counter value: ${error}` }, 500);
  }
});

app.openapi(resetRoute, async (c) => {
  try {
    // 从 Durable Objects 获取 counter 实例
    const id = c.env.COUNTER.idFromName('global-counter');
    const stub = c.env.COUNTER.get(id);
    
    const response = await stub.fetch(
      new Request('http://counter/reset', { method: 'GET' })
    );
    
    const data = await response.json() as { value: number };
    return c.json({ value: data.value }, 200);
  } catch (error) {
    return c.json({ error: `Failed to reset counter: ${error}` }, 500);
  }
});

export default app;