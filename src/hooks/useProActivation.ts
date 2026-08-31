/**
 * useProActivation
 *
 * Hook que detecta si el usuario acaba de activar Pro y valida contra la BD.
 *
 * Uso:
 *   const { isProJustActivated, billingCycle, clearActivation } = useProActivation();
 *
 * Dispara la comprobación:
 *   A) Cuando la app recibe un deep link con ?pro_activated=true
 *   B) Cuando se llama manualmente a checkProStatus()
 *
 * La BD es la fuente de verdad: el deep link solo gatilla la comprobación,
 * nunca se usa su contenido como prueba de activación.
 *
 * Reintenta hasta MAX_RETRIES veces si el webhook aún no ha escrito en la BD.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { registrarFallo } from '@/lib/errores-red';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

type BillingCycle = 'monthly' | 'annual' | null;

interface ProActivationState {
  isProJustActivated: boolean;
  billingCycle: BillingCycle;
  isChecking: boolean;
  /**
   * La comprobación no pudo hacerse. NO quiere decir que la suscripción no
   * exista: quiere decir que no lo sabemos.
   *
   * Antes esto no existía y el `catch` vacío lo dejaba indistinguible de
   * "consultamos y no está activa". El usuario acaba de PAGAR: tragarse el
   * fallo le deja sin el modal de bienvenida, sin explicación y sin nada que
   * enseñar a soporte. Quien consume el hook decide qué hacer con esto, pero
   * ahora al menos puede.
   */
  checkFailed: boolean;
}

export function useProActivation() {
  const [state, setState] = useState<ProActivationState>({
    isProJustActivated: false,
    billingCycle: null,
    isChecking: false,
    checkFailed: false,
  });

  const retriesLeft = useRef(MAX_RETRIES);

  /**
   * checkProStatus
   * Consulta la BD y verifica si la suscripción está activa.
   * Reintenta si el webhook aún no llegó.
   */
  const checkProStatus = useCallback(async () => {
    setState((s) => ({ ...s, isChecking: true }));
    retriesLeft.current = MAX_RETRIES;

    const attempt = async (): Promise<void> => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) {
          // Sin sesión no hay nada que comprobar, y tampoco es un fallo.
          setState((s) => ({ ...s, isChecking: false }));
          return;
        }

        // El error de esta consulta se comprobaba: se descartaba en la
        // desestructuración y un fallo de lectura pasaba por "no hay
        // suscripción activa", que son cosas MUY distintas cuando el usuario
        // acaba de pagar.
        const { data: sub, error: subErr } = await supabase
          .from('subscriptions')
          .select('status, billing_cycle')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (subErr) throw subErr;

        if (sub) {
          setState({
            isProJustActivated: true,
            billingCycle: (sub.billing_cycle as BillingCycle) ?? null,
            isChecking: false,
            checkFailed: false,
          });
        } else if (retriesLeft.current > 0) {
          // El webhook puede estar en tránsito. Reintentar.
          retriesLeft.current -= 1;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          await attempt();
        } else {
          // Consultamos y de verdad no está activa. No es un fallo: el webhook
          // de Stripe puede tardar más que nuestros reintentos.
          setState((s) => ({ ...s, isChecking: false, checkFailed: false }));
        }
      } catch (e) {
        // El usuario YA PAGÓ. Este error es lo único que quedará para
        // averiguar por qué no vio su activación, así que se registra con
        // todo el contexto que tenemos.
        registrarFallo('useProActivation', e, {
          reintentosRestantes: retriesLeft.current,
          nota: 'el usuario completó el pago; la comprobación de suscripción falló',
        });
        setState((s) => ({ ...s, isChecking: false, checkFailed: true }));
      }
    };

    await attempt();
  }, []);

  /**
   * clearActivation
   * Llamar cuando el usuario cierra el modal de celebración.
   */
  const clearActivation = useCallback(() => {
    setState({
      isProJustActivated: false,
      billingCycle: null,
      isChecking: false,
      checkFailed: false,
    });
  }, []);

  return { ...state, checkProStatus, clearActivation };
}
