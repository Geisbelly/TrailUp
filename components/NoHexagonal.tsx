import React from "react";
import { Pressable, Text } from "react-native";
import Svg, { Polygon } from "react-native-svg";

type HexNodeProps = {
  type: "locked" | "reward" | "active";
  label?: string;
  onPress?: () => void;
};

export function HexNode({ type, label, onPress }: HexNodeProps) {
  const getFill = () => {
    switch (type) {
      case "locked": return "#1E293B";
      case "reward": return "#334155";
      case "active": return "#4F46E5";
      default: return "#1E293B";
    }
  };

  return (
    <Pressable
      onPress={() => {
        if (type !== "locked" && onPress) {
          onPress();
        }
      }}
      style={{ alignItems: "center", justifyContent: "center" }}
    >
      <Svg height="100" width="90">
        <Polygon
          points="45,5 85,27 85,72 45,95 5,72 5,27"
          fill={getFill()}
          stroke="white"
          strokeWidth="2"
        />
      </Svg>

      <Text
        style={{
          position: "absolute",
          top: 35,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "white",
          fontWeight: "bold",
          fontSize: 20,
        }}
      >
        {type === "locked" ? "🔒" : type === "reward" ? "🎁" : label}
      </Text>
    </Pressable>
  );
}
