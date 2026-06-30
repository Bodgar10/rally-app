/**
 * RALLY · Panel de torneo del organizador
 * Gestión: cambiar status, ver categorías, ir a agregar categorías.
 * Sprint 2: cerrar inscripciones + sugerencia IA de cuadro.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel }    from '@/components/ui';
import { color, font, fontSize, space, radius } from '@/lib/design-tokens';

interface Tournament {
  id: string; name: string; start_date: string; end_date: string;
  status: string; registration_fee: number;
}
interface Category {
  id: string; display_name: string; status: string;
}

export default function OrgTournamentScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updating, setUpdating]     = useState(false);

  // ── Estado de jueces asignados ──
  const [judges, setJudges] = useState<Array<{ id: string; userId: string; name: string; email: string }>>([]);
  const [judgeEmail, setJudgeEmail] = useState('');
  const [judgeSearching, setJudgeSearching] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeSuccess, setJudgeSuccess] = useState<string | null>(null);

  async function load() {
    const [{ data: t }, { data: cats }] = await Promise.all([
      supabase.from('tournaments').select('id,name,start_date,end_date,status,registration_fee').eq('id', tournamentId).single(),
      supabase.from('categories').select('id,display_name,status').eq('tournament_id', tournamentId).order('division'),
    ]);
    if (t) setTournament(t as Tournament);
    if (cats) setCategories(cats as Category[]);
    setLoading(false);
  }

  useEffect(() => { load(); loadJudges(); }, [tournamentId]);

  async function loadJudges() {
    if (!tournamentId) return;
    const { data, error } = await supabase
      .from('tournament_judges')
      .select(
        `id, user_id,
         users:user_id ( full_name, email )`
      )
      .eq('tournament_id', tournamentId)
      .order('assigned_at', { ascending: true });

    if (error) {
      console.error('[loadJudges]', error);
      return;
    }

    setJudges(
      ((data ?? []) as unknown as Array<{
        id: string;
        user_id: string;
        users: { full_name: string; email: string };
      }>).map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.users?.full_name ?? '—',
        email: row.users?.email ?? '—',
      }))
    );
  }

  async function assignJudge() {
    setJudgeError(null);
    setJudgeSuccess(null);
    if (!judgeEmail.trim()) {
      setJudgeError('Ingresa el correo del juez.');
      return;
    }
    setJudgeSearching(true);
    try {
      // Buscar usuario por correo (RPC SECURITY DEFINER)
      const { data: found, error: rpcErr } = await supabase.rpc(
        'find_user_by_email',
        { p_email: judgeEmail.trim().toLowerCase() }
      );
      if (rpcErr || !found || found.length === 0) {
        setJudgeError('No se encontró un usuario con ese correo. Debe estar registrado en RALLY.');
        return;
      }
      const candidate = (found as Array<{ id: string; full_name: string; email: string }>)[0];

      // Verificar que no esté ya asignado
      if (judges.some((j) => j.userId === candidate.id)) {
        setJudgeError(`${candidate.full_name} ya está asignado a este torneo.`);
        return;
      }

      // Obtener organizer_id del torneo
      const { data: tData } = await supabase
        .from('tournaments')
        .select('organizer_id')
        .eq('id', tournamentId)
        .single();

      if (!tData) {
        setJudgeError('No se pudo obtener información del torneo.');
        return;
      }

      const { error: insertErr } = await supabase
        .from('tournament_judges')
        .insert({
          tournament_id: tournamentId,
          user_id: candidate.id,
          organizer_id: tData.organizer_id,
        });

      if (insertErr) {
        console.error('[assignJudge] insert error:', insertErr);
        setJudgeError('Error al asignar. Verifica que el usuario sea juez de este organizador.');
        return;
      }

      setJudgeEmail('');
      setJudgeSuccess(`${candidate.full_name} asignado como juez.`);
      await loadJudges();
    } finally {
      setJudgeSearching(false);
    }
  }

  async function removeJudge(judgeRowId: string, name: string) {
    const { error } = await supabase
      .from('tournament_judges')
      .delete()
      .eq('id', judgeRowId);

    if (error) {
      console.error('[removeJudge]', error);
      return;
    }
    setJudgeSuccess(`${name} desasignado.`);
    await loadJudges();
  }

  async function handleOpenRegistration() {
    setUpdating(true);
    await supabase.from('tournaments').update({ status: 'registration_open' }).eq('id', tournamentId);
    await load();
    setUpdating(false);
  }

  if (loading) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );
  if (!tournament) return null;

  const statusColors: Record<string, 'live' | 'alive' | 'muted'> = {
    draft: 'muted', registration_open: 'live', registration_closed: 'alive',
    in_progress: 'alive', finished: 'muted',
  };

  return (
    <SafeAreaView style={s.safe}>
      <Pressable onPress={() => router.replace('/(organizer)/org/index')} style={s.back}>
        <Text style={s.backText}>← Mis torneos</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>TORNEO</Text>
        <Text style={s.title}>{tournament.name}</Text>
        <Badge
          label={tournament.status.replace('_', ' ')}
          type={statusColors[tournament.status] ?? 'muted'}
        />

        {/* Acciones según status */}
        {tournament.status === 'draft' && (
          <Card variant="standard">
            <Text style={s.actionHint}>
              Agrega las categorías y luego abre las inscripciones para que los jugadores puedan registrarse.
            </Text>
            <View style={{ marginTop: space[3] }}>
              <Button
                label={updating ? 'Abriendo…' : 'Abrir inscripciones'}
                variant="primary"
                loading={updating}
                onPress={handleOpenRegistration}
              />
            </View>
          </Card>
        )}

        {tournament.status === 'registration_open' && (
          <Card variant="standard">
            <Text style={s.actionHint}>
              Las inscripciones están abiertas. Cuando se complete el cuadro, cierra las inscripciones para generar los grupos. (Sprint 2)
            </Text>
          </Card>
        )}

        {/* Categorías */}
        <SectionLabel
          title="Categorías"
          actionLabel="+ Agregar"
          onAction={() => router.push(`/(organizer)/org/torneos/${tournamentId}/categorias`)}
        />

        {categories.length === 0 && (
          <Card variant="standard">
            <Text style={s.emptyText}>
              No hay categorías aún. Agrega al menos una para abrir inscripciones.
            </Text>
          </Card>
        )}

        {categories.map(cat => (
          <Card key={cat.id} variant="standard">
            <View style={s.catRow}>
              <Text style={s.catName}>{cat.display_name}</Text>
              <Badge label={cat.status} type={cat.status === 'open' ? 'live' : 'muted'} />
            </View>
          </Card>
        ))}

        {/* Acciones futuras (Sprint 2+) */}
        <SectionLabel title="Próximamente" />
        <Card variant="standard">
          {[
            'Ajuste de calendario',
          ].map((item, i) => (
            <Text key={i} style={s.futureItem}>· {item}</Text>
          ))}
        </Card>

        {/* Acciones del torneo — Sprint 2 */}
        <SectionLabel title="Acciones" />
        <TournamentActionButton
          label="Cerrar inscripciones"
          subtitle="Genera el cuadro automáticamente por categoría"
          onPress={() =>
            router.push(`/(organizer)/org/torneos/${tournamentId}/cerrar-inscripciones`)
          }
          variant="primary"
        />
        <TournamentActionButton
          label="Agregar pareja manual"
          subtitle="Inscripción paid_offline (pago recibido fuera de la plataforma)"
          onPress={() =>
            router.push(`/(organizer)/org/torneos/${tournamentId}/agregar-pareja`)
          }
          variant="secondary"
        />

        {/* ── Sección: Jueces asignados ── */}
        <View style={{ marginTop: 24, marginBottom: 8 }}>
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 10,
              fontWeight: '500',
              color: color.champagne,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 12,
            }}
          >
            Jueces asignados
          </Text>

          {/* Lista de jueces actuales */}
          {judges.length === 0 ? (
            <View
              style={{
                backgroundColor: color.surface,
                borderRadius: radius.lg,
                padding: 14,
                borderWidth: 1,
                borderColor: color.lineSoft,
                marginBottom: 12,
              }}
            >
              <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted, textAlign: 'center' }}>
                Sin jueces asignados. Asigna uno para que pueda capturar resultados.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {judges.map((j) => (
                <View
                  key={j.id}
                  style={{
                    backgroundColor: color.surface,
                    borderRadius: radius.lg,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: color.lineSoft,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: '600', color: color.text }}>
                      {j.name}
                    </Text>
                    <Text style={{ fontFamily: font.body, fontSize: 11, color: color.muted }}>
                      {j.email}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removeJudge(j.id, j.name)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: 'rgba(224,114,111,0.30)',
                      backgroundColor: 'rgba(224,114,111,0.08)',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Desasignar a ${j.name}`}
                  >
                    <Text style={{ fontFamily: font.body, fontSize: 11, color: color.danger }}>
                      Quitar
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Formulario de asignación */}
          <View
            style={{
              backgroundColor: color.surface,
              borderRadius: radius.lg,
              padding: 14,
              borderWidth: 1,
              borderColor: color.lineSoft,
              gap: 10,
            }}
          >
            <Text style={{ fontFamily: font.body, fontSize: 12, color: color.muted }}>
              Asignar juez por correo:
            </Text>
            <TextInput
              value={judgeEmail}
              onChangeText={(v) => { setJudgeEmail(v); setJudgeError(null); setJudgeSuccess(null); }}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={color.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                backgroundColor: color.surface2,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: color.lineSoft,
                color: color.text,
                fontFamily: font.body,
                fontSize: 13,
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 44,
              }}
              accessibilityLabel="Correo del juez"
            />

            {judgeError && (
              <Text style={{ fontFamily: font.body, fontSize: 11, color: color.danger }}>
                {judgeError}
              </Text>
            )}
            {judgeSuccess && (
              <Text style={{ fontFamily: font.body, fontSize: 11, color: color.live }}>
                {judgeSuccess}
              </Text>
            )}

            <Pressable
              onPress={assignJudge}
              disabled={judgeSearching}
              style={({ pressed }) => ({
                backgroundColor: pressed || judgeSearching ? color.goldDeep : color.gold,
                borderRadius: radius.sm,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: judgeSearching ? 0.7 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="Asignar juez"
              accessibilityState={{ disabled: judgeSearching }}
            >
              {judgeSearching ? (
                <ActivityIndicator color={color.onGold} size="small" />
              ) : (
                <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: '600', color: color.onGold }}>
                  Asignar juez
                </Text>
              )}
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  back:             { paddingHorizontal: space[4.5], paddingTop: space[4] },
  backText:         { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  content:          { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: space[6] * 2, gap: space[3] },
  eyebrow:          { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:            { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  actionHint:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  emptyText:        { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center', paddingVertical: space[3] },
  catRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catName:          { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  futureItem:       { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, paddingVertical: space[1] },
});

// ─── Subcomponente: botón de acción del panel ───────────────────────────────
function TournamentActionButton({
  label,
  subtitle,
  onPress,
  variant = "secondary",
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: variant === "primary" ? color.gold : color.surface,
        borderRadius: radius.xl,
        padding: space[4],
        borderWidth: 1,
        borderColor: variant === "primary" ? "transparent" : color.line,
        gap: 4,
      }}
    >
      <Text
        style={{
          fontFamily: "Oswald",
          fontSize: 15,
          fontWeight: "600",
          color: variant === "primary" ? color.onGold : color.text,
        }}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: "Inter",
            fontSize: 11,
            color: variant === "primary" ? color.onGold : color.muted,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
