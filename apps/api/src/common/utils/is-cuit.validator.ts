import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCuit } from './cuit';

export function IsCuit(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCuit',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} no es una CUIT válida`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCuit(value),
      },
    });
  };
}
