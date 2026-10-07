---
okf_version: "0.2"
id: "spec-resource-pipelines-taxonomy"
title: "Specifica Tecnica e Tassonomia delle Pipeline di Ingestione OKF v0.2"
type: "specification"
domain: "Knowledge Engineering & Ingestion Pipelines"
tags: ["okf", "specification", "taxonomy", "pipelines", "multimodal", "security", "shadow-mode", "mcp-hardening", "streaming-zip", "provenance", "backfill"]
entities:
  - name: "Two-Stage DocType Resolver"
    type: "subsystem"
    description: "Risolutore ibrido di tipizzazione: triage provvisorio pre-estrazione e classificazione ontologica post-estrazione con docTypeLocked"
  - name: "Ensemble Confidence Evaluator"
    type: "service"
    description: "Valutatore di attendibilità che calibra l'auto-confidenza del LLM confrontandola con l'euristica locale (baseline 0.90 su concordanza piena)"
  - name: "Streaming Archive Security Service"
    type: "security_module"
    description: "Modulo di ispezione preventiva e streaming per archivi ZIP con ratio di decompressione >100, limiti dimensionali e anti-traversal"
  - name: "Modular MCP Secret Scrubber"
    type: "security_module"
    description: "Modulo isolato e testabile di redazione credenziali basato su regex per chiavi sensibili, entropia >4.5 con lunghezza >=24 e allowlist di valori noti"
  - name: "Shared Provenance Helper"
    type: "service"
    description: "Modulo condiviso per il tracciamento atomico di modello, token, costo stimato, durata e hash crittografico in metadata.provenance"
  - name: "Idempotent Backfill & Rollback Manager"
    type: "governance"
    description: "Strumento di migrazione retroattiva a secco (--dry-run) per allineare i documenti esistenti ai nuovi campi OKF v0.2 senza breaking changes"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Definisce i canoni di serializzazione e ontologia per ciascuna risorsa del Vault"
  - targetTitle: "Specifica della Pipeline di Ingestione, Estrazione AI e De-duplicazione OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "extends"
    weight: 0.95
    description: "Dettaglia la matrice comparativa, i requisiti di sicurezza e le differenze di trattamento"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "references"
    weight: 0.9
    description: "Mappa ciascuna pipeline sui servizi Express e Firestore del backend"
---

# Specifica Tecnica e Tassonomia delle Pipeline di Ingestione OKF v0.2

