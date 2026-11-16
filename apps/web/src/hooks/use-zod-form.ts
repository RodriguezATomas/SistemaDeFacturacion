import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
import type { z } from 'zod';

/**
 * useForm tipado con un esquema Zod: los valores del formulario usan el tipo de entrada del
 * esquema y handleSubmit recibe el tipo de salida (ya transformado y validado).
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  props?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    ...props,
    resolver: zodResolver(schema as never) as never,
  });
}
