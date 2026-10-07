import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import * as d3 from "d3";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Search, 
  BrainCircuit, 
  Maximize2,
  Minimize2,
  Share2,
  Layers,
  Sparkles,
  Link as LinkIcon,
  Tag,
  Info,
  SlidersHorizontal,
  X,
  Target,
  Compass,
  FolderKanban,
  Eye,
  Filter,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Palette,
  Move,
  Lock,
  Unlock,
  Check,
  CheckSquare,
  Square,
  LocateFixed,
  FileText,
  Terminal,
  Code2,
  Cpu,
  AlertTriangle,
  Globe,
  Scan,
  Network,
  Boxes,
  PinOff,
  Route,
  ArrowRight,
  GraduationCap,
  Rss,
  StickyNote,
  LayoutGrid,
  List,
  Camera,
  Download,
  Workflow
} from "lucide-react";
import { ResourceItem, GraphNode, GraphLink, ResourceType, OKFEntity, ViewMode } from "../types";
import { parseSearchQuery, evaluateResourceSearch } from "../lib/searchEngine";
import { calculateResourceAffinity, identifyRelatedResources } from "../lib/relatedResourcesEngine";

interface KnowledgeGraphProps {
  resources: ResourceItem[];
  onSelectResource: (resource: ResourceItem) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onOpenIntelligence?: () => void;
  focusedResourceId?: string | null;
  onClearFocusedResource?: () => void;
}

export type GraphScopeMode = "hubs" | "focus" | "domain" | "all";
export type RelationFilterMode = "explicit" | "entities" | "tags" | "overlap" | "all";

// Color mapping per node type (module-level pure helpers)
export const getNodeColor = (type: ResourceType | "concept" | "entity" | string) => {
  switch (type) {
    case "troubleshooting":
      return "#F97316"; // Bright Orange for Troubleshooting
    case "procedure":
      return "#06B6D4"; // Bright Cyan / Turquoise for SOP & Playbooks
    case "knowledge":
      return "#C5A059"; // Champagne gold for OKF Knowledge
    case "paper":
      return "#818CF8"; // Indigo for Papers
    case "rss":
      return "#FB923C"; // Coral orange for RSS
    case "note":
      return "#FBBF24"; // Amber yellow for Notes
    case "mcp_server":
      return "#38BDF8"; // Cyan for MCP
    case "github_repo":
      return "#A855F7"; // Purple for GitHub
    case "ai_skill":
      return "#10B981"; // Emerald for AI Skills
    case "concept":
    case "entity":
      return "#60A5FA"; // Bright Blue for Concept Hubs
    case "article":
    case "link":
    default:
      return "#F59E0B"; // Amber for Articles / Links
  }
};

export const getNodeTypeIcon = (type: ResourceType | string) => {
  switch (type) {
    case "troubleshooting":
      return <AlertTriangle className="w-3.5 h-3.5 text-[#F97316]" />;
    case "procedure":
      return <Workflow className="w-3.5 h-3.5 text-[#06B6D4]" />;
    case "knowledge":
      return <FileText className="w-3.5 h-3.5 text-[#C5A059]" />;
    case "paper":
      return <GraduationCap className="w-3.5 h-3.5 text-[#818CF8]" />;
    case "rss":
      return <Rss className="w-3.5 h-3.5 text-[#FB923C]" />;
    case "note":
      return <StickyNote className="w-3.5 h-3.5 text-[#FBBF24]" />;
    case "mcp_server":
      return <Terminal className="w-3.5 h-3.5 text-[#38BDF8]" />;
    case "github_repo":
      return <Code2 className="w-3.5 h-3.5 text-[#A855F7]" />;
    case "ai_skill":
      return <Cpu className="w-3.5 h-3.5 text-[#10B981]" />;
    case "article":
    case "link":
    default:
      return <Globe className="w-3.5 h-3.5 text-[#F59E0B]" />;
  }
};

export interface PathwayResult {
  pathNodeIds: string[];
  pathLinks: any[];
  steps: { fromTitle: string; toTitle: string; relationType?: string }[];
}

