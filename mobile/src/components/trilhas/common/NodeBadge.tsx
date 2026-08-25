import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette } from './Palette';

export type NodeBadgeProps = {
  x: number; y: number; r?: number
  title?: string
  locked?: boolean
  completed?: boolean
  onPress?: ()=>void
}

export const NodeBadge: React.FC<NodeBadgeProps> = ({ x, y, r=18, title, locked, completed, onPress }) => {
  const color = completed ? Palette.good : (locked ? Palette.lock : Palette.primary)
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={[s.wrap, { left: x - r - 12, top: y - r - 12, width: (r+12)*2, height: (r+12)*2 }]}
    >
      <View style={[s.glow, { width:r*2+10, height:r*2+10, borderRadius:r+5, backgroundColor: color+'33' }]} />
      <View style={[s.dot, { width: r*2, height:r*2, borderRadius: r, backgroundColor: color }]} />
      {!!title && <Text numberOfLines={1} style={s.label}>{title}</Text>}
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap:{ position:'absolute', alignItems:'center', justifyContent:'center' },
  glow:{ position:'absolute' },
  dot:{ alignItems:'center', justifyContent:'center' },
  label:{ position:'absolute', top:'100%', marginTop:6, color:'#fff', fontSize:12, maxWidth:140, textAlign:'center' }
})
