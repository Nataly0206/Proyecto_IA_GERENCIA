import nodemailer from 'nodemailer';
import { env } from '../config/env';

export async function sendTemporaryPassword(
  recipient: { nombre: string; correo: string; usuario: string },
  temporaryPassword: string,
): Promise<void> {
  if (env.MAIL_MAILER !== 'smtp') {
    throw new Error('MAIL_MAILER debe estar configurado como smtp.');
  }
  if (!env.MAIL_HOST || !env.MAIL_FROM_ADDRESS) {
    throw new Error('El correo no está configurado. Define MAIL_HOST y MAIL_FROM_ADDRESS.');
  }
  const transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_ENCRYPTION === 'ssl' || env.MAIL_PORT === 465,
    requireTLS: env.MAIL_ENCRYPTION === 'tls',
    auth: env.MAIL_USERNAME
      ? { user: env.MAIL_USERNAME, pass: env.MAIL_PASSWORD }
      : undefined,
  });
  await transporter.sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_ADDRESS },
    to: recipient.correo,
    subject: 'Acceso al Dashboard Gerencial',
    text: [
      `Hola ${recipient.nombre},`,
      '',
      'Se creó tu acceso al Dashboard Gerencial.',
      `Usuario: ${recipient.usuario}`,
      `Contraseña temporal: ${temporaryPassword}`,
      '',
      'Por seguridad, el sistema te pedirá crear una contraseña nueva al ingresar.',
    ].join('\n'),
  });
}
