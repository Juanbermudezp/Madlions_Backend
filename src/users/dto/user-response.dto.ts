import { ApiProperty } from '@nestjs/swagger';
import { Rol, type User } from '@PrismaClient';

/**
 * Forma pública de un usuario (GET /auth/me, login y registro).
 *
 * Los controladores devuelven esto y nunca la fila cruda de Prisma, para que
 * `passwordHash` no pueda filtrarse en una respuesta por descuido.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'maria@example.com', format: 'email' })
  correo!: string;

  @ApiProperty({ example: 'María' })
  nombre!: string;

  @ApiProperty({ example: 'López' })
  apellido!: string;

  @ApiProperty({ enum: Rol, example: Rol.MIEMBRO })
  rol!: Rol;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      correo: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
    };
  }
}