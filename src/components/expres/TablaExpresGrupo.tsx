/**
 * src/components/expres/TablaExpresGrupo.tsx
 *
 * RALLY · La tabla de un grupo de exprés.
 *
 * ESTA PANTALLA ES EL PRODUCTO
 *   Un exprés se organiza hoy en Excel, y lo que lo hace un infierno es
 *   exactamente esta tabla: contar a mano los games a favor y en contra de 16
 *   parejas, cada una con cinco partidos, y ordenarlas por la resta. Si RALLY
 *   resuelve esto, el club pasa de usarlo tres veces al año a cada domingo.
 *
 * CUATRO COLUMNAS, Y NINGUNA DE ELLAS ES "PUNTOS"
 *   PJ, GF, GC y saldo. No hay ganados, perdidos ni empatados porque el
 *   partido no tiene ganador. Mostrar una columna de victorias aquí —aunque
 *   fuera a cero— haría buscar un criterio que no existe.
 *
 *   Y no hay columna de "games a favor" como desempate al lado del saldo,
 *   aunque GF esté en la tabla: como todas juegan los mismos 30 games, GF y
 *   saldo ordenan IGUAL. GF está para que el jugador pueda cuadrar la cuenta,
 *   no como segundo criterio. Ver la cabecera de engine/expres/tabla.ts.
 *
 * LA LÍNEA DE CORTE SE DIBUJA
 *   Pasan cuatro. La línea va después del cuarto puesto porque "¿estoy
 *   dentro?" es la única pregunta que trae a alguien a mirar esta pantalla.
 *
 * LOS EMPATES SE CUENTAN, NO SE ESCONDEN
 *   En un grupo de 8 cada pareja juega 5 de sus 7 rivales, así que dos
 *   empatadas a saldo pueden no haberse enfrentado nunca y no haber nada que
 *   mirar. Cuando eso decide quién va a cuartos, la tabla lo dice arriba, en
 *   grande, y le pasa la decisión al organizador. Publicar un orden inventado
 *   en ese caso sería mentir con cara de reglamento.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, fontSize, radius, space, touchTarget } from '@/lib/design-tokens';
import type { ClinchExpresResult, TablaExpres } from '@/lib/engine/expres';
import {
  LEYENDA_TABLA_EXPRES,
  avisoDeEmpateExpres,
  avisoDeTablaProvisional,
  explicacionDeCriterio,
  textoDeBalance,
} from '@/lib/expres-texto';

export interface TablaExpresGrupoProps {
  tabla: TablaExpres;
  /** Estado de clasificación por pareja. Opcional: sin él no se pintan los avisos de clinch. */
  clinch?: readonly ClinchExpresResult[];
  nombreDePareja: (pairId: string) => string;
  /** La pareja de quien mira, para resaltar su fila. */
  destacarPairId?: string;
  /** Solo para el organizador: resolver el empate que bloquea. */
  onDecidirEmpate?: () => void;
}

