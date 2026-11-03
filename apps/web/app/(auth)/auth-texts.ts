/*
 * Textos del flujo de autenticación (roadmap B7) — estructura + defaults.
 *
 * DEFAULT_AUTH_TEXTS replica EXACTAMENTE el copy pre-CMS (regla de oro: si la
 * DB cae o un campo no está publicado, la pantalla se ve idéntica a hoy).
 * AUTH_TEXT_KEYS mapea cada texto a su key CMS (`auth.<seccion>.<campo>`).
 * La resolución server-side vive en auth-texts.server.ts (getAuthTexts).
 */

export type AuthTexts = {
  layout: { helpText: string; helpCta: string };
  login: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    forgot: string;
    pending: string;
    submit: string;
    noAccount: string;
    signupCta: string;
  };
  registro: {
    title: string;
    subtitle: string;
    hasAccount: string;
    loginCta: string;
    firstNameLabel: string;
    firstNamePlaceholder: string;
    lastNameLabel: string;
    lastNameOptional: string;
    lastNamePlaceholder: string;
    referralLabel: string;
    referralOptional: string;
    referralPlaceholder: string;
    referralHint: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    confirmLabel: string;
    mismatch: string;
    consent: string;
    pending: string;
    submit: string;
  };
  recuperar: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    pending: string;
    submit: string;
    backLogin: string;
  };
  confirmar: {
    titleNamed: string;
    title: string;
    subtitle: string;
    codeLabel: string;
    codeHint: string;
    pending: string;
    submit: string;
    resend: string;
    resending: string;
    wrongEmail: string;
    backRegister: string;
  };
  restablecer: {
    title: string;
    subtitle: string;
    codeLabel: string;
    passwordLabel: string;
    passwordHint: string;
    confirmLabel: string;
    mismatch: string;
    pending: string;
    submit: string;
    noCode: string;
    resendCta: string;
  };
};

export const DEFAULT_AUTH_TEXTS: AuthTexts = {
  layout: {
    helpText: "¿Necesitas ayuda?",
    helpCta: "Escríbenos por WhatsApp",
  },
  login: {
    title: "¡Qué alegría verte de nuevo!",
    subtitle: "Entra a tu cuenta para seguir personalizando tus productos.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@email.com",
    passwordLabel: "Contraseña",
    forgot: "¿Olvidaste tu contraseña?",
    pending: "Entrando...",
    submit: "Iniciar sesión",
    noAccount: "¿Aún no tienes cuenta?",
    signupCta: "Crear cuenta",
  },
  registro: {
    title: "Crea tu cuenta Lucams",
    subtitle: "Empieza a personalizar productos únicos en minutos.",
    hasAccount: "¿Ya tienes cuenta?",
    loginCta: "Inicia sesión",
    firstNameLabel: "Nombre",
    firstNamePlaceholder: "María",
    lastNameLabel: "Apellido",
    lastNameOptional: "(opcional)",
    lastNamePlaceholder: "Pérez",
    referralLabel: "Código de referido",
    referralOptional: "(si tienes uno)",
    referralPlaceholder: "LCS-XXXXXXXX",
    referralHint:
      "Si un amigo te compartió su código, ambos ganan {percent}% OFF cuando completes tu primera compra.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@email.com",
    passwordLabel: "Contraseña",
    confirmLabel: "Confirmar contraseña",
    mismatch: "Las contraseñas no coinciden.",
    consent:
      "Acepto los [términos](/legal/terminos) y autorizo el **tratamiento de mis datos personales** conforme a la [política de privacidad](/legal/privacidad) (Ley 1581 de 2012).",
    pending: "Creando...",
    submit: "Crear cuenta",
  },
  recuperar: {
    title: "Recupera tu contraseña",
    subtitle: "Escribe tu correo y te enviaremos un código para crear una contraseña nueva.",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@email.com",
    pending: "Enviando...",
    submit: "Enviar código",
    backLogin: "Volver a iniciar sesión",
  },
  confirmar: {
    titleNamed: "Listo, {nombre}",
    title: "Revisa tu correo",
    subtitle: "Te enviamos un código a {email}. Escríbelo aquí para activar tu cuenta.",
    codeLabel: "Código de confirmación",
    codeHint: "¿No llegó? Revisa la carpeta de spam o solicita uno nuevo abajo.",
    pending: "Confirmando...",
    submit: "Activar mi cuenta",
    resend: "Enviar otro código",
    resending: "Enviando...",
    wrongEmail: "¿Email equivocado?",
    backRegister: "Volver al registro",
  },
  restablecer: {
    title: "Restablece tu contraseña",
    subtitle: "Te enviamos un código a {email}. Escríbelo aquí junto con tu nueva contraseña.",
    codeLabel: "Código del correo",
    passwordLabel: "Nueva contraseña",
    passwordHint: "Mínimo 8 caracteres.",
    confirmLabel: "Confirmar nueva contraseña",
    mismatch: "Las contraseñas no coinciden.",
    pending: "Guardando...",
    submit: "Guardar nueva contraseña",
    noCode: "¿No te llegó el código?",
    resendCta: "Solicitar otro",
  },
};
