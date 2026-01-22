/**
 * 3D Knowledge Graph Visualization using Three.js
 * Adapted from Oracle v2's Graph3D.tsx (simplified, without hand tracking)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { GraphNode, GraphLink } from '../../api/client';

interface Graph3DProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  width?: number;
  height?: number;
}

// File type color scheme
const TYPE_COLORS: Record<string, number> = {
  pdf: 0xef4444,
  docx: 0x3b82f6,
  pptx: 0xf97316,
  xlsx: 0x22c55e,
  md: 0x8b5cf6,
  txt: 0x6b7280,
  html: 0x06b6d4,
  csv: 0x84cc16,
  json: 0xeab308,
};

interface Node3D extends GraphNode {
  mesh?: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export default function Graph3D({ nodes, links, onNodeClick, width = 800, height = 600 }: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesRef = useRef<Node3D[]>([]);
  const linesRef = useRef<THREE.Line[]>([]);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    camera.position.z = 400;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Point light
    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(100, 100, 200);
    scene.add(pointLight);

    // Initialize nodes with 3D positions
    const node3DList: Node3D[] = nodes.map(node => {
      const position = new THREE.Vector3(
        (Math.random() - 0.5) * 300,
        (Math.random() - 0.5) * 300,
        (Math.random() - 0.5) * 300
      );

      const color = TYPE_COLORS[node.type] || 0x6b7280;
      const geometry = new THREE.SphereGeometry(5, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.userData = { nodeId: node.id };
      scene.add(mesh);

      return {
        ...node,
        mesh,
        position,
        velocity: new THREE.Vector3(0, 0, 0),
      };
    });
    nodesRef.current = node3DList;

    // Create links
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x475569,
      transparent: true,
      opacity: 0.3,
    });

    const lineObjects: THREE.Line[] = [];
    links.forEach(link => {
      const source = node3DList.find(n => n.id === link.source);
      const target = node3DList.find(n => n.id === link.target);
      if (!source || !target) return;

      const points = [source.position, target.position];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, lineMaterial);
      line.userData = { sourceId: link.source, targetId: link.target, weight: link.weight };
      scene.add(line);
      lineObjects.push(line);
    });
    linesRef.current = lineObjects;

    // Animation loop
    let time = 0;
    function animate() {
      time += 0.01;

      // Apply forces
      const alpha = 0.15;

      // Repulsion between nodes
      for (let i = 0; i < node3DList.length; i++) {
        for (let j = i + 1; j < node3DList.length; j++) {
          const diff = new THREE.Vector3().subVectors(
            node3DList[j].position,
            node3DList[i].position
          );
          const dist = diff.length() || 1;
          const force = (150 / (dist * dist)) * alpha;
          diff.normalize().multiplyScalar(force);

          node3DList[i].velocity.sub(diff);
          node3DList[j].velocity.add(diff);
        }
      }

      // Attraction along links
      links.forEach(link => {
        const source = node3DList.find(n => n.id === link.source);
        const target = node3DList.find(n => n.id === link.target);
        if (!source || !target) return;

        const diff = new THREE.Vector3().subVectors(target.position, source.position);
        const dist = diff.length();
        const force = (dist - 60) * 0.005 * alpha * link.weight;
        diff.normalize().multiplyScalar(force);

        source.velocity.add(diff);
        target.velocity.sub(diff);
      });

      // Center gravity
      node3DList.forEach(node => {
        const force = node.position.clone().multiplyScalar(-0.005 * alpha);
        node.velocity.add(force);
      });

      // Update positions with damping
      node3DList.forEach(node => {
        node.velocity.multiplyScalar(0.9);
        node.position.add(node.velocity);
        if (node.mesh) {
          node.mesh.position.copy(node.position);
          // Subtle breathing effect
          const scale = 1 + Math.sin(time * 2 + node.position.x * 0.01) * 0.05;
          node.mesh.scale.setScalar(scale);
        }
      });

      // Update line positions
      linesRef.current.forEach(line => {
        const source = node3DList.find(n => n.id === line.userData.sourceId);
        const target = node3DList.find(n => n.id === line.userData.targetId);
        if (source && target) {
          const positions = line.geometry.attributes.position as THREE.BufferAttribute;
          positions.setXYZ(0, source.position.x, source.position.y, source.position.z);
          positions.setXYZ(1, target.position.x, target.position.y, target.position.z);
          positions.needsUpdate = true;
        }
      });

      // Apply rotation from mouse drag
      scene.rotation.y = rotationRef.current.x * 0.005;
      scene.rotation.x = rotationRef.current.y * 0.005;

      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [nodes, links, width, height]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      rotationRef.current.x += dx;
      rotationRef.current.y += dy;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    }
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (cameraRef.current) {
      cameraRef.current.position.z += e.deltaY * 0.5;
      cameraRef.current.position.z = Math.max(100, Math.min(800, cameraRef.current.position.z));
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / width) * 2 - 1,
      -((e.clientY - rect.top) / height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = nodesRef.current.map(n => n.mesh).filter(Boolean) as THREE.Mesh[];
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const nodeId = intersects[0].object.userData.nodeId;
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
        onNodeClick?.(node);
      }
    } else {
      setSelectedNode(null);
    }
  }, [width, height, onNodeClick]);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!cameraRef.current) return;

      switch (e.key) {
        case 'ArrowUp':
          cameraRef.current.position.z -= 20;
          break;
        case 'ArrowDown':
          cameraRef.current.position.z += 20;
          break;
        case 'r':
          rotationRef.current = { x: 0, y: 0 };
          cameraRef.current.position.z = 400;
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      {/* Controls hint */}
      <div className="absolute top-4 right-4 bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-slate-400">
        <p>Drag to rotate</p>
        <p>Scroll to zoom</p>
        <p>R to reset view</p>
      </div>

      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 text-white max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: `#${(TYPE_COLORS[selectedNode.type] || 0x6b7280).toString(16).padStart(6, '0')}` }}
            />
            <span className="text-xs uppercase text-slate-400">{selectedNode.type}</span>
          </div>
          <p className="font-medium text-sm">{selectedNode.label}</p>
          <p className="text-xs text-slate-400 mt-1">
            {selectedNode.chunkCount} chunks
            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <span> · {selectedNode.tags.slice(0, 3).join(', ')}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