// Module-level pure BFS algorithm for finding the shortest semantic pathway between two nodes
export function findShortestPath(
  nodes: GraphNode[],
  links: GraphLink[],
  startId: string,
  endId: string
): PathwayResult | null {
  if (!startId || !endId) return null;
  if (startId === endId) return { pathNodeIds: [startId], pathLinks: [], steps: [] };

  const adjacency = new Map<string, { neighborId: string; link: GraphLink }[]>();
  for (const n of nodes) {
    adjacency.set(n.id, []);
  }

  for (const l of links) {
    const sId = typeof l.source === "object" ? (l.source as any).id : l.source;
    const tId = typeof l.target === "object" ? (l.target as any).id : l.target;
    if (adjacency.has(sId) && adjacency.has(tId)) {
      adjacency.get(sId)!.push({ neighborId: tId, link: l });
      adjacency.get(tId)!.push({ neighborId: sId, link: l });
    }
  }

  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const parent = new Map<string, { prevNodeId: string; viaLink: GraphLink }>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === endId) break;

    const neighbors = adjacency.get(curr) || [];
    for (const { neighborId, link } of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        parent.set(neighborId, { prevNodeId: curr, viaLink: link });
        queue.push(neighborId);
      }
    }
  }

  if (!parent.has(endId)) return null;

  // Trace back the shortest path
  const pathNodeIds: string[] = [];
  const pathLinks: GraphLink[] = [];
  const steps: { fromTitle: string; toTitle: string; relationType?: string }[] = [];
  let curr = endId;
  pathNodeIds.unshift(curr);

  while (curr !== startId) {
    const p = parent.get(curr)!;
    pathLinks.unshift(p.viaLink);
    const prev = p.prevNodeId;
    const fromNode = nodes.find((n) => n.id === prev);
    const toNode = nodes.find((n) => n.id === curr);
    steps.unshift({
      fromTitle: fromNode?.title || prev,
      toTitle: toNode?.title || curr,
      relationType: p.viaLink.relationType || p.viaLink.label || "collegamento",
    });
    curr = prev;
    pathNodeIds.unshift(curr);
  }

  return { pathNodeIds, pathLinks, steps };
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  resources,
  onSelectResource,
  selectedTag,
  onSelectTag,
  onOpenIntelligence,
  focusedResourceId,
  onClearFocusedResource,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationNodesRef = useRef<any[]>([]);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);

  // Core Exploration & Scope State
  const [scopeMode, setScopeMode] = useState<GraphScopeMode>("hubs");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Sync external focusedResourceId if supplied
  useEffect(() => {
    if (focusedResourceId) {
      setFocusedNodeId(focusedResourceId);
      setScopeMode("focus");
    }
  }, [focusedResourceId]);
  const [connectionDepth, setConnectionDepth] = useState<1 | 2>(1);
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [maxNodesLimit, setMaxNodesLimit] = useState<number>(15);

  const [relationFilterMode, setRelationFilterMode] = useState<RelationFilterMode>("all");

  // Cluster Drag & Node Movement State
  const [dragClusterMode, setDragClusterMode] = useState<boolean>(true);
  const [pinDraggedNodes, setPinDraggedNodes] = useState<boolean>(true);
  const [pinnedNodesCount, setPinnedNodesCount] = useState<number>(0);

  const dragClusterModeRef = useRef<boolean>(true);
  const pinDraggedNodesRef = useRef<boolean>(true);

  useEffect(() => {
    dragClusterModeRef.current = dragClusterMode;
  }, [dragClusterMode]);

  useEffect(() => {
    pinDraggedNodesRef.current = pinDraggedNodes;
  }, [pinDraggedNodes]);

  // Collapsible Legend State
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  // Advanced Selectable Filters State
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState<boolean>(false);
  const advancedFilterDropdownRef = useRef<HTMLDivElement>(null);
  const advancedFilterBtnRef = useRef<HTMLButtonElement>(null);

  // Multi-selectable Resource Types Filter
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<Set<ResourceType>>(
    new Set<ResourceType>(["knowledge", "troubleshooting", "procedure", "mcp_server", "github_repo", "ai_skill", "article", "paper", "rss", "note"])
  );

  // Multi-selectable Relation Sources Filter
  const [selectedRelationSources, setSelectedRelationSources] = useState<Set<string>>(
    new Set<string>([
      "explicit",        // Archi diretti OKF (YAML)
      "entities",        // Entità ontologiche condivise
      "mentions",        // Citazioni & cross-references nel testo
      "dependencies",    // Dipendenze tecniche e prerequisiti
      "troubleshooting", // Fix & sistemi coinvolti
      "procedure_mesh",  // Procedure & Prevenzione Errori (SOP Mesh)
      "mcp_skills",      // Tool MCP & AI Skills
      "hierarchy",       // Gerarchia Concept -> Architecture -> Guide
      "ecosystem",       // Ecosistema, autore, maintainer
      "tags",            // Tag condivisi
      "content_overlap", // Affinità Contenuto & Tag (Automatico)
    ])
  );

  // Auto Content & Tag Overlap Sensitivity Threshold (0-100%)
  const [minAffinityThreshold, setMinAffinityThreshold] = useState<number>(30);

  // Connectivity & Min Degree Filter
  const [minDegreeFilter, setMinDegreeFilter] = useState<number>(0);
  const [hideOrphanNodes, setHideOrphanNodes] = useState<boolean>(false);
  
  // Specific Node Search & Autocomplete State
  const [nodeSearchQuery, setNodeSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchFilterQuery, setSearchFilterQuery] = useState("");

  // Semantic Pathway Finder (Cammino Minimo Ontologico tra nodi)
  const [isPathFinderOpen, setIsPathFinderOpen] = useState<boolean>(false);
  const [pathSourceId, setPathSourceId] = useState<string | null>(null);
  const [pathTargetId, setPathTargetId] = useState<string | null>(null);

  const isPathFinderOpenRef = useRef(isPathFinderOpen);
  const pathSourceIdRef = useRef(pathSourceId);
  const pathTargetIdRef = useRef(pathTargetId);
  useEffect(() => { isPathFinderOpenRef.current = isPathFinderOpen; }, [isPathFinderOpen]);
  useEffect(() => { pathSourceIdRef.current = pathSourceId; }, [pathSourceId]);
  useEffect(() => { pathTargetIdRef.current = pathTargetId; }, [pathTargetId]);

  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<ResourceType | "all">("all");
  const [showConceptHubs, setShowConceptHubs] = useState<boolean>(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState<boolean>(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Extract unique domains for domain filtering
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    resources.forEach((r) => {
      const d = r.metadata?.domain?.trim();
      if (d && d.length > 2 && d.toLowerCase() !== "general") {
        set.add(d);
      }
    });
    return Array.from(set).sort();
  }, [resources]);

  // Esportazione del Grafo Topologico in formato SVG ad alta fedeltà o PNG ad alta risoluzione (Retina 2x)
  const handleExportGraphImage = (format: "png" | "svg") => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const bbox = svgEl.getBoundingClientRect();
    const width = bbox.width || 1200;
    const height = bbox.height || 800;

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgEl);

    if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    if (format === "svg") {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-vault-graph-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.fillStyle = "#0A0A0A";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `knowledge-vault-graph-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
        }, "image/png");
      };
      img.src = url;
    }
  };

  // Click outside listener for search autocomplete and advanced filter dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        searchDropdownRef.current && 
        !searchDropdownRef.current.contains(target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(target)
      ) {
        setIsSearchFocused(false);
      }
      if (
        advancedFilterDropdownRef.current &&
        !advancedFilterDropdownRef.current.contains(target) &&
        advancedFilterBtnRef.current &&
        !advancedFilterBtnRef.current.contains(target)
      ) {
        setIsAdvancedFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper to release and reset all pinned node positions
  const handleResetPinnedNodes = () => {
    if (simulationNodesRef.current) {
      simulationNodesRef.current.forEach((n: any) => {
        n.fx = null;
        n.fy = null;
      });
      if (simulationRef.current) {
        simulationRef.current.alphaTarget(0.2).restart();
        setTimeout(() => simulationRef.current?.alphaTarget(0), 400);
      }
    }
    setPinnedNodesCount(0);
  };

  // Handle ResizeObserver for accurate dynamic viewport sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || (isFullscreen ? window.innerHeight : 650);
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
    };

    measure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        measure();
      });
      resizeObserver.observe(el);
    }

    window.addEventListener("resize", measure);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isFullscreen]);

  // Handle ESC key and prevent body scrolling when in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  // Helper to safely extract entity name strings from metadata
  const getResourceEntities = (r: ResourceItem): string[] => {
    const rawEntities = r.metadata?.entities || [];
    const entityStrings: string[] = [];
    rawEntities.forEach((item) => {
      if (typeof item === "string") {
        if (item.trim()) entityStrings.push(item.trim());
      } else if (item && typeof item === "object" && item.name) {
        if (item.name.trim()) entityStrings.push(item.name.trim());
      }
    });
    if (r.metadata?.keyConcepts && Array.isArray(r.metadata.keyConcepts)) {
      r.metadata.keyConcepts.forEach((kc) => {
        if (typeof kc === "string" && kc.trim()) entityStrings.push(kc.trim());
      });
    }
    return Array.from(new Set(entityStrings));
  };

  // Helper to calculate document importance / centrality score
  const scoreResourceForHub = (r: ResourceItem): number => {
    let score = 0;
    if (r.type === "knowledge") score += 10;
    if (r.metadata?.docType === "architecture" || r.metadata?.docType === "concept") score += 5;
    if (r.metadata?.relations && Array.isArray(r.metadata.relations)) {
      score += r.metadata.relations.length * 3;
    }
    if (r.metadata?.entities && Array.isArray(r.metadata.entities)) {
      score += Math.min(r.metadata.entities.length, 5);
    }
    if (r.isFavorite) score += 3;
    if (r.tags && r.tags.length > 0) score += Math.min(r.tags.length, 4);
    return score;
  };

  // Search Results for Autocomplete Dropdown
  const searchResults = useMemo(() => {
    if (!nodeSearchQuery.trim()) return [];
    const query = nodeSearchQuery.toLowerCase().trim();
    
    return resources
      .filter((r) => {
        const titleMatch = r.title.toLowerCase().includes(query);
        const tagMatch = (r.tags || []).some((t) => t.toLowerCase().includes(query));
        const domainMatch = (r.metadata?.domain || "").toLowerCase().includes(query);
        const entityMatch = getResourceEntities(r).some((e) => e.toLowerCase().includes(query));
        return titleMatch || tagMatch || domainMatch || entityMatch;
      })
      .sort((a, b) => {
        // Prioritize exact or prefix title matches
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1;
        if (!aTitle.startsWith(query) && bTitle.startsWith(query)) return 1;
        return scoreResourceForHub(b) - scoreResourceForHub(a);
      })
      .slice(0, 10);
  }, [resources, nodeSearchQuery]);

  // 1. Build Scoped Graph Structure (Optimized, Scalable, Zero Lag)
  const graphData = useMemo(() => {
    const allResourcesMap = new Map<string, ResourceItem>();
    resources.forEach((r) => allResourcesMap.set(r.id, r));

    // Base filter by active filter type, selectedResourceTypes, or global tag
    let baseFiltered = resources.filter((r) => selectedResourceTypes.has(r.type));

    if (activeFilterType !== "all") {
      baseFiltered = baseFiltered.filter((r) => r.type === activeFilterType);
    }

    if (selectedTag) {
      baseFiltered = baseFiltered.filter((r) => 
        (r.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())
      );
    }

    // Direct Search Filter inside Graph
    if (searchFilterQuery.trim()) {
      const parsed = parseSearchQuery(searchFilterQuery);
      baseFiltered = baseFiltered.filter((r) => {
        const evalRes = evaluateResourceSearch(r, parsed);
        if (evalRes.matches) return true;
        const entities = getResourceEntities(r);
        return parsed.tokens.some((token) =>
          entities.some((e) => e.toLowerCase().includes(token))
        );
      });
    }

    // Step A: Determine which subset of resource documents to include based on ScopeMode
    let scopedResources: ResourceItem[] = [];
    const hop0Set = new Set<string>();
    const hop1Set = new Set<string>();
    const hop2Set = new Set<string>();

    if (searchFilterQuery.trim().length > 0) {
      scopedResources = baseFiltered.slice(0, maxNodesLimit === -1 ? baseFiltered.length : maxNodesLimit);
    } else if (scopeMode === "focus" && focusedNodeId) {
      // Single Node Ego-Graph (Configurable 1-Hop or 2-Hop Depth)
      const targetDoc = allResourcesMap.get(focusedNodeId);
      if (targetDoc) {
        hop0Set.add(targetDoc.id);

        // Helper to find all direct connected documents (explicit relations, back-references, top shared entities)
        const getDirectConnectedDocIds = (doc: ResourceItem, maxSharedEnts = 8): Set<string> => {
          const directIds = new Set<string>();

          // 1. Explicit outgoing relations
          if (doc.metadata?.relations && Array.isArray(doc.metadata.relations)) {
            doc.metadata.relations.forEach((rel) => {
              const tId = rel.targetId || rel.targetTitle || (rel as any).target || (rel as any).targetName;
              if (tId) {
                for (const r of resources) {
                  if (r.id === tId || r.title.toLowerCase().trim() === tId.toLowerCase().trim()) {
                    if (r.id !== doc.id) directIds.add(r.id);
                  }
                }
              }
            });
          }

          // 2. Explicit incoming relations from other documents
          resources.forEach((r) => {
            if (r.id !== doc.id && r.metadata?.relations && Array.isArray(r.metadata.relations)) {
              r.metadata.relations.forEach((rel) => {
                const tId = rel.targetId || rel.targetTitle || (rel as any).target || (rel as any).targetName;
                if (tId && (tId === doc.id || tId.toLowerCase().trim() === doc.title.toLowerCase().trim())) {
                  directIds.add(r.id);
                }
              });
            }
          });

          // 3. Shared entities
          const targetEntities = getResourceEntities(doc).map((e) => e.toLowerCase());
          if (targetEntities.length > 0) {
            let count = 0;
            resources.forEach((r) => {
              if (r.id !== doc.id && !directIds.has(r.id) && count < maxSharedEnts) {
                const rEntities = getResourceEntities(r).map((e) => e.toLowerCase());
                if (rEntities.some((e) => targetEntities.includes(e))) {
                  directIds.add(r.id);
                  count++;
                }
              }
            });
          }

          return directIds;
        };

        // 1-Hop level neighbors (direct connections)
        const directHop1 = getDirectConnectedDocIds(targetDoc, 10);
        directHop1.forEach((id) => {
          if (!hop0Set.has(id)) hop1Set.add(id);
        });

        // 2-Hop level neighbors (connections of neighbors, capped for high rendering performance)
        if (connectionDepth === 2) {
          let hop2Count = 0;
          const maxHop2Total = 24; // Performance throttle to preserve fluid 60fps
          for (const hop1Id of hop1Set) {
            if (hop2Count >= maxHop2Total) break;
            const hop1Doc = allResourcesMap.get(hop1Id);
            if (hop1Doc) {
              const directHop2 = getDirectConnectedDocIds(hop1Doc, 3);
              for (const id of directHop2) {
                if (!hop0Set.has(id) && !hop1Set.has(id) && !hop2Set.has(id)) {
                  hop2Set.add(id);
                  hop2Count++;
                  if (hop2Count >= maxHop2Total) break;
                }
              }
            }
          }
        }

        const allIncludedIds = new Set<string>([...hop0Set, ...hop1Set, ...hop2Set]);
        scopedResources = resources.filter((r) => allIncludedIds.has(r.id));
      } else {
        scopedResources = baseFiltered.slice(0, maxNodesLimit === -1 ? baseFiltered.length : maxNodesLimit);
      }
    } else if (scopeMode === "domain" && selectedDomain !== "all") {
      scopedResources = baseFiltered.filter(
        (r) => r.metadata?.domain?.toLowerCase().trim() === selectedDomain.toLowerCase().trim()
      );
      if (maxNodesLimit !== -1 && scopedResources.length > maxNodesLimit) {
        scopedResources = scopedResources
          .sort((a, b) => scoreResourceForHub(b) - scoreResourceForHub(a))
          .slice(0, maxNodesLimit);
      }
    } else if (scopeMode === "hubs") {
      const sortedByScore = [...baseFiltered].sort(
        (a, b) => scoreResourceForHub(b) - scoreResourceForHub(a)
      );
      const limit = maxNodesLimit === -1 ? sortedByScore.length : maxNodesLimit;
      scopedResources = sortedByScore.slice(0, limit);
    } else {
      if (maxNodesLimit === -1) {
        scopedResources = baseFiltered;
      } else {
        scopedResources = [...baseFiltered]
          .sort((a, b) => scoreResourceForHub(b) - scoreResourceForHub(a))
          .slice(0, maxNodesLimit);
      }
    }

    // Step B: Create Graph Nodes Map
    const nodesMap = new Map<string, GraphNode>();
    scopedResources.forEach((r) => {
      let hopDistance: number | undefined = undefined;
      if (scopeMode === "focus" && focusedNodeId) {
        if (r.id === focusedNodeId) hopDistance = 0;
        else if (hop1Set.has(r.id)) hopDistance = 1;
        else if (hop2Set.has(r.id)) hopDistance = 2;
      }

      nodesMap.set(r.id, {
        id: r.id,
        title: r.title,
        type: r.type,
        tags: r.tags || [],
        domain: r.metadata?.domain || r.type,
        summary: r.summary,
        degree: 0,
        isEntityNode: false,
        hopDistance,
      });
    });

    const findNodeByTitleOrId = (identifier: string): GraphNode | undefined => {
      if (!identifier) return undefined;
      if (nodesMap.has(identifier)) return nodesMap.get(identifier);
      const lower = identifier.toLowerCase().trim();
      
      for (const node of nodesMap.values()) {
        if (!node.isEntityNode && node.title.toLowerCase().trim() === lower) return node;
      }
      
      for (const node of nodesMap.values()) {
        if (!node.isEntityNode) {
          const nodeTitleLower = node.title.toLowerCase();
          if (
            (lower.length >= 4 && nodeTitleLower.includes(lower)) || 
            (nodeTitleLower.length >= 4 && lower.includes(nodeTitleLower))
          ) {
            return node;
          }
        }
      }
      return undefined;
    };

    const links: GraphLink[] = [];
    const linkSet = new Set<string>();

    const addLink = (
      sourceId: string, 
      targetId: string, 
      relationType: string, 
      label: string, 
      weight: number, 
      color: string, 
      description?: string
    ) => {
      if (sourceId === targetId) return;
      const key1 = `${sourceId}:::${targetId}`;
      const key2 = `${targetId}:::${sourceId}`;
      if (linkSet.has(key1) || linkSet.has(key2)) return;
      linkSet.add(key1);

      const srcNode = nodesMap.get(sourceId);
      const tgtNode = nodesMap.get(targetId);
      if (!srcNode || !tgtNode) return;

      links.push({
        source: sourceId,
        target: targetId,
        relationType,
        label,
        weight,
        color,
        description,
        sourceTitle: srcNode.title,
        targetTitle: tgtNode.title,
      });

      srcNode.degree = (srcNode.degree || 0) + 1;
      tgtNode.degree = (tgtNode.degree || 0) + 1;
    };

    // 1. Explicit OKF Relations (from YAML metadata.relations)
    if (selectedRelationSources.has("explicit") && (relationFilterMode === "explicit" || relationFilterMode === "all")) {
      scopedResources.forEach((r) => {
        if (r.metadata?.relations && Array.isArray(r.metadata.relations)) {
          r.metadata.relations.forEach((rel) => {
            const targetIdentifier = rel.targetId || rel.targetTitle || (rel as any).target || (rel as any).targetName;
            if (!targetIdentifier) return;
            const target = findNodeByTitleOrId(targetIdentifier);
            if (target && target.id !== r.id) {
              const relType = rel.relationType || (rel as any).type || "references";
              addLink(
                r.id,
                target.id,
                relType,
                relType.replace(/_/g, " "),
                1.0,
                "#C5A059", // Champagne Gold
                rel.description || `Relazione ontologica OKF v0.2: ${relType}`
              );
            }
          });
        }
      });
    }

    // 2. Shared Entities & Key Concepts Relations
    if (selectedRelationSources.has("entities") && (relationFilterMode === "entities" || relationFilterMode === "all")) {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = i + 1; j < scopedResources.length; j++) {
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const entitiesA = getResourceEntities(docA).map((e) => e.toLowerCase().trim());
          const entitiesB = getResourceEntities(docB).map((e) => e.toLowerCase().trim());

          const commonEntities = entitiesA.filter((e) => entitiesB.includes(e) && e.length >= 3);

          if (commonEntities.length > 0) {
            const topEntity = commonEntities[0];
            const entityLabel = topEntity.charAt(0).toUpperCase() + topEntity.slice(1);
            addLink(
              docA.id,
              docB.id,
              "shared_entity",
              `Entità: ${entityLabel}`,
              0.85,
              "#38BDF8", // Cyan
              `Condividono ${commonEntities.length} entità ontologiche: ${commonEntities.slice(0, 3).join(", ")}`
            );
          }
        }
      }
    }

    // 3. Cross-Document Mentions & Citations (In summary, markdown, or wikilinks)
    if (selectedRelationSources.has("mentions") && (relationFilterMode === "all" || relationFilterMode === "explicit")) {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = 0; j < scopedResources.length; j++) {
          if (i === j) continue;
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const titleB = docB.title.toLowerCase().trim();
          if (titleB.length >= 4) {
            const textA = `${docA.summary || ""} ${docA.metadata?.markdownContent || ""} ${docA.rawInput || ""}`.toLowerCase();
            if (textA.includes(titleB) || textA.includes(`[[${titleB}]]`)) {
              addLink(
                docA.id,
                docB.id,
                "references",
                `Cita: ${docB.title.length > 18 ? docB.title.slice(0, 16) + "…" : docB.title}`,
                0.80,
                "#E5C170", // Champagne Light Gold
                `Il documento ${docA.title} fa riferimento a ${docB.title}`
              );
            }
          }
        }
      }
    }

    // 4. Technical Dependencies & Prerequisites Bridge
    if (selectedRelationSources.has("dependencies") && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = 0; j < scopedResources.length; j++) {
          if (i === j) continue;
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const depsA = [
            ...(docA.metadata?.dependencies || []),
            ...(docA.metadata?.prerequisites || []),
            ...(docA.metadata?.requirements || []),
          ].map((d) => d.toLowerCase().trim());

          if (depsA.length > 0) {
            const titleB = docB.title.toLowerCase().trim();
            const repoB = (docB.metadata?.repoName || "").toLowerCase().trim();
            const tagsB = (docB.tags || []).map((t) => t.toLowerCase().trim());

            for (const dep of depsA) {
              if (dep.length >= 3 && (titleB.includes(dep) || (repoB && repoB.includes(dep)) || tagsB.includes(dep))) {
                addLink(
                  docA.id,
                  docB.id,
                  "depends_on",
                  `Dipende da: ${dep}`,
                  0.92,
                  "#EC4899", // Pink / Fuchsia
                  `Dipendenza tecnica dichiarata: ${dep}`
                );
                break;
              }
            }
          }
        }
      }
    }

    // 5. Troubleshooting Solutions & Affected Systems Bridge
    if (selectedRelationSources.has("troubleshooting") && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = 0; j < scopedResources.length; j++) {
          if (i === j) continue;
          const docA = scopedResources[i];
          const docB = scopedResources[j];

          if (docA.type === "troubleshooting") {
            const sys = (docA.metadata?.affectedSystem || "").toLowerCase().trim();
            const cause = (docA.metadata?.rootCause || "").toLowerCase().trim();
            const titleB = docB.title.toLowerCase().trim();
            const domainB = (docB.metadata?.domain || "").toLowerCase().trim();
            const tagsB = (docB.tags || []).map((t) => t.toLowerCase().trim());

            let matchedReason = "";
            if (sys && sys.length >= 3 && (titleB.includes(sys) || domainB.includes(sys) || tagsB.includes(sys))) {
              matchedReason = `Sistema: ${docA.metadata?.affectedSystem}`;
            } else if (cause && cause.length >= 4 && (titleB.includes(cause) || tagsB.includes(cause))) {
              matchedReason = `Causa: ${docA.metadata?.rootCause}`;
            }

            if (matchedReason) {
              addLink(
                docA.id,
                docB.id,
                "solves",
                `Fix per: ${docB.title.length > 16 ? docB.title.slice(0, 14) + "…" : docB.title}`,
                0.90,
                "#F97316", // Vibrant Orange
                `Soluzione di troubleshooting applicabile: ${matchedReason}`
              );
            }
          }
        }
      }
    }

    // 5b. SOP Procedure & Troubleshooting Preventive Mesh
    if ((selectedRelationSources.has("procedure_mesh") || selectedRelationSources.has("troubleshooting")) && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = 0; j < scopedResources.length; j++) {
          if (i === j) continue;
          const docA = scopedResources[i];
          const docB = scopedResources[j];

          if (docA.type === "procedure") {
            const targetSys = (docA.metadata?.targetSystem || "").toLowerCase().trim();
            const relTroubleshoot = docA.metadata?.relatedTroubleshootingIds || [];
            
            let matched = false;
            let relType = "standardizes";
            let reason = "";

            if (docB.type === "troubleshooting") {
              const affectedSys = (docB.metadata?.affectedSystem || "").toLowerCase().trim();
              if (relTroubleshoot.includes(docB.id)) {
                matched = true;
                relType = "prevents";
                reason = "Previene l'errore registrato";
              } else if (targetSys && affectedSys && (targetSys.includes(affectedSys) || affectedSys.includes(targetSys))) {
                matched = true;
                relType = "prevents";
                reason = `Previene guasti sul sistema ${docA.metadata?.targetSystem}`;
              }
            } else if (targetSys && targetSys.length >= 3) {
              const titleB = docB.title.toLowerCase();
              if (titleB.includes(targetSys)) {
                matched = true;
                relType = "operates_on";
                reason = `Procedura operativa per ${docA.metadata?.targetSystem}`;
              }
            }

            if (matched) {
              addLink(
                docA.id,
                docB.id,
                relType,
                relType === "prevents" ? `Previene: ${docB.title.length > 14 ? docB.title.slice(0, 12) + "…" : docB.title}` : `Opera su: ${docB.title.length > 14 ? docB.title.slice(0, 12) + "…" : docB.title}`,
                0.92,
                "#06B6D4", // Bright Cyan/Turquoise
                reason
              );
            }
          }
        }
      }
    }

    // 6. MCP Server & AI Skills Synergy
    if (selectedRelationSources.has("mcp_skills") && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = 0; j < scopedResources.length; j++) {
          if (i === j) continue;
          const docA = scopedResources[i];
          const docB = scopedResources[j];

          if (docA.type === "mcp_server" && docB.type === "ai_skill") {
            const tools = docA.metadata?.toolsProvided || [];
            const promptB = `${docB.metadata?.systemPrompt || ""} ${docB.metadata?.exampleUsage || ""}`.toLowerCase();
            const keywordsB = (docB.metadata?.triggerKeywords || []).map((k) => k.toLowerCase());
            const titleA = docA.title.toLowerCase();

            let matches = promptB.includes(titleA) || keywordsB.some((k) => titleA.includes(k));
            let toolLabel = docA.title;

            if (!matches) {
              for (const t of tools) {
                const tLower = t.toLowerCase();
                if (tLower.length >= 3 && (promptB.includes(tLower) || keywordsB.includes(tLower))) {
                  matches = true;
                  toolLabel = t;
                  break;
                }
              }
            }

            if (matches) {
              addLink(
                docA.id,
                docB.id,
                "powers_skill",
                `Alimenta: ${toolLabel}`,
                0.88,
                "#06B6D4", // Cyan/Teal
                `Il server MCP ${docA.title} fornisce tool invocati dalla Skill ${docB.title}`
              );
            }
          }
        }
      }
    }

    // 7. Architectural Hierarchy (Concept -> Architecture -> Guide / Specification)
    if (selectedRelationSources.has("hierarchy") && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = i + 1; j < scopedResources.length; j++) {
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const domainA = (docA.metadata?.domain || "").toLowerCase().trim();
          const domainB = (docB.metadata?.domain || "").toLowerCase().trim();

          if (domainA && domainA === domainB && domainA !== "general") {
            const dtA = docA.metadata?.docType;
            const dtB = docB.metadata?.docType;
            if (
              (dtA === "concept" && (dtB === "architecture" || dtB === "guide")) ||
              (dtB === "concept" && (dtA === "architecture" || dtA === "guide")) ||
              (dtA === "architecture" && (dtB === "guide" || dtB === "specification")) ||
              (dtB === "architecture" && (dtA === "guide" || dtA === "specification"))
            ) {
              addLink(
                docA.id,
                docB.id,
                "architectural_hierarchy",
                `Gerarchia OKF`,
                0.78,
                "#8B5CF6", // Purple / Violet
                `Relazione tassonomica nel dominio ${docA.metadata?.domain}: ${dtA || "doc"} ↔ ${dtB || "doc"}`
              );
            }
          }
        }
      }
    }

    // 8. Shared Ecosystem & Maintainer
    if (selectedRelationSources.has("ecosystem") && relationFilterMode === "all") {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = i + 1; j < scopedResources.length; j++) {
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const orgA = (docA.metadata?.owner || (docA.metadata as any)?.author || (docA.metadata as any)?.maintainer || "").toLowerCase().trim();
          const orgB = (docB.metadata?.owner || (docB.metadata as any)?.author || (docB.metadata as any)?.maintainer || "").toLowerCase().trim();

          if (orgA && orgB && orgA === orgB && orgA.length >= 3) {
            addLink(
              docA.id,
              docB.id,
              "shared_ecosystem",
              `Org: ${docA.metadata?.owner || orgA}`,
              0.68,
              "#A78BFA",
              `Condividono lo stesso maintainer o ecosistema: ${orgA}`
            );
          }
        }
      }
    }

    // 9. Automatic Content & Tag Overlap (Semantic Affinity Engine)
    if (
      selectedRelationSources.has("content_overlap") &&
      (relationFilterMode === "overlap" || relationFilterMode === "all")
    ) {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = i + 1; j < scopedResources.length; j++) {
          const docA = scopedResources[i];
          const docB = scopedResources[j];

          const affinity = calculateResourceAffinity(docA, docB);

          if (
            affinity.score >= minAffinityThreshold &&
            (affinity.sharedTags.length > 0 || affinity.contentScore >= 20)
          ) {
            const topTerms = affinity.overlappingTerms.slice(0, 2).join(", ");
            const tagSnippet = affinity.sharedTags.length > 0 ? `#${affinity.sharedTags[0]}` : "";
            const edgeLabel = tagSnippet && topTerms 
              ? `${tagSnippet} • ${topTerms}`
              : tagSnippet || topTerms || `Affinità ${affinity.score}%`;

            addLink(
              docA.id,
              docB.id,
              "content_overlap",
              `Affinità: ${affinity.score}%`,
              Math.min(1.0, Math.max(0.65, affinity.score / 100)),
              "#14B8A6", // Vibrant Turquoise/Teal
              `Correlazione automatica (${affinity.score}%): ${affinity.explanation}`
            );
          }
        }
      }
    }

    // 10. Shared Tags
    if (selectedRelationSources.has("tags") && (relationFilterMode === "tags" || relationFilterMode === "all")) {
      for (let i = 0; i < scopedResources.length; i++) {
        for (let j = i + 1; j < scopedResources.length; j++) {
          const docA = scopedResources[i];
          const docB = scopedResources[j];
          const tagsA = (docA.tags || []).map((t) => t.toLowerCase().trim()).filter((t) => t !== "dev" && t !== "doc");
          const tagsB = (docB.tags || []).map((t) => t.toLowerCase().trim()).filter((t) => t !== "dev" && t !== "doc");

          const sharedTags = tagsA.filter((t) => tagsB.includes(t) && t.length > 2);
          const threshold = 1;
          if (sharedTags.length >= threshold) {
            addLink(
              docA.id,
              docB.id,
              "shared_tag",
              `#${sharedTags[0]}`,
              0.65,
              "#F59E0B", // Amber
              `Condividono i tag: ${sharedTags.map((t) => "#" + t).join(", ")}`
            );
          }
        }
      }
    }

    // 10. Domain & Category Fallback Connections (Ensure every resource connects if not filtered)
    if (relationFilterMode === "all" && !hideOrphanNodes) {
      scopedResources.forEach((docA) => {
        const nodeA = nodesMap.get(docA.id);
        if (nodeA && nodeA.degree === 0) {
          // Connect to a peer in the same domain if available
          if (docA.metadata?.domain && docA.metadata.domain.toLowerCase() !== "general") {
            const peer = scopedResources.find(
              (docB) => docB.id !== docA.id && docB.metadata?.domain?.toLowerCase() === docA.metadata?.domain?.toLowerCase()
            );
            if (peer) {
              addLink(
                docA.id,
                peer.id,
                "domain_affinity",
                docA.metadata.domain,
                0.55,
                "#10B981",
                `Affinità di dominio: ${docA.metadata.domain}`
              );
            }
          }
          // Or connect by shared type if still isolated
          if (nodeA.degree === 0) {
            const sameTypePeer = scopedResources.find(
              (docB) => docB.id !== docA.id && docB.type === docA.type
            );
            if (sameTypePeer) {
              addLink(
                docA.id,
                sameTypePeer.id,
                "type_affinity",
                docA.type.replace("_", " "),
                0.45,
                getNodeColor(docA.type),
                `Cluster tipologia: ${docA.type}`
              );
            }
          }
        }
      });
    }

    // 11. Concept / Entity Hub Nodes Mode
    if (showConceptHubs) {
      const entityMap = new Map<string, { name: string; count: number; docIds: string[] }>();

      scopedResources.forEach((r) => {
        const ents = getResourceEntities(r);
        ents.forEach((ent) => {
          const key = ent.toLowerCase().trim();
          if (key.length < 3) return;
          if (!entityMap.has(key)) {
            entityMap.set(key, { name: ent, count: 0, docIds: [] });
          }
          const item = entityMap.get(key)!;
          item.count += 1;
          if (!item.docIds.includes(r.id)) {
            item.docIds.push(r.id);
          }
        });
      });

      entityMap.forEach((val, key) => {
        if (val.docIds.length >= 2) {
          const hubId = `hub_concept_${key}`;
          if (!nodesMap.has(hubId)) {
            nodesMap.set(hubId, {
              id: hubId,
              title: val.name,
              type: "concept",
              tags: ["concept", "entity-hub"],
              domain: "Ontology Concept",
              degree: 0,
              isEntityNode: true,
              entityType: "OKF Entity Hub",
              summary: `Entità ontologica condivisa estratta da ${val.docIds.length} documenti del Vault`,
            });
          }

          val.docIds.forEach((docId) => {
            addLink(
              docId,
              hubId,
              "concept_bridge",
              "has_concept",
              0.7,
              "#38BDF8",
              `Collegato al concetto: ${val.name}`
            );
          });
        }
      });
    }

    // Apply Min Degree and Orphan Filtering
    let finalNodes = Array.from(nodesMap.values());
    if (hideOrphanNodes) {
      finalNodes = finalNodes.filter((n) => (n.degree || 0) > 0);
    }
    if (minDegreeFilter > 0) {
      finalNodes = finalNodes.filter((n) => (n.degree || 0) >= minDegreeFilter);
    }

    const validNodeIds = new Set(finalNodes.map((n) => n.id));
    const finalLinks = links.filter(
      (l) => validNodeIds.has(l.source as string) && validNodeIds.has(l.target as string)
    );

    return {
      nodes: finalNodes,
      links: finalLinks,
      totalVaultResources: resources.length,
    };
  }, [
    resources, 
    scopeMode, 
    focusedNodeId, 
    connectionDepth,
    selectedDomain, 
    maxNodesLimit, 
    activeFilterType, 
    selectedTag, 
    searchFilterQuery, 
    relationFilterMode, 
    showConceptHubs,
    selectedResourceTypes,
    selectedRelationSources,
    minAffinityThreshold,
    minDegreeFilter,
    hideOrphanNodes
  ]);

  // Computed Semantic Pathway (Cammino Minimo) between pathSourceId and pathTargetId
  const activePathway = useMemo(() => {
    if (!pathSourceId || !pathTargetId || pathSourceId === pathTargetId) return null;
    return findShortestPath(graphData.nodes, graphData.links, pathSourceId, pathTargetId);
  }, [pathSourceId, pathTargetId, graphData.nodes, graphData.links]);

  // Smooth Pan-To-Node Animation
  const panToNodeCoords = useCallback((targetId: string, customZoom = 1.35) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const width = dimensions.width || svgRef.current.clientWidth || 800;
    const rawHeight = svgRef.current.clientHeight || (isFullscreen ? window.innerHeight : 650);
    const height = Math.max(300, rawHeight);

    const node = simulationNodesRef.current.find((n) => n.id === targetId);
    const targetX = node && !isNaN(node.x) ? node.x : width / 2;
    const targetY = node && !isNaN(node.y) ? node.y : height / 2;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(customZoom)
      .translate(-targetX, -targetY);

    d3.select(svgRef.current)
      .transition()
      .duration(850)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [dimensions.width, dimensions.height, isFullscreen]);

  // Primary Action: Focus and Pan to Node from Search or Direct Click
  const handleSelectAndPanToNode = (resourceId: string, triggerTitle?: string) => {
    setFocusedNodeId(resourceId);
    setScopeMode("focus");
    setHoveredNode(null);
    setIsSearchFocused(false);
    if (triggerTitle) {
      setNodeSearchQuery(triggerTitle);
    }

    // Schedule smooth pan-to-node animation
    setTimeout(() => {
      panToNodeCoords(resourceId, 1.4);
    }, 180);
  };

  // Reset to default Hubs View
  const handleResetToHubs = () => {
    setScopeMode("hubs");
    setFocusedNodeId(null);
    setSelectedDomain("all");
    setRelationFilterMode("all");
    setMaxNodesLimit(15);
    setSearchFilterQuery("");
    setNodeSearchQuery("");
    handleResetZoom();
  };

  // D3 Force Simulation Setup with Pan-to-Node & Halo Transitions
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = dimensions.width || containerRef.current.clientWidth || (isFullscreen ? window.innerWidth : 800);
    const rawHeight = containerRef.current.clientHeight || (isFullscreen ? window.innerHeight : 650);
    const height = Math.max(300, rawHeight);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Defs for Glow Filters and Colored Arrow Markers
    const defs = svg.append("defs");

    // Glow Filter
    const filter = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Arrow Marker Definitions
    const arrowColors = [
      { id: "arrow-gold", color: "#C5A059" },
      { id: "arrow-cyan", color: "#38BDF8" },
      { id: "arrow-purple", color: "#A855F7" },
      { id: "arrow-amber", color: "#F59E0B" },
      { id: "arrow-green", color: "#10B981" },
      { id: "arrow-blue", color: "#60A5FA" },
      { id: "arrow-orange", color: "#F97316" },
      { id: "arrow-pink", color: "#EC4899" },
      { id: "arrow-teal", color: "#06B6D4" },
      { id: "arrow-violet", color: "#8B5CF6" },
      { id: "arrow-affinity", color: "#14B8A6" },
      { id: "arrow-default", color: "#888888" },
    ];

    arrowColors.forEach((ac) => {
      defs
        .append("marker")
        .attr("id", ac.id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 26)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", ac.color);
    });

    const g = svg.append("g");

    // Setup Zoom Behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Deep clone data for D3 simulation
    const nodes: any[] = graphData.nodes.map((d) => ({ ...d }));
    const links: any[] = graphData.links.map((d) => ({ ...d }));
    simulationNodesRef.current = nodes;

    const nodeCount = nodes.length;
    const simulation = d3
      .forceSimulation(nodes)
      .alphaDecay(0.045)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance((d: any) => {
            if (nodeCount <= 5) return 170;
            if (nodeCount <= 15) return 130;
            if (nodeCount <= 40) return 95;
            return Math.max(60, 90 / (d.weight || 0.8));
          })
      )
      .force(
        "charge", 
        d3.forceManyBody().strength(nodeCount <= 6 ? -500 : nodeCount <= 20 ? -360 : nodeCount <= 60 ? -220 : -140)
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d: any) => (d.isEntityNode ? 22 : Math.min(38, 26 + (d.degree || 0) * 1.5)))
      );

    simulationRef.current = simulation;

    // Layer 1: Links (Lines + Glow Lines)
    const linkGroup = g.append("g").attr("class", "links-layer");

    const linkGlow = linkGroup
      .selectAll("line.glow")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "glow")
      .attr("stroke", (d) => d.color || "#C5A059")
      .attr("stroke-width", (d) => Math.max(3, (d.weight || 0.6) * 4))
      .attr("stroke-opacity", 0.22)
      .attr("stroke-linecap", "round");

    const link = linkGroup
      .selectAll("line.main")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "main cursor-pointer")
      .attr("stroke", (d) => d.color || "#C5A059")
      .attr("stroke-width", (d) => Math.max(1.8, (d.weight || 0.7) * 2.5))
      .attr("stroke-dasharray", (d) => {
        if (d.relationType === "content_overlap") return "6,3";
        if (d.relationType === "shared_tag") return "5,4";
        if (d.relationType === "same_domain") return "3,3";
        return "none";
      })
      .attr("stroke-opacity", 0.85)
      .attr("marker-end", (d) => {
        if (d.color === "#14B8A6") return "url(#arrow-affinity)";
        if (d.color === "#C5A059") return "url(#arrow-gold)";
        if (d.color === "#38BDF8") return "url(#arrow-cyan)";
        if (d.color === "#A855F7") return "url(#arrow-purple)";
        if (d.color === "#10B981") return "url(#arrow-green)";
        if (d.color === "#F97316") return "url(#arrow-orange)";
        if (d.color === "#F59E0B") return "url(#arrow-amber)";
        if (d.color === "#EC4899") return "url(#arrow-pink)";
        if (d.color === "#06B6D4") return "url(#arrow-teal)";
        if (d.color === "#8B5CF6") return "url(#arrow-violet)";
        return "url(#arrow-gold)";
      })
      .on("mouseover", (_event, d) => {
        setHoveredLink(d);
      })
      .on("mouseout", () => {
        setHoveredLink(null);
      });

    // Layer 2: Edge Labels
    const edgeLabelGroup = g.append("g").attr("class", "edge-labels-layer");
    const edgeLabel = edgeLabelGroup
      .selectAll("g")
      .data(links)
      .enter()
      .append("g")
      .attr("class", "edge-label pointer-events-none")
      .style("opacity", showEdgeLabels ? 1 : 0);

    edgeLabel
      .append("rect")
      .attr("rx", 5)
      .attr("ry", 5)
      .attr("fill", "#0C0C0C")
      .attr("stroke", (d) => d.color || "#333")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.6)
      .attr("fill-opacity", 0.92);

    edgeLabel
      .append("text")
      .text((d) => d.label || d.relationType || "collegato")
      .attr("text-anchor", "middle")
      .attr("dy", "0.32em")
      .attr("fill", (d) => d.color || "#DDD")
      .attr("font-size", "9px")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-weight", "500");

    edgeLabel.each(function () {
      const bbox = d3.select(this).select("text").node() as SVGTextElement;
      if (bbox) {
        const textWidth = bbox.getComputedTextLength();
        d3.select(this)
          .select("rect")
          .attr("width", textWidth + 12)
          .attr("height", 16)
          .attr("x", -(textWidth + 12) / 2)
          .attr("y", -8);
      }
    });

    // Layer 3: Nodes
    const nodeGroup = g.append("g").attr("class", "nodes-layer");

    // Cluster Drag Behavior (repositions dragged node AND its connected neighbors together)
    const clusterDragBehavior = d3
      .drag<SVGGElement, any>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();

        // Pin root dragged node
        d.fx = d.x;
        d.fy = d.y;

        // If Cluster Drag is enabled, find all connected neighbor nodes
        if (dragClusterModeRef.current) {
          const neighborOffsets: { node: any; dx: number; dy: number }[] = [];
          const connectedIds = new Set<string>();

          links.forEach((l: any) => {
            const sId = typeof l.source === "object" ? l.source.id : l.source;
            const tId = typeof l.target === "object" ? l.target.id : l.target;
            const sNode = typeof l.source === "object" ? l.source : nodes.find((n) => n.id === sId);
            const tNode = typeof l.target === "object" ? l.target : nodes.find((n) => n.id === tId);

            if (sId === d.id && tNode && tId !== d.id && !connectedIds.has(tId)) {
              connectedIds.add(tId);
              tNode.fx = tNode.x;
              tNode.fy = tNode.y;
              neighborOffsets.push({
                node: tNode,
                dx: tNode.x - d.x,
                dy: tNode.y - d.y,
              });
            } else if (tId === d.id && sNode && sId !== d.id && !connectedIds.has(sId)) {
              connectedIds.add(sId);
              sNode.fx = sNode.x;
              sNode.fy = sNode.y;
              neighborOffsets.push({
                node: sNode,
                dx: sNode.x - d.x,
                dy: sNode.y - d.y,
              });
            }
          });

          d.__clusterOffsets = neighborOffsets;
          d.__connectedIds = connectedIds;

          // Visual cue: highlight moving cluster
          const clusterIds = new Set([d.id, ...Array.from(connectedIds)]);
          node.attr("opacity", (n: any) => (clusterIds.has(n.id) ? 1 : 0.22));
          link.attr("stroke-opacity", (l: any) => {
            const sId = typeof l.source === "object" ? l.source.id : l.source;
            const tId = typeof l.target === "object" ? l.target.id : l.target;
            return clusterIds.has(sId) || clusterIds.has(tId) ? 1 : 0.1;
          });
        }
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;

        if (dragClusterModeRef.current && d.__clusterOffsets) {
          d.__clusterOffsets.forEach((item: any) => {
            item.node.fx = event.x + item.dx;
            item.node.fy = event.y + item.dy;
          });
        }
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);

        if (pinDraggedNodesRef.current) {
          d.fx = event.x;
          d.fy = event.y;
          if (d.__clusterOffsets) {
            d.__clusterOffsets.forEach((item: any) => {
              item.node.fx = item.node.fx;
              item.node.fy = item.node.fy;
            });
          }
          setPinnedNodesCount((prev) => prev + 1 + (d.__clusterOffsets?.length || 0));
        } else {
          d.fx = null;
          d.fy = null;
          if (d.__clusterOffsets) {
            d.__clusterOffsets.forEach((item: any) => {
              item.node.fx = null;
              item.node.fy = null;
            });
          }
        }

        d.__clusterOffsets = null;
        d.__connectedIds = null;
        node.attr("opacity", 1);
        link.attr("stroke-opacity", 0.85);
      });

    const node = nodeGroup
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node cursor-pointer")
      .call(clusterDragBehavior);

    // Pulse animation ring for focused target node
    node
      .filter((d) => d.id === focusedNodeId)
      .append("circle")
      .attr("r", 36)
      .attr("fill", "none")
      .attr("stroke", "#C5A059")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.8)
      .attr("class", "animate-spin-slow");

    // Outer Glowing Halo Ring
    node
      .append("circle")
      .attr("r", (d) => {
        const isFocused = d.id === focusedNodeId;
        if (isFocused) return 28;
        return d.isEntityNode ? 14 : 20 + Math.min(14, (d.degree || 0) * 2.5);
      })
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("fill-opacity", (d) => (d.id === focusedNodeId ? 0.38 : 0.16))
      .attr("stroke", (d) => getNodeColor(d.type))
      .attr("stroke-width", (d) => (d.id === focusedNodeId ? 2.8 : 1.5))
      .attr("stroke-opacity", (d) => (d.id === focusedNodeId ? 0.95 : 0.45));

    // Core Solid Circle
    node
      .append("circle")
      .attr("r", (d) => {
        const isFocused = d.id === focusedNodeId;
        if (isFocused) return 16;
        return d.isEntityNode ? 8 : 12 + Math.min(6, (d.degree || 0) * 1.5);
      })
      .attr("fill", (d) => getNodeColor(d.type))
      .attr("stroke", "#080808")
      .attr("stroke-width", 2.5);

    // Inner Dot
    node
      .append("circle")
      .attr("r", (d) => (d.isEntityNode ? 3 : 4))
      .attr("fill", "#050505");

    // Node Text Label
    const labelGroup = node.append("g").attr("transform", (d) => `translate(0, ${d.isEntityNode ? 20 : 28})`);

    labelGroup
      .append("rect")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "#080808")
      .attr("fill-opacity", 0.92)
      .attr("stroke", (d) => (d.id === focusedNodeId ? "#C5A059" : "#222"))
      .attr("stroke-width", (d) => (d.id === focusedNodeId ? 1.6 : 0.8));

    labelGroup
      .append("text")
      .text((d) => d.title)
      .attr("text-anchor", "middle")
      .attr("dy", "0.32em")
      .attr("fill", (d) => (d.id === focusedNodeId ? "#C5A059" : "#EAEAEA"))
      .attr("font-size", (d) => (d.isEntityNode ? "9px" : "11px"))
      .attr("font-weight", (d) => (d.id === focusedNodeId ? "600" : d.isEntityNode ? "normal" : "500"))
      .attr("font-family", "JetBrains Mono, monospace")
      .each(function (d) {
        const self = d3.select(this);
        if (d.title.length > 24) {
          self.text(d.title.slice(0, 22) + "…");
        }
      });

    labelGroup.each(function () {
      const textElem = d3.select(this).select("text").node() as SVGTextElement;
      if (textElem) {
        const textWidth = textElem.getComputedTextLength();
        d3.select(this)
          .select("rect")
          .attr("width", textWidth + 10)
          .attr("height", 16)
          .attr("x", -(textWidth + 10) / 2)
          .attr("y", -8);
      }
    });

    // Hover & Click Highlights
    node
      .on("mouseover", (_event, d) => {
        setHoveredNode(d);

        link
          .attr("stroke-opacity", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 1 : 0.12
          )
          .attr("stroke-width", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 3.5 : 1.5
          );

        linkGlow
          .attr("stroke-opacity", (l: any) =>
            l.source.id === d.id || l.target.id === d.id ? 0.6 : 0.04
          );

        node.attr("opacity", (n: any) => {
          const isConnected =
            n.id === d.id ||
            links.some(
              (l: any) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id)
            );
          return isConnected ? 1 : 0.22;
        });
      })
      .on("mouseout", () => {
        setHoveredNode(null);
        link.attr("stroke-opacity", 0.85).attr("stroke-width", (d) => Math.max(1.8, (d.weight || 0.7) * 2.5));
        linkGlow.attr("stroke-opacity", 0.22);
        node.attr("opacity", 1);
      })
      .on("dblclick", (_event, d) => {
        if (!d.isEntityNode) {
          handleSelectAndPanToNode(d.id, d.title);
        }
      })
      .on("click", (_event, d) => {
        if (isPathFinderOpenRef.current) {
          if (!pathSourceIdRef.current) {
            setPathSourceId(d.id);
          } else if (!pathTargetIdRef.current) {
            setPathTargetId(d.id);
          } else {
            setPathTargetId(d.id);
          }
          return;
        }
        setSelectedNode(d);
        if (!d.isEntityNode) {
          const fullResource = resources.find((r) => r.id === d.id);
          if (fullResource) {
            onSelectResource(fullResource);
          }
        }
      });

    // Simulation Tick Update
    simulation.on("tick", () => {
      linkGlow
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      edgeLabel.attr("transform", (d: any) => {
        const midX = (d.source.x + d.target.x) / 2;
        const midY = (d.source.y + d.target.y) / 2;
        return `translate(${midX}, ${midY})`;
      });

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, resources, focusedNodeId, showConceptHubs, showEdgeLabels, dimensions.width, dimensions.height, isFullscreen]);

  // Dynamic Highlight Effect for Semantic Pathway (Cammino Minimo)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const link = svg.selectAll(".links-layer > line:not(.glow)");
    const linkGlow = svg.selectAll(".links-layer > line.glow");
    const node = svg.selectAll(".nodes-layer > g");

    if (activePathway && activePathway.pathNodeIds.length > 0) {
      const pathSet = new Set(activePathway.pathNodeIds);
      const linkSourceTargetSet = new Set(
        activePathway.pathLinks.map((l: any) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return `${s}__${t}`;
        })
      );
      const isPathwayLink = (l: any) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return linkSourceTargetSet.has(`${s}__${t}`) || linkSourceTargetSet.has(`${t}__${s}`);
      };

      link
        .transition()
        .duration(300)
        .attr("stroke", (l: any) => (isPathwayLink(l) ? "#C5A059" : (l.color || "#444")))
        .attr("stroke-width", (l: any) => (isPathwayLink(l) ? 4.5 : 1.2))
        .attr("stroke-opacity", (l: any) => (isPathwayLink(l) ? 1 : 0.1));

      linkGlow
        .transition()
        .duration(300)
        .attr("stroke", (l: any) => (isPathwayLink(l) ? "#C5A059" : (l.color || "#C5A059")))
        .attr("stroke-opacity", (l: any) => (isPathwayLink(l) ? 0.9 : 0.03))
        .attr("stroke-width", (l: any) => (isPathwayLink(l) ? 8 : 2));

      node
        .transition()
        .duration(300)
        .attr("opacity", (n: any) => (pathSet.has(n.id) ? 1 : 0.18));
    } else {
      link
        .transition()
        .duration(200)
        .attr("stroke", (l: any) => l.color || "#C5A059")
        .attr("stroke-width", (l: any) => Math.max(1.8, (l.weight || 0.7) * 2.5))
        .attr("stroke-opacity", 0.85);

      linkGlow
        .transition()
        .duration(200)
        .attr("stroke", (l: any) => l.color || "#C5A059")
        .attr("stroke-opacity", 0.22)
        .attr("stroke-width", (d: any) => Math.max(3, (d.weight || 0.6) * 4));

      node
        .transition()
        .duration(200)
        .attr("opacity", 1);
    }
  }, [activePathway]);

  // Zoom Handlers
  const handleZoom = (scaleFactor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, scaleFactor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  // Fit-to-View Navigation: Centers and scales to display all active simulation nodes with optimal padding
  const handleFitToView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const nodes = simulationNodesRef.current;
    if (!nodes || nodes.length === 0) {
      handleResetZoom();
      return;
    }

    const width = dimensions.width || svgRef.current.clientWidth || (isFullscreen ? window.innerWidth : 800);
    const rawHeight = svgRef.current.clientHeight || (isFullscreen ? window.innerHeight : 650);
    const height = Math.max(300, rawHeight);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let validCount = 0;
    nodes.forEach((n) => {
      if (typeof n.x === "number" && !isNaN(n.x) && typeof n.y === "number" && !isNaN(n.y)) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
        validCount++;
      }
    });

    if (validCount === 0 || minX === Infinity) {
      handleResetZoom();
      return;
    }

    const nodePadding = 64;
    const graphWidth = Math.max(120, (maxX - minX) + nodePadding * 2);
    const graphHeight = Math.max(120, (maxY - minY) + nodePadding * 2);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const scale = Math.min(
      1.7,
      Math.max(0.2, 0.88 / Math.max(graphWidth / width, graphHeight / height))
    );

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-midX, -midY);

    d3.select(svgRef.current)
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [dimensions.width, dimensions.height, isFullscreen]);

  const filteredNodesCount = graphData.nodes.length;
  const filteredLinksCount = graphData.links.length;
  const totalVaultCount = graphData.totalVaultResources;

  const currentFocusedResource = focusedNodeId ? resources.find((r) => r.id === focusedNodeId) : null;

  const graphContent = (
    <div
      ref={containerRef}
      className={`w-full bg-[#080808] relative transition-all overflow-hidden ${
        isFullscreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-[#080808] border-none rounded-none shadow-none"
          : "relative w-full h-[680px] sm:h-[740px] xl:h-[780px] border border-[#1F1F1F] rounded-2xl shadow-2xl"
      }`}
    >
      {/* Edge-to-Edge Canvas Container */}
      <div className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing overflow-hidden">
        <svg ref={svgRef} className="w-full h-full block" />

        {/* Floating Island HUD Top Bar */}
        <div className="absolute top-3.5 left-3.5 right-3.5 z-30 pointer-events-none flex flex-wrap items-center justify-between gap-2.5">
          {/* Left Floating Pill: Title & Status + View Switcher */}
          <div className="pointer-events-auto flex items-center gap-2 bg-[#0A0A0A]/90 backdrop-blur-md border border-[#222] rounded-full px-3 py-1.5 shadow-xl">
            <div className="w-6 h-6 rounded-full bg-[#141414] border border-[#C5A059]/40 flex items-center justify-center text-[#C5A059]">
              <BrainCircuit className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-serif text-white font-medium tracking-wide hidden sm:inline">
              Grafo Ontologico
            </span>
            <span className="text-[10px] font-mono bg-[#141414] text-[#C5A059] px-2 py-0.5 rounded-full border border-[#262626]">
              {filteredNodesCount}/{totalVaultCount} Nodi · {filteredLinksCount} Archi
            </span>
            {filteredNodesCount < totalVaultCount && (
              <button
                type="button"
                onClick={() => {
                  setScopeMode("all");
                  setMaxNodesLimit(-1);
                }}
                className="text-[10px] font-mono bg-[#1C180E] hover:bg-[#2A2211] text-[#E5C170] px-2 py-0.5 rounded-full border border-[#C5A059]/40 hover:border-[#C5A059] transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                title={`Visualizza l'intero grafo con tutti i ${totalVaultCount} nodi`}
              >
                <Eye className="w-2.5 h-2.5 text-[#C5A059]" />
                <span>Tutti</span>
              </button>
            )}

            {/* Vault Intelligence Button on Graph HUD */}
            {onOpenIntelligence && (
              <button
                type="button"
                onClick={onOpenIntelligence}
                className="p-1 px-2.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 bg-[#1C150B] hover:bg-[#2A1E0E] text-[#E5C170] border border-[#C5A059]/40 hover:border-[#C5A059] transition-colors cursor-pointer shadow-xs ml-0.5"
                title="Vault Intelligence: Interroga gli agenti sul grafo (⌘K)"
              >
                <BrainCircuit className="w-3 h-3 text-[#C5A059]" />
                <span className="font-semibold hidden sm:inline">Intelligence</span>
              </button>
            )}
          </div>

          {/* Center Floating Island: Spotlight Node Search */}
          <div className="pointer-events-auto relative w-full sm:w-60 md:w-72 lg:w-80">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-[#C5A059] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cerca nodo, entità, tag..."
                value={nodeSearchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setNodeSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSelectAndPanToNode(searchResults[0].id, searchResults[0].title);
                  } else if (e.key === "Escape") {
                    setIsSearchFocused(false);
                  }
                }}
                className="w-full bg-[#0A0A0A]/90 backdrop-blur-md border border-[#262626] hover:border-[#444] focus:border-[#C5A059] rounded-full pl-8 pr-7 py-1.5 text-xs text-[#EAEAEA] placeholder-[#777] focus:outline-none transition-all shadow-xl font-mono"
              />
              {nodeSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setNodeSearchQuery("");
                    setIsSearchFocused(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666] hover:text-white p-0.5 cursor-pointer"
                  title="Cancella ricerca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Autocomplete Suggestion Dropdown */}
            {isSearchFocused && nodeSearchQuery.trim().length > 0 && (
              <div
                ref={searchDropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5 bg-[#0E0E0E]/95 backdrop-blur-xl border border-[#2B2B2B] rounded-2xl shadow-2xl max-h-72 overflow-y-auto z-50 divide-y divide-[#1A1A1A] animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="px-3 py-1.5 bg-[#141414] text-[10px] font-mono text-[#888] flex items-center justify-between">
                  <span>Risultati trovati ({searchResults.length})</span>
                  <span className="text-[#C5A059]">Invio per Pan</span>
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[#666] font-mono">
                    Nessun nodo trovato con "{nodeSearchQuery}"
                  </div>
                ) : (
                  searchResults.map((item) => {
                    const nodeColor = getNodeColor(item.type);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectAndPanToNode(item.id, item.title)}
                        className="w-full px-3 py-2 text-left hover:bg-[#1A1A1A] transition-colors flex items-center justify-between gap-2.5 group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 border"
                            style={{
                              backgroundColor: `${nodeColor}15`,
                              borderColor: `${nodeColor}40`,
                            }}
                          >
                            {getNodeTypeIcon(item.type)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-serif text-white group-hover:text-[#C5A059] truncate transition-colors">
                              {item.title}
                            </div>
                            <div className="text-[10px] font-mono text-[#777] flex items-center gap-2">
                              <span>{item.metadata?.domain || item.type}</span>
                              {item.tags && item.tags.length > 0 && (
                                <span className="text-[#555]">#{item.tags[0]}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161616] text-[#AAA] border border-[#262626] group-hover:border-[#C5A059]/40 group-hover:text-[#C5A059] transition-colors flex items-center gap-1">
                            <LocateFixed className="w-2.5 h-2.5" />
                            <span>Pan</span>
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Right Floating Island: Scope pills, Pathway, Parameters, Viewport Tools */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-[#0A0A0A]/90 backdrop-blur-md border border-[#222] rounded-full p-1 shadow-xl">
            {/* Scope Selector Tabs */}
            <div className="flex items-center bg-[#141414] p-0.5 rounded-full">
              {[
                { id: "hubs", label: "Hubs", icon: Sparkles, title: "Visualizza i documenti chiave e le relazioni primarie" },
                { id: "domain", label: "Dominio", icon: FolderKanban, title: "Filtra per dominio specifico" },
                { id: "all", label: "Tutto", icon: Globe, title: "Mostra tutti i nodi del Vault" },
              ].map((mode) => {
                const IconComponent = mode.icon;
                const isSelected = scopeMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setScopeMode(mode.id as GraphScopeMode);
                      if (mode.id === "hubs") {
                        setMaxNodesLimit(25);
                        setRelationFilterMode("all");
                      } else if (mode.id === "all") {
                        setMaxNodesLimit(-1);
                        setRelationFilterMode("all");
                      }
                    }}
                    title={mode.title}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#252525] text-[#C5A059] font-medium border border-[#3A3A3A] shadow-xs"
                        : "text-[#888] hover:text-[#DDD]"
                    }`}
                  >
                    <IconComponent className="w-3 h-3" />
                    <span className="hidden md:inline">{mode.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Domain Dropdown (if scope === domain) */}
            {scopeMode === "domain" && availableDomains.length > 0 && (
              <div className="flex items-center gap-1 bg-[#141414] px-2 py-0.5 rounded-full border border-[#333] text-[10px] font-mono animate-in fade-in duration-150">
                <FolderKanban className="w-3 h-3 text-[#10B981] shrink-0" />
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-transparent text-[10px] font-mono text-[#DDD] focus:outline-none cursor-pointer pr-1"
                >
                  <option value="all" className="bg-[#111]">Tutti i domini</option>
                  {availableDomains.map((dom) => (
                    <option key={dom} value={dom} className="bg-[#111]">
                      {dom}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="w-px h-3.5 bg-[#262626] mx-0.5" />

            {/* Pathway Finder Toggle */}
            <button
              type="button"
              onClick={() => setIsPathFinderOpen(!isPathFinderOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
                isPathFinderOpen
                  ? "bg-[#C5A059] text-black font-semibold shadow-md"
                  : "text-[#AAA] hover:text-white hover:bg-[#1C1C1C]"
              }`}
              title="Trova Cammino Ontologico Minimo tra 2 nodi (Algoritmo BFS con evidenziazione dorata)"
            >
              <Route className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Cammino</span>
            </button>

            {/* Auto Content & Tag Overlap Quick Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = new Set(selectedRelationSources);
                if (next.has("content_overlap")) {
                  next.delete("content_overlap");
                } else {
                  next.add("content_overlap");
                }
                setSelectedRelationSources(next);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
                selectedRelationSources.has("content_overlap")
                  ? "bg-teal-950/80 border border-teal-500/60 text-teal-300 font-medium shadow-xs"
                  : "text-[#888] hover:text-white hover:bg-[#1C1C1C]"
              }`}
              title="Attiva/Disattiva archi automatici basati su tag e termini di testo condivisi"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden md:inline">Affinità Contenuto</span>
              {selectedRelationSources.has("content_overlap") && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              )}
            </button>

            {/* Advanced Parameters & Filters Drawer Toggle */}
            <button
              ref={advancedFilterBtnRef}
              type="button"
              onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all cursor-pointer relative ${
                isAdvancedFilterOpen || selectedResourceTypes.size < 5 || selectedRelationSources.size < 8 || minDegreeFilter > 0 || hideOrphanNodes
                  ? "bg-[#1E190E] border border-[#C5A059]/60 text-[#E5C170]"
                  : "text-[#AAA] hover:text-white hover:bg-[#1C1C1C]"
              }`}
              title="Apri pannello Parametri di Fisica e Filtri Ontologici"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Parametri</span>
              {(selectedResourceTypes.size < 5 || selectedRelationSources.size < 8 || minDegreeFilter > 0 || hideOrphanNodes || pinnedNodesCount > 0) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-pulse" />
              )}
            </button>

            <div className="w-px h-3.5 bg-[#262626] mx-0.5" />

            {/* Viewport Zoom & Fullscreen Tools */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleZoom(1.3)}
                className="p-1.5 text-[#888] hover:text-white hover:bg-[#1C1C1C] rounded-full transition-colors cursor-pointer"
                title="Ingrandisci (Zoom In)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleZoom(0.7)}
                className="p-1.5 text-[#888] hover:text-white hover:bg-[#1C1C1C] rounded-full transition-colors cursor-pointer"
                title="Riduci (Zoom Out)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitToView}
                className="p-1.5 text-[#888] hover:text-[#38BDF8] hover:bg-[#1C1C1C] rounded-full transition-colors cursor-pointer"
                title="Adatta vista all'intero grafo (Fit-to-View)"
              >
                <Scan className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1.5 text-[#888] hover:text-[#C5A059] hover:bg-[#1C1C1C] rounded-full transition-colors cursor-pointer"
                title="Ripristina Zoom (100%)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  isFullscreen
                    ? "bg-[#C5A059] text-black hover:bg-[#D4AF65]"
                    : "text-[#888] hover:text-white hover:bg-[#1C1C1C]"
                }`}
                title={isFullscreen ? "Esci da Schermo Intero" : "Espandi a Schermo Intero"}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <div className="w-px h-3.5 bg-[#262626] mx-0.5" />

              {/* Esporta Immagine Grafo (PNG / SVG) */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => handleExportGraphImage("png")}
                  className="flex items-center gap-1 px-2 py-1 text-[#888] hover:text-[#E5C170] hover:bg-[#1C1C1C] rounded-full text-[10.5px] font-mono transition-colors cursor-pointer"
                  title="Esporta il grafo attuale in formato PNG ad alta definizione (2x Retina)"
                >
                  <Camera className="w-3.5 h-3.5 text-[#C5A059]" />
                  <span className="hidden sm:inline">PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportGraphImage("svg")}
                  className="flex items-center gap-1 px-2 py-1 text-[#888] hover:text-[#38BDF8] hover:bg-[#1C1C1C] rounded-full text-[10.5px] font-mono transition-colors cursor-pointer"
                  title="Esporta il grafo in formato vettoriale SVG scalabile per dossier tecnici"
                >
                  <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span className="hidden sm:inline">SVG</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Semantic Pathway Finder HUD Panel */}
        {isPathFinderOpen && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[94%] bg-[#0A0A0A]/95 backdrop-blur-xl border border-[#C5A059]/60 rounded-2xl p-3.5 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex items-center justify-between border-b border-[#222] pb-2">
              <div className="flex items-center gap-2">
                <Route className="w-4 h-4 text-[#C5A059]" />
                <h4 className="text-xs font-serif text-white font-medium">
                  Trova Cammino Ontologico Minimo
                </h4>
                <span className="text-[10px] font-mono text-[#888] bg-[#141414] px-2 py-0.5 rounded-full border border-[#222]">
                  Algoritmo BFS
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPathFinderOpen(false);
                  setPathSourceId(null);
                  setPathTargetId(null);
                }}
                className="text-[#888] hover:text-white p-1 rounded-lg hover:bg-[#1A1A1A] cursor-pointer"
                title="Chiudi cerca cammino"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              {/* Start Node Selector */}
              <div className="space-y-1">
                <label className="text-[10px] text-[#888] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Nodo di Partenza:</span>
                </label>
                <select
                  value={pathSourceId || ""}
                  onChange={(e) => setPathSourceId(e.target.value || null)}
                  className="w-full bg-[#121212] border border-[#333] hover:border-[#555] focus:border-[#C5A059] rounded-xl px-2.5 py-1.5 text-xs text-[#EAEAEA] focus:outline-none cursor-pointer"
                >
                  <option value="">Seleziona o clicca nodo nel grafo...</option>
                  {graphData.nodes.map((n) => (
                    <option key={`src-${n.id}`} value={n.id}>
                      {n.title} ({n.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Node Selector */}
              <div className="space-y-1">
                <label className="text-[10px] text-[#888] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#C5A059]" />
                  <span>Nodo di Destinazione:</span>
                </label>
                <select
                  value={pathTargetId || ""}
                  onChange={(e) => setPathTargetId(e.target.value || null)}
                  className="w-full bg-[#121212] border border-[#333] hover:border-[#555] focus:border-[#C5A059] rounded-xl px-2.5 py-1.5 text-xs text-[#EAEAEA] focus:outline-none cursor-pointer"
                >
                  <option value="">Seleziona o clicca nodo nel grafo...</option>
                  {graphData.nodes.map((n) => (
                    <option key={`dst-${n.id}`} value={n.id}>
                      {n.title} ({n.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pathway Result Banner */}
            {pathSourceId && pathTargetId && (
              <div className="pt-2 border-t border-[#1C1C1C]">
                {activePathway ? (
                  <div className="bg-[#141007] border border-[#C5A059]/40 rounded-xl p-2.5 text-xs font-mono space-y-1.5">
                    <div className="flex items-center justify-between text-[#E5C170]">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        Cammino Trovato in {activePathway.steps.length} salti ({activePathway.pathNodeIds.length} nodi)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const temp = pathSourceId;
                          setPathSourceId(pathTargetId);
                          setPathTargetId(temp);
                        }}
                        className="text-[10px] text-[#A68848] hover:text-[#E5C170] underline cursor-pointer"
                      >
                        Inverti
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#CCC]">
                      {activePathway.steps.map((step, idx) => (
                        <React.Fragment key={`step-${idx}`}>
                          <span className="text-white font-medium">{step.fromTitle}</span>
                          <ArrowRight className="w-3 h-3 text-[#C5A059] shrink-0" />
                          {idx === activePathway.steps.length - 1 && (
                            <span className="text-[#E5C170] font-semibold">{step.toTitle}</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#1A1212] border border-rose-900/40 rounded-xl p-2 text-xs font-mono text-rose-300 text-center">
                    Nessun percorso semantico collega questi due nodi con i filtri correnti. Prova ad espandere l'ambito o ad attivare più fonti ontologiche.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Floating Parameters & Filters Drawer */}
        {isAdvancedFilterOpen && (
          <div
            ref={advancedFilterDropdownRef}
            className="absolute top-16 right-3.5 z-40 w-84 sm:w-96 max-h-[82vh] overflow-y-auto bg-[#0A0A0A]/95 backdrop-blur-xl border border-[#2B2B2B] rounded-2xl shadow-2xl p-4 space-y-4 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-150 divide-y divide-[#1C1C1C]"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#C5A059]" />
                <h4 className="text-xs font-serif text-white font-medium">Parametri & Filtri Grafo</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsAdvancedFilterOpen(false)}
                className="text-[#888] hover:text-white p-1 rounded-lg hover:bg-[#1A1A1A] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Section 1: Fisica e Spostamento Cluster */}
            <div className="pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[#C5A059] font-semibold flex items-center justify-between">
                <span>Fisica & Interazione Nodi</span>
                <Move className="w-3 h-3 text-[#C5A059]" />
              </div>

              <button
                type="button"
                onClick={() => setDragClusterMode(!dragClusterMode)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-[11px] transition-all cursor-pointer border ${
                  dragClusterMode
                    ? "bg-[#1E190E] border-[#C5A059]/50 text-[#E5C170]"
                    : "bg-[#141414] border-[#242424] text-[#888] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5 text-[#C5A059]" />
                  <div className="text-left">
                    <div className="font-semibold text-white">Sposta Cluster Insieme</div>
                    <div className="text-[10px] text-[#888]">I nodi collegati seguono il trascinamento</div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dragClusterMode ? "bg-[#C5A059] text-black" : "bg-[#222] text-[#666]"}`}>
                  {dragClusterMode ? "ON" : "OFF"}
                </span>
              </button>

              {pinnedNodesCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetPinnedNodes}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-[#18120E] hover:bg-[#251A13] border border-[#F97316]/40 text-[#F97316] text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <PinOff className="w-3 h-3" />
                  <span>Sblocca posizioni ({pinnedNodesCount} nodi fissati)</span>
                </button>
              )}
            </div>

            {/* Section 2: Tipologie di Risorsa */}
            <div className="pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[#C5A059] font-semibold flex items-center justify-between">
                <span>Tipologie Risorse ({selectedResourceTypes.size}/9)</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "knowledge", label: "Knowledge OKF", color: "#C5A059" },
                  { id: "procedure", label: "Procedure & SOP", color: "#06B6D4" },
                  { id: "paper", label: "Paper Scientifici", color: "#818CF8" },
                  { id: "rss", label: "Feed RSS", color: "#FB923C" },
                  { id: "note", label: "Note Rapide", color: "#FBBF24" },
                  { id: "troubleshooting", label: "Troubleshooting", color: "#F97316" },
                  { id: "github_repo", label: "GitHub Repo", color: "#A855F7" },
                  { id: "mcp_server", label: "MCP Server", color: "#38BDF8" },
                  { id: "ai_skill", label: "AI Skill", color: "#10B981" },
                ].map((t) => {
                  const isChecked = selectedResourceTypes.has(t.id as any);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedResourceTypes);
                        if (isChecked) {
                          if (next.size > 1) next.delete(t.id as any);
                        } else {
                          next.add(t.id as any);
                        }
                        setSelectedResourceTypes(next);
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] border transition-colors text-left cursor-pointer ${
                        isChecked
                          ? "bg-[#161616] border-[#333] text-white"
                          : "bg-[#0A0A0A] border-[#1C1C1C] text-[#555]"
                      }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: isChecked ? t.color : "#444" }}
                      />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Fonti Ontologiche & Affinità */}
            <div className="pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[#C5A059] font-semibold flex items-center justify-between">
                <span>Fonti di Relazione Ontologica ({selectedRelationSources.size}/10)</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRelationSources(
                        new Set(["explicit", "entities", "mentions", "dependencies", "troubleshooting", "procedure_mesh", "mcp_skills", "hierarchy", "tags", "content_overlap"])
                      )
                    }
                    className="text-[9px] text-[#A68848] hover:text-[#C5A059] underline cursor-pointer"
                  >
                    Tutte
                  </button>
                  <span className="text-[#444]">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRelationSources(new Set())}
                    className="text-[9px] text-[#888] hover:text-[#AAA] underline cursor-pointer"
                  >
                    Nessuna
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {[
                  { id: "content_overlap", label: "Affinità Contenuto & Tag", color: "#14B8A6", desc: "Correlazioni automatiche calcolate su tag e termini di testo condivisi" },
                  { id: "explicit", label: "OKF Esplicito (YAML)", color: "#C5A059", desc: "Archi formali dichiarati nel frontmatter" },
                  { id: "entities", label: "Entità Ontologiche", color: "#38BDF8", desc: "Concetti canonici condivisi" },
                  { id: "mentions", label: "Menzioni Cross-Doc", color: "#A855F7", desc: "Citazioni dirette nel testo dei documenti" },
                  { id: "dependencies", label: "Dipendenze Tecniche", color: "#EC4899", desc: "Librerie, framework e prerequisiti" },
                  { id: "troubleshooting", label: "Fix & Troubleshooting", color: "#F97316", desc: "Soluzioni legate ai sistemi affetti" },
                  { id: "procedure_mesh", label: "Procedure & SOP Mesh", color: "#06B6D4", desc: "Link preventivi da procedure verso nodi di troubleshooting" },
                  { id: "mcp_skills", label: "MCP ➔ AI Skill Synergy", color: "#06B6D4", desc: "Tool server integrati in prompt skills" },
                  { id: "hierarchy", label: "Gerarchia Architetturale", color: "#10B981", desc: "Concept ➔ Architecture ➔ Guide" },
                  { id: "tags", label: "Tag Condivisi", color: "#F59E0B", desc: "Affinità semantica per etichetta comune" },
                ].map((src) => {
                  const isChecked = selectedRelationSources.has(src.id);
                  return (
                    <label
                      key={src.id}
                      className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-[#181818] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = new Set(selectedRelationSources);
                          if (next.has(src.id)) next.delete(src.id);
                          else next.add(src.id);
                          setSelectedRelationSources(next);
                        }}
                        className="mt-0.5 accent-[#C5A059]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#EEE]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                          <span>{src.label}</span>
                        </div>
                        <div className="text-[10px] text-[#777] leading-tight mt-0.5">{src.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Sensibilità Affinità Automatica */}
              {selectedRelationSources.has("content_overlap") && (
                <div className="pt-2 pb-1 border-t border-[#1C1C1C] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#AAA]">
                    <span className="text-teal-400 font-medium">Soglia Minima Affinità:</span>
                    <span className="text-white font-semibold">{minAffinityThreshold}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[20, 30, 45, 60].map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setMinAffinityThreshold(th)}
                        className={`py-1 rounded text-[10px] font-mono transition-all cursor-pointer ${
                          minAffinityThreshold === th
                            ? "bg-teal-950/90 border border-teal-500/80 text-teal-300 font-semibold"
                            : "bg-[#141414] border border-[#262626] text-[#888] hover:text-white"
                        }`}
                      >
                        {th}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Filtri Topologici & Densità */}
            <div className="pt-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[#C5A059] font-semibold">
                Densità & Connessioni
              </div>

              {/* Profondità Connessioni */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#AAA]">Profondità Hop:</span>
                <div className="flex items-center bg-[#141414] p-0.5 rounded-lg border border-[#2E2E2E]">
                  <button
                    type="button"
                    onClick={() => setConnectionDepth(1)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                      connectionDepth === 1 ? "bg-[#38BDF8] text-black font-semibold" : "text-[#888] hover:text-white"
                    }`}
                  >
                    1-Hop
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionDepth(2)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                      connectionDepth === 2 ? "bg-[#38BDF8] text-black font-semibold" : "text-[#888] hover:text-white"
                    }`}
                  >
                    2-Hop
                  </button>
                </div>
              </div>

              {/* Limite Nodi */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#AAA]">Limite Nodi:</span>
                <div className="flex items-center bg-[#141414] p-0.5 rounded-lg border border-[#2E2E2E]">
                  {[15, 30, 60, -1].map((lim) => (
                    <button
                      key={lim}
                      type="button"
                      onClick={() => setMaxNodesLimit(lim)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                        maxNodesLimit === lim ? "bg-[#C5A059] text-black font-semibold" : "text-[#888] hover:text-white"
                      }`}
                    >
                      {lim === -1 ? "Tutti" : lim}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grado Minimo Slider */}
              <div className="space-y-1 pt-1 border-t border-[#1C1C1C]">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#888]">Grado minimo connessioni:</span>
                  <span className="text-[#C5A059] font-bold">{minDegreeFilter === 0 ? "Tutti (0+)" : `${minDegreeFilter}+`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={minDegreeFilter}
                  onChange={(e) => setMinDegreeFilter(parseInt(e.target.value))}
                  className="w-full accent-[#C5A059] cursor-pointer"
                />
              </div>

              {/* Checkbox Nodi Orfani & Etichette */}
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#CCC]">
                  <input
                    type="checkbox"
                    checked={hideOrphanNodes}
                    onChange={(e) => setHideOrphanNodes(e.target.checked)}
                    className="accent-[#C5A059]"
                  />
                  <span>Nascondi nodi orfani (0 connessioni)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#CCC]">
                  <input
                    type="checkbox"
                    checked={showEdgeLabels}
                    onChange={(e) => setShowEdgeLabels(e.target.checked)}
                    className="accent-[#C5A059]"
                  />
                  <span>Mostra etichette di relazione sugli archi</span>
                </label>
              </div>
            </div>

            {/* Reset All Filters */}
            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedResourceTypes(new Set(["troubleshooting", "procedure", "knowledge", "github_repo", "mcp_server", "ai_skill", "article", "paper", "rss", "note"]));
                  setSelectedRelationSources(
                    new Set(["explicit", "entities", "mentions", "dependencies", "troubleshooting", "procedure_mesh", "mcp_skills", "hierarchy", "tags"])
                  );
                  setMinDegreeFilter(0);
                  setHideOrphanNodes(false);
                  setConnectionDepth(1);
                  setMaxNodesLimit(15);
                  handleResetPinnedNodes();
                }}
                className="w-full py-2 rounded-xl bg-[#141414] hover:bg-[#1E1E1E] border border-[#2E2E2E] hover:border-[#C5A059]/40 text-[#AAA] hover:text-[#C5A059] text-[11px] transition-colors cursor-pointer text-center font-medium"
              >
                Ripristina Parametri Iniziali
              </button>
            </div>
          </div>
        )}

        {/* Floating Contextual Focus Pill (when in focus mode) */}
        {scopeMode === "focus" && currentFocusedResource && (
          <div className="absolute top-16 left-3.5 z-30 pointer-events-auto bg-[#0A121E]/95 backdrop-blur-md border border-[#38BDF8]/40 rounded-full pl-3.5 pr-2 py-1.5 shadow-2xl flex items-center gap-3 text-xs font-mono text-[#38BDF8] animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>
                Intorno di: <strong className="text-white">{currentFocusedResource.title}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setConnectionDepth(connectionDepth === 1 ? 2 : 1)}
                className="px-2 py-0.5 rounded-full bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 text-[#38BDF8] text-[10px] font-semibold transition-colors cursor-pointer"
                title="Alterna tra 1-Hop e 2-Hop"
              >
                {connectionDepth === 1 ? "1-Hop" : "2-Hop"}
              </button>
              <button
                onClick={handleFitToView}
                className="p-1 rounded-full hover:bg-[#38BDF8]/20 text-[#38BDF8] transition-colors cursor-pointer"
                title="Adatta vista"
              >
                <Scan className="w-3 h-3" />
              </button>
              <button
                onClick={handleResetToHubs}
                className="px-2 py-0.5 rounded-full bg-[#1C1C1C] hover:bg-[#2A2A2A] text-white text-[10px] transition-colors cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-2.5 h-2.5" />
                <span>Hubs</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-auto">
          {isLegendOpen ? (
            <div className="bg-[#0A0A0A]/95 backdrop-blur-md border border-[#1F1F1F] rounded-xl p-3 text-[10px] font-mono space-y-2 shadow-2xl max-w-xs transition-all animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="text-[#888] uppercase tracking-wider font-semibold border-b border-[#1C1C1C] pb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[#CCC]">
                  <Info className="w-3 h-3 text-[#C5A059]" /> Legenda Nodi & Relazioni
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-[#555]">OKF v0.2</span>
                  <button
                    type="button"
                    onClick={() => setIsLegendOpen(false)}
                    className="p-1 text-[#666] hover:text-white rounded hover:bg-[#222] transition-colors cursor-pointer"
                    title="Nascondi legenda a scomparsa"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
                  <span className="text-[#DDD]">Problemi & Fix</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#C5A059]" />
                  <span className="text-[#DDD]">Knowledge OKF</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                  <span className="text-[#DDD]">MCP & Entità</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#A855F7]" />
                  <span className="text-[#DDD]">GitHub Repo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <span className="text-[#DDD]">AI Skills</span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-[#1C1C1C] space-y-1">
                <div className="text-[#777] text-[9px] font-semibold">Tipi di Connessioni Ontologiche:</div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#C5A059]" />
                  <span className="text-[#BBB]">OKF Esplicito / Citazione</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#38BDF8]" />
                  <span className="text-[#BBB]">Entità / Concetto Comune</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#EC4899]" />
                  <span className="text-[#BBB]">Dipendenza Tecnica</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#F97316]" />
                  <span className="text-[#BBB]">Risoluzione Fix Sistema</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#06B6D4]" />
                  <span className="text-[#BBB]">MCP ➔ AI Skill Synergy</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 border-b-2 border-dashed border-[#14B8A6]" />
                  <span className="text-[#14B8A6] font-medium">Affinità Contenuto & Tag</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 border-b border-dashed border-[#F59E0B]" />
                  <span className="text-[#BBB]">Tag Condivisi</span>
                </div>
              </div>

              <div className="pt-1 text-[9px] text-[#666] border-t border-[#161616] flex items-center justify-between">
                <span>{dragClusterMode ? "✨ Trascina cluster attivo" : "Trascina singoli nodi"}</span>
                <button
                  type="button"
                  onClick={() => setIsLegendOpen(false)}
                  className="text-[#C5A059] hover:underline cursor-pointer"
                >
                  Nascondi
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsLegendOpen(true)}
              className="bg-[#0A0A0A]/90 hover:bg-[#161616] backdrop-blur-md border border-[#2B2B2B] hover:border-[#C5A059]/60 text-[#AAA] hover:text-[#C5A059] rounded-xl px-3 py-2 text-[10px] font-mono shadow-2xl flex items-center gap-2 transition-all cursor-pointer group"
              title="Apri legenda a scomparsa dei nodi e delle relazioni ontologiche"
            >
              <Info className="w-3.5 h-3.5 text-[#C5A059] group-hover:scale-110 transition-transform" />
              <span>Mostra Legenda</span>
              <ChevronUp className="w-3 h-3 text-[#666] group-hover:text-white" />
            </button>
          )}
        </div>

        {/* Hover Link Info Badge */}
        {hoveredLink && (
          <div className="absolute bottom-4 right-4 bg-[#0E0E0E] border border-[#2B2B2B] rounded-xl p-3 shadow-2xl z-20 pointer-events-none max-w-sm">
            <div className="flex items-center gap-2 mb-1">
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: hoveredLink.color || "#C5A059" }} 
              />
              <span className="text-xs font-mono font-medium text-white">
                {hoveredLink.label || hoveredLink.relationType}
              </span>
            </div>
            <div className="text-[11px] text-[#AAA] font-mono">
              {hoveredLink.sourceTitle} ➔ {hoveredLink.targetTitle}
            </div>
            {hoveredLink.description && (
              <p className="text-[10px] text-[#777] mt-1">
                {hoveredLink.description}
              </p>
            )}
          </div>
        )}

        {/* Node Hover/Selection Tooltip Card */}
        {hoveredNode && (
          <div className="absolute top-4 right-4 max-w-sm bg-[#0E0E0E] border border-[#2B2B2B] rounded-xl p-4 shadow-2xl z-20 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold"
                  style={{
                    color: getNodeColor(hoveredNode.type),
                    backgroundColor: "#161616",
                    border: `1px solid ${getNodeColor(hoveredNode.type)}40`,
                  }}
                >
                  {hoveredNode.isEntityNode ? "OKF Entità" : hoveredNode.type.replace("_", " ")}
                </span>
                {typeof hoveredNode.hopDistance === "number" && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#101824] text-[#38BDF8] border border-[#38BDF8]/40">
                    {hoveredNode.hopDistance === 0 ? "🎯 Radice" : hoveredNode.hopDistance === 1 ? "1° Grado (Vicino)" : "2° Grado (2-Hop)"}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#C5A059] bg-[#161616] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
                {hoveredNode.degree} {hoveredNode.degree === 1 ? "Connessione" : "Connessioni"}
              </span>
            </div>

            <h4 className="text-sm font-serif text-white font-medium mb-1">
              {hoveredNode.title}
            </h4>

            {hoveredNode.summary && (
              <p className="text-xs text-[#888] line-clamp-3 leading-relaxed mb-2">
                {hoveredNode.summary}
              </p>
            )}

            {hoveredNode.tags && hoveredNode.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {hoveredNode.tags.slice(0, 4).map((t, idx) => (
                  <span
                    key={`graph-hover-tag-${hoveredNode.id}-${t}-${idx}`}
                    className="text-[9px] font-mono bg-[#141414] text-[#888] px-1.5 py-0.5 rounded border border-[#222]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {!hoveredNode.isEntityNode && (
              <div className="mt-2.5 pt-2 border-t border-[#1C1C1C] flex items-center justify-between text-[10px] text-[#C5A059] font-mono">
                <span>⚡ Clic: apri scheda</span>
                <span className="text-[#38BDF8]">🎯 Doppio clic: pan & isola</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(graphContent, document.body) : graphContent;
};