> **Documento Canonico di Architettura, Sicurezza e Governance del Dato**  
> *Versione Specifica*: 0.2.2-calibrated  
> *Principio Guida Fondamentale*: **"Never Lose User Data"** (Resilienza dell'ingestione con validazione non bloccante in Shadow Mode e isolamento dei fallimenti)

---

## 1. Principi Architetturali e Guardrail Fondamentali

1. **Resilienza dell'Ingestione (Zero Data Loss)**:
   - Nessun documento o input utente valido deve essere respinto (*hard fail*) a causa di campi opzionali mancanti o imperfezioni nello schema.
   - L'*hard fail* è confinato unicamente a payload binari fisicamente corrotti (es. Base64 troncato), ad archivi malevoli non conformi ai limiti di sicurezza o a ingestioni totalmente prive di testo o segnale OCR.
2. **Separazione tra Modello Dati e Lenti Visive UI**:
   - I tipi di Firestore (`ResourceItem.type`) rimangono stabili e retrocompatibili (`knowledge`, `paper`, `troubleshooting`, `procedure`, `article`, `github_repo`, `mcp_server`, `ai_skill`, `note`, `rss`, `link`).
   - Le **Macro-Famiglie** agiscono come lenti di navigazione e filtri a fisarmonica nella UI (`CaptureBar` e `Sidebar`), senza riscrivere né appiattire la tassonomia del database.
3. **Sicurezza Proattiva & Difesa in Profondità**:
   - Nessuna esecuzione lato server di codice o runtime esterni (es. server MCP). Solo parsing statico e validazione JSON.
   - Bonifica dei segreti prima della scrittura su storage e prima di qualsiasi emissione di log.
   - Protezione a streaming su archivi decompressi per prevenire saturazioni di memoria RAM.

---

## 2. Risolutore Ibrido di Tipizzazione a Due Stadi (`resolveDocType`)

Per risolvere il paradosso di dipendenza circolare tra classificazione e metadati estratti, il sistema adotta un'architettura **ibrida a due stadi**:

```
[ INPUT GREZZO ] 
      |
      v
[ STADIO 1: Triage Pre-Estrazione ] ------------------------+
  - Analisi segnali immediati (MIME, URL slug, prime 50 righe) |
  - Assegna: docTypeProvvisorio                              |
  - Flag: docTypeLocked = false                              |
      |                                                      v
      v                                            [ Visualizzazione Provvisoria ]
[ STADIO 2: Estrazione Multimodale / OCR / Parser ]
  - Generazione di codice, entità, tabelle, relazioni
      |
      v
[ Risoluzione Ontologica Post-Estrazione ]
  - Analisi del contenuto estratto effettivo:
    * Se ha diagrammi/topologie -> docType = "architecture"
    * Se ha blocchi codice/tutorial -> docType = "guide"
    * Se ha timeline/date storiche -> docType = "concept" (estensione cronologica)
    * Se ha diagnostica errori -> docType = "specification"
    * Default prudenziale -> docType = "concept"
  - Flag: docTypeLocked = true (sbloccabile manualmente dall'utente)
```

### Regole Deterministico-Gerarchiche di Risoluzione (`server/services/deterministicGates.ts`):

```typescript
export interface DocTypeResolutionResult {
  docType: 'concept' | 'architecture' | 'guide' | 'specification' | 'tool_description' | 'prompt_skill';
  stage: 'pre_extraction' | 'post_extraction';
  isLocked: boolean;
  resolutionSource: 'heuristic_signal' | 'content_ast_analysis' | 'user_override';
}

export function resolveDocType(
  type: ResourceType,
  extractedData?: {
    markdownContent?: string;
    hasCodeBlocks?: boolean;
    hasDiagramNodes?: boolean;
    hasTimelineEvents?: boolean;
    hasErrorStack?: boolean;
    domain?: string;
    tags?: string[];
  }
): DocTypeResolutionResult {
  // 1. Tipi con vincolo ontologico deterministico
  if (type === 'mcp_server') return { docType: 'tool_description', stage: 'post_extraction', isLocked: true, resolutionSource: 'heuristic_signal' };
  if (type === 'ai_skill') return { docType: 'prompt_skill', stage: 'post_extraction', isLocked: true, resolutionSource: 'heuristic_signal' };
  if (type === 'troubleshooting') return { docType: 'specification', stage: 'post_extraction', isLocked: true, resolutionSource: 'heuristic_signal' };
  if (type === 'procedure') return { docType: 'guide', stage: 'post_extraction', isLocked: true, resolutionSource: 'heuristic_signal' };
  if (type === 'paper') return { docType: 'specification', stage: 'post_extraction', isLocked: true, resolutionSource: 'heuristic_signal' };

  // 2. Triage provvisorio (Pre-Estrazione se extractedData non e' ancora disponibile)
  if (!extractedData || !extractedData.markdownContent) {
    const provisional = type === 'article' ? 'guide' : 'concept';
    return { docType: provisional, stage: 'pre_extraction', isLocked: false, resolutionSource: 'heuristic_signal' };
  }

  // 3. Risoluzione Post-Estrazione basata sul contenuto reale
  const { hasCodeBlocks, hasDiagramNodes, hasTimelineEvents, hasErrorStack, domain = '', tags = [] } = extractedData;
  const isCloudOrSystem = /cloud|systems|architecture|infrastruttura/i.test(domain) || tags.some(t => /architecture|infra|k8s|aws/i.test(t));
  
  if (hasDiagramNodes || isCloudOrSystem) {
    return { docType: 'architecture', stage: 'post_extraction', isLocked: true, resolutionSource: 'content_ast_analysis' };
  }
  if (hasCodeBlocks || tags.some(t => /tutorial|guida|howto|guide/i.test(t))) {
    return { docType: 'guide', stage: 'post_extraction', isLocked: true, resolutionSource: 'content_ast_analysis' };
  }
  if (hasTimelineEvents || /storia|cronologia|didattica/i.test(domain)) {
    return { docType: 'concept', stage: 'post_extraction', isLocked: true, resolutionSource: 'content_ast_analysis' };
  }
  if (hasErrorStack) {
    return { docType: 'specification', stage: 'post_extraction', isLocked: true, resolutionSource: 'content_ast_analysis' };
  }

  return { docType: 'concept', stage: 'post_extraction', isLocked: true, resolutionSource: 'content_ast_analysis' };
}
```

---

## 3. Valutazione della Confidenza (Anti-Overconfidence Ensemble & Baseline Calibrata)

Non ci si affida all'auto-valutazione numerica arbitraria del modello generativo. Il sistema implementa un **Ensemble Deterministico-Semantico**:

1. **Predizione Euristica Deterministica**: Un classificatore locale a regole estrae un `heuristicType` basandosi su indicatori formali (URL, MIME type, parole chiave di sistema, pattern sintattici).
2. **Predizione del Modello AI**: Il modello suggerisce il suo `aiType`.
3. **Calcolo della Confidenza (Baseline Documentata)**:
   - **Concordanza piena (`heuristicType === aiType`)**: Viene assegnato un valore baseline dichiarato di **`0.90`** (documentato formalmente come placeholder operativo in attesa del dataset di calibrazione empirica da 50-100 campioni etichettati programmato per P1).
   - **Discordanza parziale**: Confidenza ridotta a **`0.60`**.
   - **Input ambiguo (testo generico corto, assenza di URL/estensione)**: Confidenza fissata a **`0.50`**.
4. **Soglia di Segnalazione Elastica (0.75)**:
   - Se `calibratedConfidence >= 0.75`: Salvataggio immediato, classificazione considerata solida.
   - Se `calibratedConfidence < 0.75`: Salvataggio senza blocco, con visualizzazione nella card UI del chip di conferma:
     `🟡 Classificazione incerta: Knowledge (60%) • [Cambia Tipo]`

---

## 4. Specifiche di Sicurezza e Hardening

### 4.1. Protezione da Archivi ZIP con Streaming Extraction (`server/services/archiveSecurityService.ts`)
Per impedire attacchi di tipo *Zip Bomb* e *Directory Traversal*, l'archivio **non viene caricato interamente in memoria**: viene ispezionato ed estratto flusso per flusso (*streaming reader* tramite `yauzl` o streaming pipe):

1. **Controllo del Rapporto di Compressione Header per Header**:
   - Per ogni file presente nell'archivio, viene calcolato `uncompressedSize / Math.max(1, compressedSize)`.
   - Se il rapporto supera **100:1**, l'estrazione viene abortita istantaneamente senza allocare ulteriore memoria (`ZipBombDetectedException`).
2. **Limiti Dimensionali Rigidi in Streaming**:
   - Dimensione massima per singolo file estratto: **20 MB**.
   - Limite cumulativo totale di byte estratti durante lo streaming: **80 MB**. Se la somma dei byte emessi supera la soglia, il flusso si arresta immediatamente.
   - Numero massimo di file consentiti nell'archivio: **300 file**.
3. **Divieto di Symlink ed Escape dei Percorsi**:
   - Qualsiasi entry con attributi symlink o hardlink viene ignorata.
   - Normalizzazione dei percorsi: rifiuto immediato di qualsiasi entry contenente sequenze `..`, percorsi assoluti (`/` o `C:\`) o null byte (`\0`).
4. **De-collisione Atomica dei Nomi**:
   - In presenza di file omonimi in cartelle diverse (es. `docs/README.md` e `src/README.md`), il sistema genera un identificativo normalizzato univoco basato sul percorso relativo normalizzato (`docs_README.md`, `src_README.md`).

### 4.2. Scrubbing Modulare dei Segreti MCP (`server/services/mcpSecretScrubber.ts`)
Estratto in un modulo dedicato e isolato per consentire test unitari esaustivi. La sanitizzazione adotta tre linee di difesa simultanee:

1. **Redazione Basata su Chiavi Sensibili (Key-Based Redaction)**:
   Qualsiasi chiave nel dizionario `env` che corrisponda alla regex:
   ```regex
   /(secret|token|key|pass|credential|auth|bearer|private|cert|jwt|signature|webhook)/i
   ```
   viene forzatamente sostituita con il valore letterale `"[REDACTED_SECRET]"`, a prescindere dal suo contenuto.
2. **Redazione Basata su Entropia con Doppia Condizione**:
   Per stringhe che non corrispondono a chiavi note:
   - Viene applicata la **doppia condizione**: `entropy > 4.5 bits/char AND length >= 24`.
   - In questo modo si evitano falsi positivi su stringhe brevi e si intercettano hash e token lunghi generati casualmente.
3. **Allowlist Preventiva di Valori Innocui**:
   Valori noti standard non vengono mai oscurati anche se associati a chiavi generiche:
   ```typescript
   const SAFE_VALUES_ALLOWLIST = new Set([
     "localhost", "127.0.0.1", "0.0.0.0", "development", "production", "test",
     "staging", "true", "false", "null", "undefined", "0", "1", "utf-8"
   ]);
   ```
4. **Nessun Log dei Payload Grezzi**: Il logger di sistema e la telemetria registrano unicamente l'oggetto post-sanitizzazione.

---

## 5. Governance dei Dati: Shadow Mode e Criteri di Promozione

1. **Modalità di Validazione non Bloccante (Shadow Mode)**:
   - I documenti generati vengono passati attraverso lo schema Zod.
   - Le discrepanze minori non interrompono il salvataggio: vengono scritte nell'array `metadata.okfValidationWarnings`.
   - Il documento riceve `schemaCompliance: "draft_pending_validation"`.
2. **Ciclo di Vita & Smaltimento della Quarantena**:
   - **Vista Dedicata nella Sidebar**: Le risorse con warning vengono evidenziate con un badge nella vista dedicata o nei filtri di qualità.
   - **Risoluzione Guidata**: Nella card della risorsa, l'utente visualizza un drawer sintetico con i campi suggeriti da arricchire.
   - **Promozione a Conforme**: Al primo salvataggio/modifica o approvazione esplicita, i warning vengono azzerati e lo stato promosso a `schemaCompliance: "okf_v0.2_compliant"`.
3. **Criteri di Uscita e Promozione dello Shadow Mode**:
   Il passaggio da Shadow Mode a controlli con hard fail su campi strutturali avverrà solo quando saranno verificate le seguenti metriche:
   - Tasso di validazione spontanea **> 95%** su un campione continuativo di **30 giorni**.
   - **0 hard fail anomali** o perdita di dati su input utente legittimi.

---

## 6. Provenance e Tracciamento dei Costi (`server/services/provenanceHelper.ts`)

Un modulo condiviso registra in `metadata.provenance` di ciascun documento:

```json
{
  "provenance": {
    "modelUsed": "gemini-3.7-flash",
    "pipelineId": "universal-multimodal-ocr",
    "pipelineVersion": "1.2.0",
    "promptVersion": "0.2.2",
    "tokensIn": 1420,
    "tokensOut": 530,
    "estimatedCostUsd": 0.00042,
    "durationMs": 1840,
    "ingestedAt": "2026-09-30T07:15:00.000Z",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

---

## 7. Matrice Ufficiale delle Macro-Famiglie (Viste di Navigazione UI)

| Macro-Famiglia UI | Categorie Ontologiche Incluse | Tipologia di Asset |
| :--- | :--- | :--- |
| **KNOWLEDGE (Asset Ontologici Primari)** | `knowledge`, `note`, `article` | Documenti didattici, cronologie storiche, schemi architetturali, guide tecniche, scratchpad |
| **OPERATIONS (Ingegneria Operativa & Fix)** | `troubleshooting`, `procedure`, `mcp_server`, `github_repo`, `ai_skill` | Diagnostica incidenti, playbook e SOP, configurazioni agenti MCP, repository, prompt |
| **EXTERNAL & FEEDS (Fonti & Canali)** | `paper`, `rss`, `link` | Paper scientifici arXiv/DOI, feed RSS monitorati, link e web utility |
| **MEDIA & SCANSIONI (Vista Trasversale)** | `media_files` (risorse con `imageUrl` / `mediaType`) | Documenti storici, linee del tempo, screenshot, scansioni e PDF con anteprima grafica |
| **BUFFER GREZZO (Staging Buffer)** | `raw_files` | File fino a 50MB in attesa di elaborazione atomica o batch |

---

## 8. Piano Esecutivo Dettagliato P0 (7 Task Operativi)

### Ordine di Merge e Dipendenze:
`Task 0.1` ➔ `Task 0.4` ➔ `Task 0.3` ➔ `Task 0.2` ➔ `Task 0.5` ➔ `Task 0.6` ➔ `Task 0.7`

1. **Task 0.1 — Bonifica Encoding UTF-8 & Lint CI**:
   - File: `docs/*`, `src/constants/*`, `server/*`.
   - Script di verifica lint contro artefatti mojibake (regex `/[ÃÂ]/`).
   - Criterio di accettazione: zero match in tutto il repository.
2. **Task 0.4 — Modulo Modular MCP Secret Scrubber**:
   - File: `server/services/mcpSecretScrubber.ts`.
   - Estrazione della logica di scrubbing dalla route: redazione per chiave, entropia >4.5 con lunghezza >=24, allowlist di valori noti (`production`, `localhost`).
   - Criterio di accettazione: 10 fixture di test verificate (secret oscurati, variabili sicure preservate).
3. **Task 0.3 — Modulo Streaming Archive Security Service (ZIP Guardian)**:
   - File: `server/services/archiveSecurityService.ts` (rinominato da `batchMigrationService`).
   - Streaming reader: ratio >100, max 20MB/file, max 80MB totali decompressi, max 300 file, zero symlink, no `..`.
   - Criterio di accettazione: 6 fixture malevole bloccate senza allocazioni di memoria non sicure.
4. **Task 0.2 — Risolutore Ibrido Two-Stage `resolveDocType`**:
   - File: `server/services/deterministicGates.ts`.
   - Implementazione pre/post-estrazione con flag `docTypeLocked`.
   - Criterio di accettazione: fixture per ciascun ramo ontologico, `docTypeLocked: false` in pre, `true` in post.
5. **Task 0.5 — Modulo Condiviso Provenance Helper**:
   - File: `server/services/provenanceHelper.ts`.
   - Helper per generare payload di audit immutabile (modello, token, costo stimato, durata, hash).
   - Criterio di accettazione: emissione corretta del blocco `provenance` su tutte le route di capture.
6. **Task 0.6 — Script di Backfill Idempotente & Feature Flags**:
   - File: `server/scripts/backfillOkfProvenance.ts`.
   - Supporto per flag `--dry-run` e `--commit` per allineare i documenti esistenti senza rompere la UI.
   - Feature flags (`ENABLE_OKF_SHADOW_VALIDATION`, `ENABLE_ADVANCED_ZIP_GUARDIAN`, `ENABLE_STRICT_MCP_SCRUBBER`).
   - Piano di rollback: script di disattivazione flag o declassamento metadati in caso di emergenza.
7. **Task 0.7 — Suite di Test Contrattuali P0**:
   - File: `server/__tests__/p0ContractSuite.test.ts`.
   - Consolidamento dei test di regressione per encoding, ZIP streaming, MCP scrubbing, `resolveDocType` e provenance.
   - Criterio di accettazione: suite verde in esecuzione CI (`npm test`).
