/**
 * RALLY · Buscador de usuario
 *
 * Campo de búsqueda por nombre O correo, con lista de coincidencias. Llama a
 * la RPC `search_users` (migración 034), que es SECURITY DEFINER porque la RLS
 * de `users` solo deja ver la propia fila.
 *
 * El correo que llega ya viene ENMASCARADO del servidor ('ern***@correo.com').
 * No es un recorte de presentación: el valor real nunca sale de la base.
 *
 * Está en components/organizer/ porque hoy solo lo usa la asignación de jueces.
 * Si se unifica con el flujo de inscripción de parejas (anotado como lote
 * aparte), conviene moverlo a components/ui/.
 */

import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import { inputFontSize } from '@/lib/web-layout';

/** Debe coincidir con el mínimo de la RPC: por debajo, devuelve vacío. */
export const MIN_CARACTERES = 3;

export interface UsuarioEncontrado {
  id:        string;
  email:     string;   // enmascarado
  full_name: string;
  photo_url: string | null;
}

interface Props {
  label:       string;
  placeholder?: string;
  ayuda?:      string;
  /** Ids ya elegidos: se marcan como tales en vez de dejar volver a tocarlos. */
  yaElegidos?: string[];
  textoYaElegido?: string;
  onElegir:    (u: UsuarioEncontrado) => void;
  /** Se pinta bajo la lista cuando no hay coincidencias. */
  renderSinResultados?: (consulta: string) => React.ReactNode;
}

/** Iniciales para el avatar cuando no hay foto. */
function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export default function BuscadorDeUsuario({
  label, placeholder = 'Nombre o correo', ayuda,
  yaElegidos = [], textoYaElegido = 'Ya agregado',
  onElegir, renderSinResultados,
}: Props) {
  const [consulta, setConsulta]     = useState('');
  const [resultados, setResultados] = useState<UsuarioEncontrado[]>([]);
  const [buscando, setBuscando]     = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const consultaDebounced = useDebounce(consulta, 300);
  const suficiente = consultaDebounced.trim().length >= MIN_CARACTERES;

  useEffect(() => {
    if (!suficiente) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    let vivo = true;
    setBuscando(true);
    setError(null);

    supabase
      .rpc('search_users', { p_query: consultaDebounced.trim() })
      .then(({ data, error: rpcErr }) => {
        if (!vivo) return;
        if (rpcErr) {
          setError('No se pudo buscar. Intenta de nuevo.');
          setResultados([]);
        } else {
          setResultados((data ?? []) as UsuarioEncontrado[]);
        }
        setBuscando(false);
      });

    // Descarta la respuesta si la consulta ya cambió: sin esto, una respuesta
    // lenta de 'ernes' puede pisar a la de 'ernesto'.
    return () => { vivo = false; };
  }, [consultaDebounced, suficiente]);

  const sinResultados = suficiente && !buscando && !error && resultados.length === 0;

  return (
    <View style={s.raiz}>
      <Text style={s.label}>{label}</Text>

      <TextInput
        style={s.input}
        value={consulta}
        onChangeText={setConsulta}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={color.gold}
        accessibilityLabel={label}
      />

      {ayuda ? <Text style={s.ayuda}>{ayuda}</Text> : null}

      {/* Buscando — no bloquea el campo, solo avisa */}
      {buscando && (
        <View style={s.buscando}>
          <ActivityIndicator color={color.muted} size="small" />
          <Text style={s.buscandoTexto}>Buscando…</Text>
        </View>
      )}

      {error && <Text style={s.error}>{error}</Text>}

      {/* Coincidencias */}
      {resultados.length > 0 && (
        <View style={s.lista}>
          {resultados.map((u) => {
            const elegido = yaElegidos.includes(u.id);
            return (
              <Pressable
                key={u.id}
                onPress={() => { if (!elegido) { onElegir(u); setConsulta(''); } }}
                disabled={elegido}
                style={({ pressed }) => [s.fila, elegido && s.filaInerte, pressed && s.filaPulsada]}
                accessibilityRole="button"
                accessibilityState={{ disabled: elegido }}
                accessibilityLabel={`${u.full_name}, ${u.email}`}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarTexto}>{iniciales(u.full_name)}</Text>
                </View>

                <View style={s.filaTextos}>
                  <Text style={s.nombre} numberOfLines={1}>{u.full_name}</Text>
                  {/* El correo enmascarado es lo único que desempata homónimos:
                      `users` no tiene ciudad ni ningún otro dato distintivo. */}
                  <Text style={s.correo} numberOfLines={1}>{u.email}</Text>
                </View>

                {elegido && <Text style={s.yaElegido}>{textoYaElegido}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Sin coincidencias — el bloque lo aporta quien use el componente,
          porque lo accionable depende del contexto. */}
      {sinResultados && (renderSinResultados
        ? renderSinResultados(consultaDebounced.trim())
        : <Text style={s.vacio}>Nadie con ese nombre o correo.</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  raiz:  { gap: space[2] },
  label: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  input: {
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    paddingVertical:   space[3],
    fontFamily:        font.body,
    fontSize:          inputFontSize(fontSize.body),
    color:             color.text,
  },
  ayuda: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 17 },

  buscando:      { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[1] },
  buscandoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger },
  vacio: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  lista: { gap: space[2] },
  fila: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               space[3],
    minHeight:         touchTarget + 12,
    paddingHorizontal: space[3],
    paddingVertical:   space[2],
    backgroundColor:   color.surface,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
  },
  filaPulsada: { backgroundColor: color.surface2 },
  filaInerte:  { opacity: 0.5 },

  avatar: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: color.surface2,
    borderWidth:     1,
    borderColor:     color.line,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarTexto: { fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne },

  filaTextos: { flex: 1, minWidth: 0, gap: 2 },
  nombre:     { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  correo:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  yaElegido:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.live, flexShrink: 0 },
});
