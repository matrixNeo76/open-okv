---
okf_version: "0.2"
id: "spec-agent-operational-protocols"
title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
type: "specification"
domain: "Autonomous Agents & Governance"
tags: ["okf", "specification", "agents", "protocols", "governance", "security", "cekikj"]
entities:
  - name: "Autonomous AI Agents"
    type: "technology"
    description: "Modelli ed agenti autonomi operanti nel contesto del Knowledge Vault"
  - name: "Epistemic Guardrails"
    type: "governance"
    description: "Insieme di vincoli per il rifiuto delle congetture e rispetto dei contratti formali"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Impone le regole formali di serializzazione a tutti gli agenti"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "constrains"
    weight: 0.95
    description: "Vincola le operazioni degli agenti all'architettura a 3 livelli del Vault"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "references"
    weight: 0.9
    description: "Fornisce il protocollo di chiamata per l'ingestione delle risorse"
---

# Protocolli Operativi per Agenti Autonomi (AGENTS.md)

> **Regole di Ingaggio, Protocolli di Esecuzione e Vincoli di Sviluppo per Agenti AI nel Knowledge Vault**  
> *Per la documentazione tecnica canonica e i contratti formali dettagliati, consultare i documenti nella cartella `/docs`:*  
> 1. [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) — *Specifica Formale Ufficiale OKF v0.2*  
> 2. [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md) — *Blueprint Architetturale Dettagliato*  
> 3. [`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md) — *Pipeline di Ingestione e Fallback Euristico*  
> 4. [`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md) — *Guida Operativa alla Replicazione Completa*  

---

## 1. Principi Fondamentali di Sviluppo

1. **Rispetto Rigoroso dello Standard OKF v0.2**:
   - Ogni documento tecnico inserito nel Vault deve includere il blocco frontmatter YAML con `okf_version: "0.2"`, `title`, `type`, `domain`, `tags`, `entities` e `relations`.
   - I tipi di documento consentiti sono: `concept`, `architecture`, `guide`, `specification`, `tool_description`, `prompt_skill`.

2. **Sicurezza e Isolamento Cloud**:
   - Nessuna chiave API deve mai essere esposta nel bundle client. Tutte le chiamate generative transitano dal backend Express (`/api/*`).
   - Le query su Firestore devono sempre filtrare per `where("userId", "==", uid)` per conformità con le regole `firestore.rules`.

3. **Integrità del Grafo Topologico**:
   - Quando viene creata o modificata una documentazione tecnica, l'agente deve verificare che le entità dichiarate utilizzino denominazioni canoniche (es. `Anthropic`, `TypeScript`, `Model Context Protocol`, `Google Cloud Firestore`) per consentire al motore di correlazione di tracciare automaticamente gli archi e le relazioni nel grafo D3.

---

## 2. Flusso di Cattura & Inserimento Risorse

Quando un agente ingerisce una risorsa:
- **Fase 1 (Parsing)**: Inviare il payload grezzo all'endpoint `/api/analyze-resource` (per testo, note rapide, link e repository) oppure a `/api/convert-file-to-okf` (per file binari, immagini, screenshot, PDF e audio). Per immagini e screenshot, l'agente deve sfruttare il Vision Mandate multimodale per rilevare automaticamente errori (`troubleshooting`), architetture (`knowledge/architecture`) o codice (`knowledge/guide`).
- **Fase 2 (Validazione Struttura)**: Verificare la presenza di `type`, `title`, `summary`, `tags` e metadati conformi allo schema `ResourceItem`, assicurando `mediaType: "image"` per gli asset visivi.
- **Fase 3 (Persistenza)**: Scrivere il documento sanitizzato su Firestore allegando `userId`, `createdAt: serverTimestamp()` e `updatedAt: serverTimestamp()`.
- **Fase 4 (Notifica & Tracing)**: Emettere un log strutturato con categoria `CAPTURE` e `FIRESTORE`.

---

## 3. Roadmap di Conformità Epistemica: Architettura Cekikj

Gli agenti operativi nel Vault devono allinearsi ai principi epistemici Cekikj (archiviati in `docs/archive/PIANO_IMPLEMENTAZIONE_CEKIKJ.md` e integrati in `docs/SYSTEM_ARCHITECTURE_OKF.md`):
1. **Zero-Guessing & Typed Tools**: Rifiutare sintesi arbitrarie quando i dati sono insufficienti (`insufficient: true`).
2. **Hard Bounds**: Rispettare i limiti operativi (max 8 round di tool-call, max 2 hop nel grafo, timeout rigido).
3. **Contradiction Gate**: Interrompere la sintesi generativa e sollevare un'eccezione esplicita quando un concetto tocca contraddizioni aperte nel registro (`status: "open"`).
4. **Grounding Verificato**: Ogni asserzione finale deve essere mappabile a un chunk testuale verificato o ad un arco relazionale del grafo.

