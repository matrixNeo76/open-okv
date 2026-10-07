---
okf_version: "0.2"
id: "plan-document-refactoring-comparison"
title: "Piano Operativo di Implementazione: Refactoring Documentale e Comparatore Side-by-Side (PLAN_DOCUMENT_REFACTORING_COMPARISON.md)"
type: "guide"
domain: "Knowledge Engineering & Ingestion Pipeline"
tags: ["okf", "plan", "roadmap", "refactoring", "diff-modal", "capturebar", "knowledgereader"]
entities:
  - name: "Document Refactoring Pipeline"
    type: "architecture"
    description: "Pipeline per la ricezione di documenti grezzi, elaborazione neurale e comparazione visiva"
  - name: "DocumentComparisonModal"
    type: "component"
    description: "Nuovo componente React per la revisione side-by-side"
relations:
  - targetTitle: "Specifica Tecnica: Refactoring Intelligente di Documenti con Comparazione Side-by-Side (SPEC_DOCUMENT_REFACTORING_COMPARISON)"
    relationType: "implements"
    weight: 1.0
    description: "Implementa passo dopo passo i requisiti della specifica"
---

# Piano Operativo di Implementazione: Refactoring Documentale & Comparatore Side-by-Side

> **Roadmap Dettagliata delle Fasi di Sviluppo e Verifica — Knowledge Vault OKF v0.2**

---

## 1. Fasi del Piano di Sviluppo

### Fase 1: Estensione dei Tipi e Schema (`src/types.ts`)
- [x] Aggiungere `RefactoringAudit` a `src/types.ts`.
- [x] Aggiungere `rawSourceDocument?: string` e `refactoringAudit?: RefactoringAudit` a `ResourceMetadata`.
- [x] Aggiungere `"document_refactor"` alle opzioni di `ResourceType` o definire la modalità di refactoring in `CaptureBar`.

### Fase 2: Backend Endpoint di Refactoring (`server/routes/captureRoutes.ts`)
- [x] Implementare l'endpoint `POST /api/refactor-document`.
- [x] Estrazione del testo dal file caricato (testo nativo, PDF o decodifica base64).
- [x] Prompt specializzato Gemini:
  - Preservazione rigorosa dei contenuti fattuali.
  - Ristrutturazione logica, titoli H1/H2/H3, elenchi, blocchi di codice ed entità.
  - Calcolo stima punteggio di leggibilità prima/dopo e generazione dell'audit dei miglioramenti.
- [x] Fallback euristico locale resiliente in caso di indisponibilità AI.

### Fase 3: Componente Interfaccia Utente (`src/components/DocumentComparisonModal.tsx`)
- [x] Creazione di `DocumentComparisonModal.tsx`:
  - Visualizzazione side-by-side (a due colonne affiancate su desktop, tab su mobile).
  - Colonna 1: Documento originale intonso, metadati di dimensione, parole e score stimato.
  - Colonna 2: Documento rielaborato in OKF v0.2, visualizzabile come markdown renderizzato o sorgente, con entità e tag estratti.
  - Card di sintesi delle modifiche (*Improvements Applied* con badge colorati e delta score).
  - Possibilità di ritoccare il testo modificato prima del salvataggio.
  - Azioni: "Accetta & Salva nel Vault", "Esporta in Google Doc", "Annulla".

### Fase 4: Integrazione nella `CaptureBar` e nel Flusso di Cattura (`CaptureBar.tsx`, `useVaultCapture.ts`)
- [x] Aggiunta della voce dedicata nei tipi/opzioni di acquisizione della `CaptureBar` (🪄 *Rielabora & Migliora (Doc Refactor)*).
- [x] Quando la voce è selezionata e si allega un file con la graffetta (o si invia del testo), intercettare l'evento e invocare la modale di comparazione invece di salvare istantaneamente.

### Fase 5: Integrazione nel `KnowledgeReader.tsx` e Dettaglio Risorsa
- [x] Se una risorsa contiene `metadata.rawSourceDocument`, mostrare un selettore di visualizzazione:
  - 📄 **Specifica OKF v0.2** (predefinita).
  - 📜 **Fonte Originale Grezza** (per audit e consultazione del testo originale).
  - ⚖️ **Confronta Side-by-Side** (riapre il comparatore).

### Fase 6: Verifica & Compilazione
- [x] Verifica con `compile_applet` e `lint_applet`.
- [x] Collaudo del flusso e verifica dell'esperienza utente.
