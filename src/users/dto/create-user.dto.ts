import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Registro público. No tiene campo `rol`: con `forbidNonWhitelisted`, una
 * petición que intente mandarlo se rechaza con 400, así nadie puede
 * registrarse como entrenador o administrador.
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Email del usuario. Se normaliza a minúsculas y sin espacios.',
    example: 'nestor@example.com',
    format: 'email',
    maxLength: 254,
  })
  @IsNormalizedEmail()
  email!: string;

  @ApiProperty({
    description: 'Contraseña. Debe incluir al menos una minúscula, una mayúscula y un número.',
    example: 'Str0ngPass',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt trunca silenciosamente en 72 bytes, así que se rechaza antes de hashear.
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una minúscula, una mayúscula y un número.',
  })
  password!: string;

  @ApiProperty({ example: 'María', minLength: 2, maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener entre 2 y 50 caracteres.' })
  @MaxLength(50, { message: 'El nombre debe tener entre 2 y 50 caracteres.' })
  nombre!: string;

  @ApiProperty({ example: 'López', minLength: 2, maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener entre 2 y 50 caracteres.' })
  @MaxLength(50, { message: 'El apellido debe tener entre 2 y 50 caracteres.' })
  apellido!: string;

  @ApiProperty({ example: '70001234', description: '8 dígitos, sin guion.' })
  @Transform(trim)
  @IsString()
  @Matches(/^\d{8}$/, { message: 'El teléfono debe tener 8 dígitos.' })
  telefono!: string;
}