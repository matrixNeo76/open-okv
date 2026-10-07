---
okf_version: "0.2"
id: "plan-specialized-sota-ingestion"
title: "Piano Operativo di Sviluppo: Ingestione Specialistica Multimodale e Cekikj Gate"
type: "guide"
domain: "Engineering Roadmap & Implementation Plans"
tags: ["okf", "guide", "plan", "roadmap", "cekikj", "ingestion", "papers", "gemini-3.8-flash"]
entities:
  - name: "Cekikj Ingestion Engine"
    type: "technology"
    description: "Motore di validazione epistemica e grounding per la fase di cattura"
  - name: "Specialized Pipelines Router"
    type: "architecture"
    description: "Router a 7 canali per l'elaborazione ontologica su misura"
relations:
  - targetTitle: "Specifica Formale: Pipeline di Ingestione Specialistica SOTA e Cekikj Epistemic Gate (SPEC_SPECIALIZED_SOTA_INGESTION)"
    relationType: "implements"
    weight: 1.0
    description: "Traduce la specifica formale in passi operativi e file di codice"
---

# Piano Operativo di Sviluppo: Ingestione Specialistica Multimodale e Cekikj Gate

> **Piano di Implementazione Tecnico per la Reingegnerizzazione della Pipeline di Ingestione**  
> *Riferimento formale: [`docs/SPEC_SPECIALIZED_SOTA_INGESTION.md`](docs/SPEC_SPECIALIZED_SOTA_INGESTION.md)*  

---

## Modulo 1: Motore dei Cancelli Deterministici Pre-Flight (Backend)
- **File**: `/server/services/deterministicGates.ts`
  - Validazione magic bytes (`%PDF`, `PK` per ZIP, `ID3` o header MPEG per audio, text UTF-8 per markdown).
  - Calcolo checksum SHA-256 nativo (`crypto.createHash('sha256')`).
  - Estrazione metadati container nativi senza AI (XMP, PDF Info, DOI regex match su prima pagina).
  - Test sufficienza dati (min byte, min parole, rifiuto file vuoti o corrotti con errore immediato a 0ms).

## Modulo 2: Motore Cekikj Ingestion Gate & Grounding Post-Flight (Backend)
- **File**: `/server/services/cekikjIngestionGate.ts`
  - Algoritmo di lexical overlap (N-gram grounding score).
  - Validazione e cross-checking delle proof-chain generate rispetto al testo grezzo sorgente.
  - Scanner delle contraddizioni ontologiche con le risorse attuali del Vault.
  - Verifica integrità referenziale del Grafo D3 (tutti i `targetId` devono esistere nel Vault).
  - Assegnazione dello stato epistemico (`certified_grounded`, `partial_insufficient`, `flagged_contradiction`).

## Modulo 3: Pipeline Specializzate & Router Multimodale (Backend)
- **File**: `/server/services/specializedPipelines.ts`
  - Implementazione delle 7 pipeline:
    1. `processAcademicPaperPipeline`: Invio binario diretto a Gemini 3.8/3.7 Flash con Thinking Budget (2048 token), estrazione LaTeX `$$...$$`, venue, abstract, benchmark.
    2. `processGitHubRepoPipeline`: Analisi stack, manifesti, Mermaid diagram, comandi.
    3. `processMcpServerPipeline`: Estrazione formale tool schema JSON, comandi di avvio, permessi.
    4. `processAiSkillPipeline`: Contratti I/O, guardrail, prompt test.
    5. `processArticleWebPipeline`: Estrazione OpenGraph, pulizia HTML, TL;DR, citazioni esatte.
    6. `processSpecNotePipeline`: Frontmatter OKF v0.2, Wikilinks, topologia D3.
    7. `processAudioMeetingPipeline`: Trascrizione diarizzata, timestamp `[mm:ss]`, action items.
- **Integrazione**: In `/server/routes/captureRoutes.ts` connettere gli endpoint `/api/analyze-resource` e `/api/convert-file-to-okf` al nuovo router.

## Modulo 4: CaptureBar Universale & Interfaccia Utente (Frontend)
- **File**: `/src/components/CaptureBar.tsx`
  - Aggiornamento dell'input file per accettare `.pdf, .md, .markdown, .txt, .json, .zip, audio/*`.
  - Aggiunta dell'opzione esplicita **Paper Scientifico (PDF/ArXiv)** con icona dedicata (`GraduationCap`).
  - Mostrare pill/badge di feedback dello stato del Cekikj Gate durante e dopo l'ingestione.
- **File**: `/src/components/KnowledgeUploadDialog.tsx` & `/src/components/RawFileManager.tsx`
  - Uniformazione del drag-and-drop su tutti i modal per accettare PDF e file tecnici senza filtri restrittivi.

## Modulo 5: Collaudo, Verifica Non-Regressione e Build
- Verifica con `lint_applet` e `compile_applet`.
- Test di compilazione ed esecuzione completa.
