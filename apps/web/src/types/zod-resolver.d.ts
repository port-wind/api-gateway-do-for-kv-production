// 修复 @hookform/resolvers 与 Zod v4 的兼容性问题
declare module '@hookform/resolvers/zod' {
  import type { FieldValues, Resolver } from 'react-hook-form';
  import type { ZodSchema, ParseParams } from 'zod';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function zodResolver<TFieldValues extends FieldValues = FieldValues, TContext = any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: ZodSchema<any>,
    schemaOptions?: Partial<ParseParams>,
    resolverOptions?: {
      mode?: 'async' | 'sync';
      raw?: boolean;
    }
  ): Resolver<TFieldValues, TContext>;
}