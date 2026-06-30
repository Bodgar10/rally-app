// _shared/gigstack.ts — emisión de CFDI vía gigstack (NET-NEW en RALLY).
// La firma exacta del endpoint/payload depende de la cuenta gigstack: confirmar contra su doc y ajustar
// GIGSTACK_INVOICE_URL / payload si difiere. El diseño es NO-bloqueante: un fallo de CFDI no tumba el webhook.
export interface CfdiResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  skipped?: boolean;
}

interface EmitArgs {
  email: string;
  amountPesos: number;
  rfc?: string | null;
  legalName?: string | null;
  conceptDescription?: string;
}

export async function emitSubscriptionCfdi(args: EmitArgs): Promise<CfdiResult> {
  const apiKey = Deno.env.get("GIGSTACK_API_KEY");
  const productCode = Deno.env.get("GIGSTACK_PRODUCT_CODE"); // clave producto/servicio SAT
  if (!apiKey) return { ok: false, skipped: true, error: "gigstack_not_configured" };

  // TODO(confirmar con doc gigstack): endpoint y shape exactos. Default razonable de su API REST.
  const url = Deno.env.get("GIGSTACK_INVOICE_URL") ?? "https://api.gigstack.io/v1/invoices";

  // Público en general si no hay RFC (Doc C §4.2): XAXX010101000.
  const rfc = (args.rfc && args.rfc.trim()) || "XAXX010101000";
  const legalName = (args.legalName && args.legalName.trim()) || "PUBLICO EN GENERAL";

  const payload = {
    client: { email: args.email, rfc, legal_name: legalName },
    items: [
      {
        description: args.conceptDescription ?? "Suscripción RALLY",
        product_key: productCode ?? undefined,
        quantity: 1,
        total: args.amountPesos, // pesos
      },
    ],
    currency: "MXN",
    use_cfdi: "G03", // gastos en general (default; el portal de autofacturación puede cambiarlo)
    payment_form: "28", // tarjeta de crédito (ajustar según el método real)
    send_email: true,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `gigstack_${res.status}: ${text.slice(0, 300)}` };
    let providerId: string | undefined;
    try {
      const j = JSON.parse(text);
      providerId = j.id ?? j.invoice_id ?? j.uuid ?? undefined;
    } catch { /* respuesta no-JSON: aún OK si 2xx */ }
    return { ok: true, providerId };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}
