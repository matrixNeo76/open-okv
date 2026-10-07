---
okf_version: "0.2"
id: "guide-claude-agent-ops"
title: "Specifiche Operative Claude Code (CLAUDE.md)"
type: "guide"
domain: "Agentic Engineering & CLI Development"
tags: ["okf", "guide", "claude-code", "anthropic", "cli", "d3", "replication"]
entities:
  - name: "Claude Code CLI"
    type: "toolchain"
    description: "Interfaccia a riga di comando per agenti autonomi di Anthropic"
  - name: "Knowledge Vault Codebase"
    type: "technology"
    description: "Progetto target per sviluppo, refactoring ed estensione"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.95
    description: "Regole sintattiche da rispettare nella generazione di documentazione"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "governs"
    weight: 0.9
    description: "Vincoli architetturali per le modifiche al codice"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "implements"
    weight: 1.0
    description: "Procedure operative per l'esecuzione e la verifica della compilazione"
---

# Specifiche Operative Claude Code (CLAUDE.md)

> **Integrazione con Claude Code, Anthropic CLI e Toolchain di Sviluppo Assistito**  
> *Per la documentazione tecnica canonica e i contratti formali dettagliati, consultare i documenti nella cartella `/docs`:*  
> 1. [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) — *Specifica Formale Ufficiale OKF v0.2*  
> 2. [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md) — *Blueprint Architetturale Dettagliato*  
> 3. [`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md) — *Pipeline di Ingestione e Fallback Euristico*  
> 4. [`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md) — *Guida Operativa alla Replicazione Completa*  

---

## 1. Comandi di Sviluppo & Build

- **Avvio Server di Sviluppo**: `npm run dev` (Express + Vite unificati su porta 3000)
- **Controllo Tipi & Linter**: `npm run lint` (`tsc --noEmit`)
- **Compilazione di Produzione**: `npm run build` (`vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`)
- **Avvio Server Compilato**: `npm run start` (`node dist/server.cjs`)

---

## 2. Linee Guida per Claude Code

1. **Gestione del Grafo Topologico (`KnowledgeGraph.tsx`)**:
   - Qualsiasi modifica all'algoritmo di simulazione fisica D3 deve preservare i 5 livelli di relazione (ontologiche OKF, entità comuni, menzioni nel testo, tag condivisi, domini affini).
   - I colori degli archi devono mantenere l'armonia cromatica ad alto contrasto (Oro Champagne, Ciano, Ambra, Viola, Smeraldo).

2. **Formattazione dei Documenti OKF**:
   - I file Markdown esportati o renderizzati nel `KnowledgeReader` devono mantenere la separazione pulita tra frontmatter YAML e corpo del testo.
