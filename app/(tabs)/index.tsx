import React, { useEffect, useRef } from "react";
import {
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { HexNode } from "../../components/NoHexagonal";

// --- UTILS DE RESPONSIVIDADE ---
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// Largura base do design original (ex: iPhone 13)
const GUIDELINE_BASE_WIDTH = 390;
const GUIDELINE_BASE_HEIGHT = 844;

/**
 * Escala um tamanho horizontalmente com base na largura da tela.
 * @param size O tamanho no design original.
 * @returns O tamanho ajustado para a tela atual.
 */
const hScale = (size) => (screenWidth / GUIDELINE_BASE_WIDTH) * size;

/**
 * Escala um tamanho verticalmente com base na altura da tela.
 * @param size O tamanho no design original.
 * @returns O tamanho ajustado para a tela atual.
 */
const vScale = (size) => (screenHeight / GUIDELINE_BASE_HEIGHT) * size;

// --- CONSTANTES RESPONSIVAS ---
// ANTES: const LEVEL_HEIGHT = 160;
const LEVEL_HEIGHT = vScale(160); // A altura do nível escala verticalmente

// ANTES: const NODE_SIZE = 60;
const NODE_SIZE = hScale(65); // O tamanho do nó escala com a largura

const BRANCH_LINE_WIDTH = hScale(80); // Largura da linha do ramo
const BRANCH_HORIZONTAL_OFFSET = hScale(145); // Distância do ramo ao centro

export default function LearningPathScreen() {
  const scrollViewRef = useRef(null);

  // ... (o restante da lógica do componente permanece o mesmo)
  const pathData = [
    { id: 1, main: { type: "active", label: "1" } },
    { id: 2, main: { type: "locked" } },
    { id: 3, main: { type: "locked" }, branch: { side: "right", type: "reward", label: "🎁" } },
    { id: 4, main: { type: "locked" } },
    { id: 5, main: { type: "locked" }, branch: { side: "left", type: "reward", label: "🎁" } },
    { id: 6, main: { type: "locked" } },
    { id: 7, main: { type: "locked" } },
  ];

  useEffect(() => {
    const activeNodeIndex = pathData.findIndex(item => item.main.type === "active");
    if (activeNodeIndex === -1 || !scrollViewRef.current) return;
    const reversedIndex = pathData.length - 1 - activeNodeIndex;
    setTimeout(() => {
      const scrollToY = reversedIndex * LEVEL_HEIGHT;
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: scrollToY, animated: true });
      }
    }, 200);
  }, []);

  const reversedPathData = [...pathData].reverse();

  return (
    <View style={styles.screenContainer}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>• CONTEÚDO •</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        snapToInterval={LEVEL_HEIGHT} // AGORA USA A CONSTANTE RESPONSIVA
        snapToAlignment="center"
        decelerationRate="fast"
      >
        {reversedPathData.map((level, index) => {
          const isFirstNode = index === reversedPathData.length - 1;

          return (
            <View key={level.id} style={styles.levelContainer}>
              {!isFirstNode && (
                <Svg height={LEVEL_HEIGHT} width="2" style={styles.verticalLine}>
                  <Line x1="1" y1="0" x2="1" y2={LEVEL_HEIGHT} stroke="white" strokeWidth="2" />
                </Svg>
              )}

              <View style={styles.mainNodeContainer}>
                {/* O HexNode também pode receber um 'size' como prop para ser responsivo */}
                <HexNode
                  type={level.main.type}
                  label={level.main.label}
                  size={NODE_SIZE} // Passando o tamanho responsivo para o componente
                  onPress={() => alert(`Nó ${level.main.label || level.id}`)}
                />

                {level.branch && (
                  <>
                    <Svg
                      height="2"
                      width={BRANCH_LINE_WIDTH}
                      style={[
                        styles.horizontalLine,
                        level.branch.side === "left"
                          ? { left: -BRANCH_LINE_WIDTH }
                          : { right: -BRANCH_LINE_WIDTH },
                      ]}
                    >
                      <Line x1="0" y1="1" x2={BRANCH_LINE_WIDTH} y2="1" stroke="white" strokeWidth="2" />
                    </Svg>
                    <View
                      style={[
                        styles.branchContainer,
                        level.branch.side === "left"
                          ? { left: -BRANCH_HORIZONTAL_OFFSET }
                          : { right: -BRANCH_HORIZONTAL_OFFSET },
                      ]}
                    >
                      <HexNode
                        type={level.branch.type}
                        label={level.branch.label}
                        size={NODE_SIZE} // Ramo também é responsivo
                        onPress={() => alert(`Recompensa!`)}
                      />
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// --- ESTILOS ATUALIZADOS COM VALORES RESPONSIVOS ---
const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#0D0D1A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: hScale(20),
    paddingTop: vScale(50),
    paddingBottom: vScale(10),
  },
  headerTitle: {
    color: "white",
    fontSize: hScale(18), // Fonte responsiva
    fontWeight: "bold",
    letterSpacing: 2,
  },
  headerIcon: {
    fontSize: hScale(24), // Ícone responsivo
    position: "absolute",
    right: hScale(25),
    top: vScale(48),
  },
  scrollContainer: {
    alignItems: "center",
    paddingTop: screenHeight / 2 - LEVEL_HEIGHT / 2,
    paddingBottom: screenHeight / 2 - LEVEL_HEIGHT / 2,
  },
  levelContainer: {
    height: LEVEL_HEIGHT,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  verticalLine: {
    position: "absolute",
    top: 0,
    zIndex: -1,
  },
  mainNodeContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  horizontalLine: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -1 }],
  },
  branchContainer: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -(NODE_SIZE/2) }], // Centraliza o nó na linha
  },
});