/**
 * 2D Knowledge Graph Visualization using Canvas
 * Adapted from Oracle v2's Graph.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GraphNode, GraphLink } from '../../api/client';

interface Graph2DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  width?: number;
  height?: number;
}

// File type color scheme
const TYPE_COLORS: Record<string, string> = {
  pdf: '#ef4444',
  docx: '#3b82f6',
  pptx: '#f97316',
  xlsx: '#22c55e',
  md: '#8b5cf6',
  txt: '#6b7280',
  html: '#06b6d4',
  csv: '#84cc16',
  json: '#eab308',
};

export default function Graph2D({ nodes, links, onNodeClick, width = 800, height = 600 }: Graph2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localNodes, setLocalNodes] = useState<GraphNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const animationRef = useRef<number>(0);
  const hoveredNodeRef = useRef<GraphNode | null>(null);

  // Initialize node positions
  useEffect(() => {
    if (nodes.length === 0) return;

    const centerX = width / 2;
    const centerY = height / 2;
    const initializedNodes = nodes.map(n => ({
      ...n,
      x: n.x ?? centerX + (Math.random() - 0.5) * 300,
      y: n.y ?? centerY + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
    }));

    setLocalNodes(initializedNodes);
  }, [nodes, width, height]);

  // Force-directed simulation
  useEffect(() => {
    if (localNodes.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    let revealProgress = 0;
    const revealDuration = 3;

    function simulate() {
      time += 0.02;

      // Gradually reveal links
      if (revealProgress < 1) {
        revealProgress = Math.min(1, revealProgress + (0.02 / revealDuration));
      }

      const alpha = 0.3;

      // Add subtle random jitter
      localNodes.forEach(node => {
        node.vx! += (Math.random() - 0.5) * 0.3;
        node.vy! += (Math.random() - 0.5) * 0.3;
      });

      // Repulsion between nodes
      for (let i = 0; i < localNodes.length; i++) {
        for (let j = i + 1; j < localNodes.length; j++) {
          const dx = localNodes[j].x! - localNodes[i].x!;
          const dy = localNodes[j].y! - localNodes[i].y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (120 / dist) * alpha;

          localNodes[i].vx! -= (dx / dist) * force;
          localNodes[i].vy! -= (dy / dist) * force;
          localNodes[j].vx! += (dx / dist) * force;
          localNodes[j].vy! += (dy / dist) * force;
        }
      }

      // Attraction along links
      links.forEach(link => {
        const source = localNodes.find(n => n.id === link.source);
        const target = localNodes.find(n => n.id === link.target);
        if (!source || !target) return;

        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.008 * alpha * link.weight;

        source.vx! += (dx / dist) * force;
        source.vy! += (dy / dist) * force;
        target.vx! -= (dx / dist) * force;
        target.vy! -= (dy / dist) * force;
      });

      // Center gravity
      localNodes.forEach(node => {
        node.vx! += (width / 2 - node.x!) * 0.008 * alpha;
        node.vy! += (height / 2 - node.y!) * 0.008 * alpha;
      });

      // Update positions with damping
      localNodes.forEach(node => {
        node.vx! *= 0.92;
        node.vy! *= 0.92;
        node.x! += node.vx!;
        node.y! += node.vy!;
      });

      // Keep nodes in bounds with soft boundaries
      localNodes.forEach(node => {
        const padding = 40;
        if (node.x! < padding) node.x! = padding;
        if (node.x! > width - padding) node.x! = width - padding;
        if (node.y! < padding) node.y! = padding;
        if (node.y! > height - padding) node.y! = height - padding;
      });

      draw(time, revealProgress);
      animationRef.current = requestAnimationFrame(simulate);
    }

    function draw(time: number, revealProgress: number) {
      if (!ctx) return;

      // Dark background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Draw links with reveal effect
      const visibleLinks = Math.floor(links.length * revealProgress);
      ctx.lineWidth = 0.5;

      links.slice(0, visibleLinks).forEach((link, i) => {
        const source = localNodes.find(n => n.id === link.source);
        const target = localNodes.find(n => n.id === link.target);
        if (!source || !target) return;

        const linkRevealPoint = i / links.length;
        const fadeIn = Math.min(1, (revealProgress - linkRevealPoint) * 10);
        const opacity = 0.15 * fadeIn * link.weight;

        ctx.strokeStyle = `rgba(148, 163, 184, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(source.x!, source.y!);
        ctx.lineTo(target.x!, target.y!);
        ctx.stroke();

        // Animated traveling dot
        const speed = 0.2 + (i % 5) * 0.08;
        const offset = (i * 0.1) % 1;
        const t = ((time * speed + offset) % 1);
        const dotX = source.x! + (target.x! - source.x!) * t;
        const dotY = source.y! + (target.y! - source.y!) * t;

        ctx.fillStyle = `rgba(139, 92, 246, ${0.5 * fadeIn})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw nodes
      const nodeAlpha = Math.min(1, revealProgress * 3);
      localNodes.forEach(node => {
        const color = TYPE_COLORS[node.type] || '#6b7280';
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const radius = isHovered || isSelected ? 8 : 5;

        // Node glow for hovered/selected
        if (isHovered || isSelected) {
          const gradient = ctx.createRadialGradient(
            node.x!, node.y!, 0,
            node.x!, node.y!, radius * 3
          );
          gradient.addColorStop(0, `${color}40`);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, radius * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node circle
        ctx.fillStyle = color;
        ctx.globalAlpha = nodeAlpha;
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label for hovered node
        if (isHovered || isSelected) {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x!, node.y! - radius - 8);
        }
      });
    }

    simulate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [localNodes, links, selectedNode, width, height]);

  // Handle mouse events
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hovered = localNodes.find(n => {
      const dx = n.x! - x;
      const dy = n.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < 12;
    });

    hoveredNodeRef.current = hovered || null;
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  }, [localNodes]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clicked = localNodes.find(n => {
      const dx = n.x! - x;
      const dy = n.y! - y;
      return Math.sqrt(dx * dx + dy * dy) < 12;
    });

    if (clicked) {
      setSelectedNode(clicked);
      setTooltipPosition({ x, y });
      onNodeClick?.(clicked);
    } else {
      setSelectedNode(null);
      setTooltipPosition(null);
    }
  }, [localNodes, onNodeClick]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        className="rounded-lg"
      />
      {selectedNode && tooltipPosition && (
        <div
          className="absolute z-50 bg-slate-800/95 backdrop-blur-sm rounded-lg p-3 text-white max-w-xs shadow-xl border border-slate-700"
          style={{
            left: Math.min(tooltipPosition.x + 15, width - 200),
            top: Math.max(tooltipPosition.y - 60, 10),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[selectedNode.type] || '#6b7280' }}
            />
            <span className="text-xs uppercase text-slate-400">{selectedNode.type}</span>
          </div>
          <p className="font-medium text-sm truncate">{selectedNode.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            {selectedNode.chunkCount} chunks
            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <span> · {selectedNode.tags.slice(0, 3).join(', ')}</span>
            )}
          </p>
          <p className="text-xs text-blue-400 mt-2">Click again for details</p>
        </div>
      )}
    </div>
  );
}
