// src/screens/ActivityScreen.tsx
import { ActivityRenderer } from '@/components/ActivityRenderer'
import { SeloDePrazo } from '@/components/SeloDePrazo'
import { Topico } from '@/models/Topico'
import React from 'react'
import { Text, View } from 'react-native'

type ActivityScreenProps = {
  route: {
    params: {
      atividadeId: number
      topico: Topico
    }
  }
}

export default function ActivityScreen({ route }: ActivityScreenProps) {
  const { atividadeId, topico } = route.params
  const atividade = topico.atividades.find(a => a.id === atividadeId)

  if (!atividade) return <Text>Atividade não encontrada.</Text>

  return (
    <View style={{ flex: 1 }}>
      {/* Acima do renderer, e nao dentro de cada tipo de atividade: um lugar so
          vale para texto, questao e o que vier depois. */}
      <SeloDePrazo dataEntrega={atividade.data_entrega} />
      <ActivityRenderer atividade={atividade} topicoId={topico?.id} />
    </View>
  )
}
