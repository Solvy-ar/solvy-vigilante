# Vigilante de Solvy

Revisa cada 3 minutos, las 24 h, que **www.solvy.com.ar** ande: inicio, buscador,
registro, ingreso, servidor y base de datos, rubros, lista de profesionales y el
certificado de seguridad. Si algo falla dos vueltas seguidas manda un mail a
founder@solvy.ar; recuerda cada hora mientras siga roto y avisa cuando se normaliza.

- Corre en GitHub Actions, **afuera de Vercel**: si se cae la plataforma, el que avisa sigue en pie.
- Es **público a propósito**: en repos públicos los minutos de Actions no se cobran.
  No tiene datos ni claves; la clave de mail va en *Settings → Secrets* (`RESEND_API_KEY`).
- Solo **lee**: no escribe en Solvy ni toca datos.
- `estado.json` es la memoria entre corridas y el historial de caídas.
- Probar una vuelta a mano: Actions → "Vigilante Solvy" → Run workflow → duración `1`.
