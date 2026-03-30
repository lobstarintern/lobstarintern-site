"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";

interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphEdge {
  from: string;
  to: string;
  amount: number;
  token: string;
  signatures: string[];
  count: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cached: boolean;
  timestamp: string;
}

const TYPE_COLORS: Record<string, string> = {
  main: "#22c55e",
  secondary: "#3b82f6",
  unknown: "#52525b",
};

const TYPE_LABELS: Record<string, string> = {
  main: "Main",
  secondary: "Secondary",
  unknown: "External",
};

function truncAddr(addr: string): string {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

function nodeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.unknown;
}

export default function WalletTracker() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setGraphData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Layout nodes — tracked wallets center, externals on outer ring
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graphData) return { flowNodes: [], flowEdges: [] };

    const typeOrder = ["main", "secondary", "unknown"];
    const grouped: Record<string, GraphNode[]> = {};
    for (const node of graphData.nodes) {
      const t = node.type || "unknown";
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(node);
    }

    const positioned: Node[] = [];
    let ringIndex = 0;
    for (const type of typeOrder) {
      const nodes = grouped[type];
      if (!nodes?.length) continue;

      if (type === "main") {
        // Center the main wallet
        nodes.forEach((node) => {
          positioned.push({
            id: node.id,
            position: { x: 600, y: 400 },
            data: {
              label: (
                <div className="text-center">
                  <div className="text-[10px] font-bold">{node.label}</div>
                  <div className="text-[8px] opacity-60">{truncAddr(node.id)}</div>
                </div>
              ),
            },
            style: {
              background: nodeColor(node.type),
              color: "#fff",
              border: `2px solid ${nodeColor(node.type)}`,
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "10px",
              minWidth: "100px",
              textAlign: "center" as const,
              boxShadow: `0 0 20px ${nodeColor(node.type)}40`,
            },
          });
        });
        ringIndex++;
        continue;
      }

      const radius = 150 + ringIndex * 220;
      const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1);
      const offset = ringIndex * 0.5;
      nodes.forEach((node, i) => {
        const angle = angleStep * i + offset;
        positioned.push({
          id: node.id,
          position: {
            x: 600 + radius * Math.cos(angle),
            y: 400 + radius * Math.sin(angle),
          },
          data: {
            label: (
              <div className="text-center">
                <div className="text-[10px] font-bold">{node.label}</div>
                <div className="text-[8px] opacity-60">{truncAddr(node.id)}</div>
              </div>
            ),
          },
          style: {
            background: nodeColor(node.type),
            color: "#fff",
            border: `2px solid ${nodeColor(node.type)}`,
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "10px",
            minWidth: "80px",
            textAlign: "center" as const,
          },
        });
      });
      ringIndex++;
    }

    const edges = graphData.edges.map((edge, i) => {
      const amtLabel =
        edge.amount > 0.001
          ? `${edge.amount.toFixed(edge.token === "SOL" ? 2 : 0)} ${edge.token === "SOL" ? "SOL" : truncAddr(edge.token)}`
          : edge.token === "SOL" ? "SOL" : truncAddr(edge.token);
      return {
        id: `e-${i}`,
        source: edge.from,
        target: edge.to,
        label: amtLabel,
        animated: edge.count > 1,
        style: {
          stroke: edge.token === "SOL" ? "#a78bfa" : "#4ade80",
          strokeWidth: Math.min(Math.max(Math.log(edge.amount + 1), 1), 4),
        },
        labelStyle: { fill: "#a1a1aa", fontSize: 9 },
        labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#52525b", width: 12, height: 12 },
        data: edge,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { flowNodes: positioned, flowEdges: edges as any as Edge[] };
  }, [graphData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const gNode = graphData?.nodes.find((n) => n.id === node.id);
      setSelectedNode(gNode || null);
      setSelectedEdge(null);
    },
    [graphData],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.data as unknown as GraphEdge);
      setSelectedNode(null);
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-zinc-500 hover:text-white transition-colors text-sm"
            >
              Home
            </Link>
            <span className="text-zinc-800">|</span>
            <span className="text-white text-sm">Wallet Tracker</span>
          </div>
          <h1 className="text-white font-bold mt-1">
            Wallet Tracker &mdash; @LobstarWilde
          </h1>
          <p className="text-zinc-600 text-xs mt-1">
            Tracking {graphData?.nodes.length || "..."} wallets across the ecosystem
            {graphData?.cached && " (cached)"}
          </p>
        </div>
        {/* Legend */}
        <div className="flex gap-3 text-[10px]">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-zinc-500">{TYPE_LABELS[type] || type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Explainer */}
      <div className="px-6 py-3 border-b border-zinc-900/50 text-xs text-zinc-600 max-w-2xl leading-relaxed">
        Live map of @LobstarWilde&apos;s on-chain activity. Green lines are $LOBSTAR transfers, purple lines are SOL
        transfers (&ge;10 SOL). Grey nodes are external wallets that sent or received funds. Data refreshes hourly
        via Helius.
      </div>

      {/* Wallet summary bar */}
      <div className="px-6 py-3 border-b border-zinc-900/50 flex gap-6 text-xs overflow-x-auto">
        {[
          { label: "LobstarWilde.sol", addr: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS", color: TYPE_COLORS.main },
          { label: "Secondary A", addr: "C41sWzRvikSo3KH6U8zoejJ7cN5Ctv2ToT5B22U2M4N2", color: TYPE_COLORS.secondary },
          { label: "Secondary B", addr: "Cv9St5tDTGwpbG5UVvM6QvFmf3FYSXc14W9BYvQN5wAZ", color: TYPE_COLORS.secondary },
          { label: "Secondary C", addr: "H292B1VbSvD6GuUmSvUvfQstg1Acfzog796uQ7d1ccCw", color: TYPE_COLORS.secondary },
        ].map((w) => (
          <a
            key={w.addr}
            href={`https://solscan.io/account/${w.addr}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white transition-colors text-zinc-500 whitespace-nowrap"
          >
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: w.color }} />
            <span className="font-bold">{w.label}</span>
            <span className="text-zinc-700">{truncAddr(w.addr)}</span>
          </a>
        ))}
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm animate-pulse">
              Loading wallet data...
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500/60 text-sm">{error}</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1a1a1a" gap={20} />
            <Controls
              style={{ background: "#18181b", borderColor: "#27272a" }}
            />
            <MiniMap
              nodeColor={(n) => n.style?.background as string || "#52525b"}
              maskColor="rgba(0,0,0,0.8)"
              style={{ background: "#0a0a0a", borderColor: "#27272a" }}
            />
          </ReactFlow>
        )}

        {/* Detail panel */}
        {(selectedNode || selectedEdge) && (
          <div className="absolute top-4 right-4 w-72 bg-zinc-950 border border-zinc-800 rounded p-4 text-xs">
            <button
              onClick={() => {
                setSelectedNode(null);
                setSelectedEdge(null);
              }}
              className="absolute top-2 right-3 text-zinc-600 hover:text-white cursor-pointer"
            >
              x
            </button>
            {selectedNode && (
              <>
                <h3 className="text-white font-bold mb-2">
                  {selectedNode.label}
                </h3>
                <div className="space-y-1 text-zinc-400">
                  <p>
                    Type:{" "}
                    <span
                      className="font-bold"
                      style={{ color: nodeColor(selectedNode.type) }}
                    >
                      {TYPE_LABELS[selectedNode.type] || selectedNode.type}
                    </span>
                  </p>
                  <p className="break-all text-zinc-600">{selectedNode.id}</p>
                  <a
                    href={`https://solscan.io/account/${selectedNode.id}`}
                    className="block text-zinc-500 hover:text-white mt-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Solscan →
                  </a>
                </div>
              </>
            )}
            {selectedEdge && (
              <>
                <h3 className="text-white font-bold mb-2">Transfer</h3>
                <div className="space-y-1 text-zinc-400">
                  <p>
                    Amount:{" "}
                    <span className="text-white">
                      {selectedEdge.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}{" "}
                      {selectedEdge.token === "SOL" ? "SOL" : truncAddr(selectedEdge.token)}
                    </span>
                  </p>
                  <p>Transactions: {selectedEdge.count}</p>
                  <p className="text-zinc-600 break-all">
                    From: {truncAddr(selectedEdge.from)}
                  </p>
                  <p className="text-zinc-600 break-all">
                    To: {truncAddr(selectedEdge.to)}
                  </p>
                  {selectedEdge.signatures?.slice(0, 3).map((sig) => (
                    <a
                      key={sig}
                      href={`https://solscan.io/tx/${sig}`}
                      className="block text-zinc-500 hover:text-white truncate"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {truncAddr(sig)} →
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
