// src/screens/ActivityScreen.tsx
import { ActivityRenderer } from '@/components/ActivityRenderer'
import React from 'react'
import { Text, View } from 'react-native'

export default function ActivityScreen({ route }) {
  const { atividadeId, classe, topico } = route.params
  const atividade = topico.atividades.find(a => a.id === atividadeId)

  if (!atividade) return <Text>Atividade não encontrada.</Text>

  return (
    <View style={{ flex: 1 }}>
      <ActivityRenderer atividade={atividade} topicoId={topico?.id} />
    </View>
  )
}
