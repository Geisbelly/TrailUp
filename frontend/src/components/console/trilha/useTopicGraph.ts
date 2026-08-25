import { useMemo, useRef, useState, useCallback } from "react";
import type { Topico } from "./types";

type ConnectorType = "next" | "depende";

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.15;

export function useTopicGraph(
  topicos: Topico[],
  setTopicos: React.Dispatch<React.SetStateAction<Topico[]>>,
  onInvalidLink?: (from?: Topico, to?: Topico) => void
) {
  const [selectedEdge, setSelectedEdge] = useState<{ from: number; to: number; type: ConnectorType } | null>(null);
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [canvasOffset, setCanvasOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggingConnector, setDraggingConnector] = useState<{ fromId: number | null; type: ConnectorType | null }>({ fromId: null, type: null });
  const [connectorPos, setConnectorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const draggingNodeRef = useRef<{ id: number; startNodeX: number; startNodeY: number; startMouseX: number; startMouseY: number } | null>(null);
  const panRef = useRef<{ startMouseX: number; startMouseY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 140;

  // ── Graph mutations ──────────────────────────────────────────────────────
  const connectNodes = (fromId: number, toId: number, type: ConnectorType) => {
    if (fromId === toId) return;
    const from = topicos.find((t) => t.id === fromId);
    const to = topicos.find((t) => t.id === toId);
    if (!from || !to) return;
    if (from.classe_id !== to.classe_id) { onInvalidLink?.(from, to); return; }

    if (type === "depende" && from.depende.includes(toId)) {
      if (!window.confirm("Conflito: já depende do alvo. Remover dependência inversa?")) return;
    }
    if (type === "next" && to.next.includes(fromId)) {
      if (!window.confirm("Conflito: alvo já marcado como próximo do atual. Remover vínculo inverso?")) return;
    }

    setTopicos((prev) => prev.map((t) => {
      if (type === "next" && t.id === fromId) return { ...t, next: t.next.includes(toId) ? t.next : [...t.next, toId], depende: t.depende.filter((d) => d !== toId) };
      if (type === "next" && t.id === toId) return { ...t, next: t.next.filter((n) => n !== fromId) };
      if (type === "depende" && t.id === toId) return { ...t, depende: t.depende.includes(fromId) ? t.depende : [...t.depende, fromId], next: t.next.filter((n) => n !== fromId) };
      if (type === "depende" && t.id === fromId) return { ...t, depende: t.depende.filter((d) => d !== toId) };
      return t;
    }));
  };

  const removeLink = (fromId: number, toId: number, type: ConnectorType) => {
    setTopicos((prev) => prev.map((t) => {
      if (type === "next" && t.id === fromId) return { ...t, next: t.next.filter((n) => n !== toId) };
      if (type === "depende" && t.id === toId) return { ...t, depende: t.depende.filter((n) => n !== fromId) };
      return t;
    }));
  };

  // ── Zoom ─────────────────────────────────────────────────────────────────
  /** Zoom centrado num ponto do viewport (px, py em coordenadas do canvas) */
  const applyZoom = useCallback((nextZoom: number, pivotX: number, pivotY: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
    setZoom((prev) => {
      const scale = clamped / prev;
      setCanvasOffset((off) => ({
        x: pivotX - (pivotX - off.x) * scale,
        y: pivotY - (pivotY - off.y) * scale,
      }));
      return clamped;
    });
  }, []);

  const zoomIn = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    setZoom((prev) => {
      const next = Math.min(ZOOM_MAX, parseFloat((prev + ZOOM_STEP).toFixed(2)));
      const scale = next / prev;
      setCanvasOffset((off) => ({
        x: cx - (cx - off.x) * scale,
        y: cy - (cy - off.y) * scale,
      }));
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    setZoom((prev) => {
      const next = Math.max(ZOOM_MIN, parseFloat((prev - ZOOM_STEP).toFixed(2)));
      const scale = next / prev;
      setCanvasOffset((off) => ({
        x: cx - (cx - off.x) * scale,
        y: cy - (cy - off.y) * scale,
      }));
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setCanvasOffset({ x: 0, y: 0 });
  }, []);

  // ── Wheel zoom ───────────────────────────────────────────────────────────
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pivotX = e.clientX - rect.left;
    const pivotY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((prev) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parseFloat((prev + delta).toFixed(2))));
      const scale = next / prev;
      setCanvasOffset((off) => ({
        x: pivotX - (pivotX - off.x) * scale,
        y: pivotY - (pivotY - off.y) * scale,
      }));
      return next;
    });
  }, []);

  // ── Node pointer drag ────────────────────────────────────────────────────
  const handleNodePointerDown = useCallback(
    (id: number) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("a")) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = positions[id] ?? { x: 0, y: 0 };
      draggingNodeRef.current = { id, startNodeX: pos.x, startNodeY: pos.y, startMouseX: e.clientX, startMouseY: e.clientY };
    },
    [positions]
  );

  const handleNodePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingNodeRef.current) return;
    const { id, startNodeX, startNodeY, startMouseX, startMouseY } = draggingNodeRef.current;
    // Divide by zoom so dragging speed matches visual node position
    setZoom((z) => {
      setPositions((prev) => ({
        ...prev,
        [id]: {
          x: Math.max(0, startNodeX + (e.clientX - startMouseX) / z),
          y: Math.max(0, startNodeY + (e.clientY - startMouseY) / z),
        },
      }));
      return z;
    });
  }, []);

  const handleNodePointerUp = useCallback(
    (id: number) => (_e: React.PointerEvent) => {
      if (draggingConnector.fromId && draggingConnector.type) {
        connectNodes(draggingConnector.fromId, id, draggingConnector.type);
        setDraggingConnector({ fromId: null, type: null });
      }
      draggingNodeRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggingConnector]
  );

  // ── Canvas pan ───────────────────────────────────────────────────────────
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-node]") || target.closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { startMouseX: e.clientX, startMouseY: e.clientY, startOffsetX: canvasOffset.x, startOffsetY: canvasOffset.y };
  }, [canvasOffset]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (panRef.current) {
      setCanvasOffset({
        x: panRef.current.startOffsetX + e.clientX - panRef.current.startMouseX,
        y: panRef.current.startOffsetY + e.clientY - panRef.current.startMouseY,
      });
    }
    if (draggingConnector.fromId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setZoom((z) => {
          setConnectorPos({
            x: (e.clientX - rect.left - canvasOffset.x) / z,
            y: (e.clientY - rect.top - canvasOffset.y) / z,
          });
          return z;
        });
      }
    }
  }, [draggingConnector.fromId, canvasOffset]);

  const handleCanvasPointerUp = useCallback(() => {
    panRef.current = null;
    setDraggingConnector({ fromId: null, type: null });
  }, []);

  // ── Connector start ──────────────────────────────────────────────────────
  const startConnector = (id: number, type: ConnectorType) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingConnector({ fromId: id, type });
    const pos = positions[id];
    if (pos) {
      setConnectorPos({
        x: type === "next" ? pos.x + NODE_WIDTH : pos.x,
        y: pos.y + NODE_HEIGHT / 2,
      });
    }
  };

  const handleNodeMouseUp = (id: number) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (draggingConnector.fromId && draggingConnector.type) {
      connectNodes(draggingConnector.fromId, id, draggingConnector.type);
      setDraggingConnector({ fromId: null, type: null });
    }
  };

  // ── SVG helpers ──────────────────────────────────────────────────────────
  const getDynamicAnchors = useMemo(
    () => (fromId: number, toId: number) => {
      const from = positions[fromId] || { x: 0, y: 0 };
      const to = positions[toId] || { x: 0, y: 0 };
      return {
        start: { x: from.x + NODE_WIDTH, y: from.y + NODE_HEIGHT / 2 },
        end: { x: to.x, y: to.y + NODE_HEIGHT / 2 },
      };
    },
    [positions]
  );

  const buildPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = Math.max(Math.abs(end.x - start.x) * 0.6, 60);
    return `M ${start.x},${start.y} C ${start.x + dx},${start.y} ${end.x - dx},${end.y} ${end.x},${end.y}`;
  };

  return {
    canvasRef,
    positions,
    setPositions,
    canvasOffset,
    setCanvasOffset,
    zoom,
    zoomIn,
    zoomOut,
    resetView,
    applyZoom,
    handleCanvasWheel,
    selectedEdge,
    setSelectedEdge,
    draggingConnector,
    connectorPos,
    NODE_WIDTH,
    NODE_HEIGHT,
    connectNodes,
    removeLink,
    handleNodePointerDown,
    handleNodePointerMove,
    handleNodePointerUp,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    getDynamicAnchors,
    buildPath,
    startConnector,
    handleNodeMouseUp,
  };
}
