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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

type BillingCycle = 'monthly' | 'annual' | null;

interface ProActivationState {
  isProJustActivated: boolean;
  billingCycle: BillingCycle;
  isChecking: boolean;
}

export function useProActivation() {
  const [state, setState] = useState<ProActivationState>({
    isProJustActivated: false,
    billingCycle: null,
    isChecking: false,
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
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, billing_cycle')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (sub) {
          setState({
            isProJustActivated: true,
            billingCycle: (sub.billing_cycle as BillingCycle) ?? null,
            isChecking: false,
          });
        } else if (retriesLeft.current > 0) {
          // El webhook puede estar en tránsito. Reintentar.
          retriesLeft.current -= 1;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          await attempt();
        } else {
          // Agotamos los reintentos. No mostrar el modal.
          setState((s) => ({ ...s, isChecking: false }));
        }
      } catch {
        setState((s) => ({ ...s, isChecking: false }));
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
    });
  }, []);

  return { ...state, checkProStatus, clearActivation };
}
