import nodemailer from 'nodemailer';
import { env } from '../config/env';

function mailTransporter() {
  if (env.MAIL_MAILER !== 'smtp') {
    throw new Error('MAIL_MAILER debe estar configurado como smtp.');
  }
  if (!env.MAIL_HOST || !env.MAIL_FROM_ADDRESS) {
    throw new Error('El correo no está configurado. Define MAIL_HOST y MAIL_FROM_ADDRESS.');
  }
  return nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_ENCRYPTION === 'ssl' || env.MAIL_PORT === 465,
    requireTLS: env.MAIL_ENCRYPTION === 'tls',
    auth: env.MAIL_USERNAME
      ? { user: env.MAIL_USERNAME, pass: env.MAIL_PASSWORD }
      : undefined,
  });
}

export async function sendTemporaryPassword(
  recipient: { nombre: string; correo: string; usuario: string },
  temporaryPassword: string,
): Promise<void> {
  await mailTransporter().sendMail({
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

export async function sendPasswordResetCode(
  recipient: { nombre: string; correo: string },
  code: string,
): Promise<void> {
  await mailTransporter().sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_ADDRESS },
    to: recipient.correo,
    subject: 'Código para restablecer tu contraseña',
    text: [
      `Hola ${recipient.nombre},`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña del Dashboard Gerencial.',
      `Tu código es: ${code}`,
      '',
      'El código vence en 15 minutos y solo puede utilizarse una vez.',
      'Si no hiciste esta solicitud, puedes ignorar este correo.',
    ].join('\n'),
  });
}
