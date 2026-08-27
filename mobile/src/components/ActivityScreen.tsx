// src/screens/ActivityScreen.tsx
import { ActivityRenderer } from '@/components/ActivityRenderer'
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
      <ActivityRenderer atividade={atividade} topicoId={topico?.id} />
    </View>
  )
}