export default function TablaExpresGrupo({
  tabla,
  clinch,
  nombreDePareja,
  destacarPairId,
  onDecidirEmpate,
}: TablaExpresGrupoProps) {
  const avisoEmpate = avisoDeEmpateExpres(tabla);
  const avisoProvisional = avisoDeTablaProvisional(tabla);
  const estadoDe = new Map((clinch ?? []).map((c) => [c.pairId, c.estado]));

  return (
    <View style={s.cont}>
      {tabla.grupo ? <Text style={s.titulo}>Grupo {tabla.grupo}</Text> : null}

      {avisoProvisional && (
        <View style={[s.aviso, s.avisoSuave]}>
          <Text style={s.avisoSuaveTexto}>{avisoProvisional}</Text>
        </View>
      )}

      {avisoEmpate && (
        <View style={[s.aviso, s.avisoFuerte]}>
          <Text style={s.avisoFuerteTitulo}>Hay que desempatar</Text>
          <Text style={s.avisoFuerteTexto}>{avisoEmpate}</Text>
          {onDecidirEmpate && (
            <Pressable onPress={onDecidirEmpate} accessibilityRole="button" style={s.avisoBoton}>
              <Text style={s.avisoBotonTexto}>Marcar quién avanza</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={s.encabezado}>
        <Text style={[s.th, s.colPos]}>#</Text>
        <Text style={[s.th, s.colNombre]}>Pareja</Text>
        <Text style={[s.th, s.colNum]}>PJ</Text>
        <Text style={[s.th, s.colNum]}>GF</Text>
        <Text style={[s.th, s.colNum]}>GC</Text>
        <Text style={[s.th, s.colSaldo]}>Saldo</Text>
      </View>

      {tabla.filas.map((f, i) => {
        const esUltimaDentro = f.posicion === tabla.clasifican;
        const mia = destacarPairId === f.pairId;
        const estado = estadoDe.get(f.pairId);
        return (
          <View key={f.pairId}>
            <View style={[s.fila, mia && s.filaMia, i % 2 === 1 && s.filaAlterna]}>
              <Text style={[s.td, s.colPos, f.posicion <= tabla.clasifican && s.posDentro]}>
                {f.posicion}
              </Text>
              <View style={s.colNombre}>
                <Text style={[s.nombre, mia && s.nombreMio]} numberOfLines={1}>
                  {nombreDePareja(f.pairId)}
                </Text>
                {/* Por qué está donde está. Un orden sin explicación se lee
                    como arbitrario aunque no lo sea. */}
                {f.criterio !== 'balance' && (
                  <Text style={[s.criterio, f.empateSinResolver && s.criterioAlerta]}>
                    {explicacionDeCriterio(f.criterio)}
                  </Text>
                )}
                {estado === 'clinched' && <Text style={s.clinchDentro}>Ya está en cuartos</Text>}
                {estado === 'eliminated' && <Text style={s.clinchFuera}>Fuera de cuartos</Text>}
              </View>
              <Text style={[s.td, s.colNum]}>{f.jugados}</Text>
              <Text style={[s.td, s.colNum, s.tdSuave]}>{f.gamesFavor}</Text>
              <Text style={[s.td, s.colNum, s.tdSuave]}>{f.gamesContra}</Text>
              <Text
                style={[
                  s.td,
                  s.colSaldo,
                  s.saldo,
                  f.balance > 0 && s.saldoBueno,
                  f.balance < 0 && s.saldoMalo,
                ]}
              >
                {textoDeBalance(f.balance)}
              </Text>
            </View>

            {/* La línea de corte: pasan cuatro. */}
            {esUltimaDentro && i < tabla.filas.length - 1 && (
              <View style={s.corte}>
                <View style={s.corteLinea} />
                <Text style={s.corteTexto}>pasan a cuartos</Text>
                <View style={s.corteLinea} />
              </View>
            )}
          </View>
        );
      })}

      <Text style={s.leyenda}>{LEYENDA_TABLA_EXPRES}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cont: { gap: space[2] },
  titulo: {
    color: color.champagne,
    fontFamily: font.display,
    fontSize: fontSize.h1Inline,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  aviso: { padding: space[3], borderRadius: radius.sm, borderWidth: 1, gap: space[2] },
  avisoSuave: { backgroundColor: 'rgba(230,180,80,0.10)', borderColor: 'rgba(230,180,80,0.28)' },
  avisoSuaveTexto: { color: color.alive, fontFamily: font.body, fontSize: fontSize.caption, lineHeight: 18 },
  avisoFuerte: { backgroundColor: 'rgba(224,114,111,0.12)', borderColor: 'rgba(224,114,111,0.32)' },
  avisoFuerteTitulo: {
    color: color.danger,
    fontFamily: font.display,
    fontSize: fontSize.section,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  avisoFuerteTexto: { color: color.text, fontFamily: font.body, fontSize: fontSize.body, lineHeight: 20 },
  avisoBoton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.gold,
  },
  avisoBotonTexto: { color: color.bg, fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600' },

  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[2],
    paddingBottom: space[1],
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  th: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.eyebrow,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    borderRadius: radius.xs,
  },
  filaAlterna: { backgroundColor: 'rgba(255,255,255,0.03)' },
  filaMia: { backgroundColor: 'rgba(212,175,55,0.10)' },

  td: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  tdSuave: { color: color.muted },
  colPos: { width: 22, textAlign: 'center' },
  posDentro: { color: color.goldBright, fontWeight: '700' },
  colNombre: { flex: 1, gap: 1 },
  colNum: { width: 28, textAlign: 'right' },
  colSaldo: { width: 46, textAlign: 'right' },

  nombre: { color: color.text, fontFamily: font.body, fontSize: fontSize.body },
  nombreMio: { color: color.goldBright, fontWeight: '600' },
  criterio: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },
  criterioAlerta: { color: color.danger },
  clinchDentro: { color: color.live, fontFamily: font.body, fontSize: fontSize.minAbsolute },
  clinchFuera: { color: color.muted, fontFamily: font.body, fontSize: fontSize.minAbsolute },

  saldo: { fontFamily: font.display, fontSize: fontSize.cardName },
  saldoBueno: { color: color.live },
  saldoMalo: { color: color.danger },

  corte: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[1] },
  corteLinea: { flex: 1, height: 1, backgroundColor: color.gold, opacity: 0.5 },
  corteTexto: {
    color: color.gold,
    fontFamily: font.body,
    fontSize: fontSize.minAbsolute,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  leyenda: {
    color: color.muted,
    fontFamily: font.body,
    fontSize: fontSize.minAbsolute,
    lineHeight: 17,
    paddingTop: space[2],
  },
});
