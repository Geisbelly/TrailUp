import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { ImagemDoStorage } from "@/components/ImagemDoStorage";
import { estilosDoPerfilPublico as s } from "@/components/social/perfilPublicoEstilos";
import type { ProfessorProfile } from "@/services/social/professorProfileModel";
import { carregarPerfilDoProfessor } from "@/services/social/professorProfileService";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";

type Props = {
  classeId: number;
  accent: string;
  onClose: () => void;
  /** Web em tela larga: cartão no centro da tela em vez da folha que sobe de baixo. */
  centralizado?: boolean;
};

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <>
      <Text style={s.label}>{rotulo}</Text>
      <Text style={s.value}>{valor}</Text>
    </>
  );
}

/**
 * Perfil do professor, com a mesma cara do perfil do colega e outros atributos: no lugar de
 * guilda, perfil de jogador e conquistas, ficam instituição, disciplina e as turmas em comum.
 */
export function ProfessorProfileModal({ classeId, accent, onClose, centralizado = false }: Props) {
  const palette = buildProfileShellPaletteFromAccent(accent);
  const [perfil, setPerfil] = useState<ProfessorProfile | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      setPerfil(await carregarPerfilDoProfessor(classeId));
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [classeId]);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <Modal visible animationType={centralizado ? "fade" : "slide"} transparent onRequestClose={onClose}>
      <View style={[s.backdrop, centralizado && s.backdropCentro]}>
        <View style={[s.modal, centralizado && s.modalCentro, { backgroundColor: palette.surface }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar perfil" onPress={onClose} style={s.close}>
            <Text style={s.closeText}>×</Text>
          </Pressable>
          {carregando ? (
            <ActivityIndicator color={accent} style={s.loader} />
          ) : erro ? (
            <View style={s.center}>
              <Text style={s.error}>Não foi possível carregar este perfil.</Text>
              <Pressable accessibilityRole="button" onPress={() => void carregar()} style={[s.retry, { backgroundColor: accent }]}>
                <Text style={s.retryText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : perfil ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
              <View style={[s.banner, { backgroundColor: `${accent}35` }]}>
                <MaterialCommunityIcons name="school-outline" size={54} color={accent} />
              </View>
              <View style={[s.avatar, { borderColor: accent }]}>
                {perfil.fotoUrl
                  ? <ImagemDoStorage source={{ uri: perfil.fotoUrl }} style={s.avatarImage} accessibilityLabel={`Foto de ${perfil.nome}`} />
                  : <Text style={[s.avatarLetter, { color: accent }]}>{perfil.nome.slice(0, 1).toUpperCase()}</Text>}
              </View>
              <View style={s.heading}>
                <Text style={s.name}>{perfil.nome.toUpperCase()}</Text>
                <Text style={s.handle}>Professor da turma</Text>
              </View>
              <View style={s.rule} />
              <Campo rotulo="INSTITUIÇÃO" valor={perfil.instituicao} />
              <Campo rotulo="DISCIPLINA" valor={perfil.disciplina} />
              <Campo rotulo="SOBRE" valor={perfil.descricao} />
              {perfil.turmas.length > 0 ? (
                <>
                  <Text style={s.label}>{perfil.turmas.length === 1 ? "TURMA COM VOCÊ" : "TURMAS COM VOCÊ"}</Text>
                  <View style={s.badges}>
                    {perfil.turmas.map((turma) => (
                      <View key={turma.classeId} style={[s.badge, { backgroundColor: palette.surfaceElevated }]}>
                        <Text style={s.badgeText}>{turma.nome?.trim() || "Turma"}</Text>
                        <Text style={s.badgeMeta}>{turma.materia ?? "Geral"}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </ScrollView>
          ) : (
            <View style={s.center}><Text style={s.error}>Perfil indisponível.</Text></View>
          )}
        </View>
      </View>
    </Modal>
  );
}
