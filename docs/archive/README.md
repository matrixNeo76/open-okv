---
okf_version: "0.2"
id: "guide-archive-spec-piani"
title: "Archivio Storico dei Piani di Sviluppo e Specifiche Completate"
type: "guide"
domain: "Project Management & Historical Documentation"
tags: ["okf", "guide", "archive", "specifications", "development-plans", "completed"]
entities:
  - name: "Knowledge Vault"
    type: "system"
    description: "Piattaforma ontologica e hub di documentazione tecnica OKF v0.2"
  - name: "Historical Archive"
    type: "governance"
    description: "Registro cronologico dei piani di implementazione e delle specifiche completate con successo"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.9
    description: "Riferimento per la conformità di tutti i documenti archiviati"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "references"
    weight: 0.95
    description: "Architettura risultante dall'esecuzione completa di tutti i piani archiviati"
---

# Archivio Storico dei Piani di Sviluppo e Specifiche Completate

> **Stato dei Documenti**: **100% COMPLETATI, TESTATI E INTEGRATI IN PRODUZIONE**  
> Questa cartella conserva l'intera cronologia progettuale, le analisi di fattibilità, i capitolati tecnici e le roadmap operative completate con successo durante lo sviluppo del Knowledge Vault.
>
> 💡 *Per la documentazione tecnica canonica e le specifiche attive di riferimento, consultare la directory principale [`/docs`](../).*

---

## Indice dei Documenti Archiviati

| Documento Archiviato | Tipologia | Argomento & Scopo | Stato Implementativo |
| :--- | :--- | :--- | :--- |
| **[`PLAN_AI_STUDIO.md`](PLAN_AI_STUDIO.md)** | Piano Operativo | Scomposizione modulare `server.ts` & `App.tsx`, adozione SDK `@google/genai` con thinking budget e function calling nativo. |  **Completato** |
| **[`SPEC_AI_STUDIO.md`](SPEC_AI_STUDIO.md)** | Specifica Tecnica | Analisi critica dei vincoli runtime di Google AI Studio (Node 22, porta 3000, context caching, Files API). |  **Completato** |
| **[`PIANO_PROGETTO.md`](PIANO_PROGETTO.md)** | Blueprint Iniziale | Architettura base del Vault: schema Firestore `resources`, tipologie `article`, `github_repo`, `mcp_server`, `ai_skill`. |  **Completato** |
| **[`PIANO_KNOWLEDGE_OKF.md`](PIANO_KNOWLEDGE_OKF.md)** | Piano Modulo | Introduzione del formato OKF v0.2 con YAML frontmatter, entità, relazioni e Knowledge Graph D3 interattivo. |  **Completato** |
| **[`PIANO_IMPLEMENTAZIONE_CEKIKJ.md`](PIANO_IMPLEMENTAZIONE_CEKIKJ.md)** | Piano Epistemico | Implementazione rigorosa dell'architettura Cekikj (8 Typed Tools, Dual-Layer Store, Contradiction Gate, Hard Bounds). |  **Completato** |
| **[`SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md`](SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md)** | Specifica Epistemica | Specifica formale dei contratti di lettura deterministica, refusal `insufficient: true` e bounded graph traversal. |  **Completato** |
| **[`SPEC_PIANO_CAPTUREBAR_INTELLIGENCE.md`](SPEC_PIANO_CAPTUREBAR_INTELLIGENCE.md)** | Specifica & Piano | Riprogettazione elastica di CaptureBar, dropdown ontologico a 11 categorie, allegati, e drawer multi-turno. |  **Completato** |
| **[`SPEC_PIANO_ORCHESTRATOR_AGENTS_VAULT.md`](SPEC_PIANO_ORCHESTRATOR_AGENTS_VAULT.md)** | Specifica & Piano | Motore multi-agente (`vaultAgents.ts`) con Orchestrator, Graph Navigator, Deep Content Analyst, Code Specialist e Verifier. |  **Completato** |
| **[`SPEC_PIANO_ESPORTAZIONE_OKF_VAULT_INTELLIGENCE.md`](SPEC_PIANO_ESPORTAZIONE_OKF_VAULT_INTELLIGENCE.md)** | Specifica & Piano | Esportazione multiformato (OKF .md, Markdown pulito, JSON) e archiviazione 1-click come nuova scheda nel Vault. |  **Completato** |
| **[`PIANO_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md`](PIANO_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md)** | Roadmap Evolutiva | Modularizzazione hook (`src/hooks/vault/`), Server MCP (`/api/mcp`), potenziamento D3 e versioning bitemporale. |  **Completato** |
| **[`SPEC_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md`](SPEC_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md)** | Specifica Tecnica | Capitolato tecnico delle nuove interfacce esterne (Model Context Protocol, D3 radar minimap, stream SSE). |  **Completato** |
| **[`UI_SPEC_2026_OKF.md`](UI_SPEC_2026_OKF.md)** | Specifica UI/UX | Modernizzazione Header (Omnibar Cmd+K, sort dropdown), StatsBanner collassabile e terminale agentico. |  **Completato** |
| **[`ACCESS_SPEC.md`](ACCESS_SPEC.md)** | Specifica Accesso | Protocolli di consultazione documentale interna ed esterna per sviluppatori, agenti autonomi e Claude Code. |  **Completato** |
