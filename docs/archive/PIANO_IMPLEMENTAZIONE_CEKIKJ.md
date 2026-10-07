# Piano Operativo di Implementazione: Architettura Cekikj (Zero-Guessing Knowledge Layer)

> **Documento Guida per lo Sviluppo, Test, Debug e Certificazione di Conformità**  
> **Riferimento Tecnico**: Trilogia di Miodrag Cekikj (*Persistent Knowledge Layer, Graph Traversal, Typed Tools, Hard Bounds, Contradiction Gate*)  
> **Versione Piano**: 1.0.0 — Data: Settembre 2026

---

## Indice dei Contenuti
1. [Obiettivi e Principi Guida](#1-obiettivi-e-principi-guida)
2. [Architettura di Riferimento del Sistema](#2-architettura-di-riferimento-del-sistema)
3. [Roadmap di Sviluppo a Fasi (Milestones)](#3-roadmap-di-sviluppo-a-fasi-milestones)
   - [Fase 0: Baseline, Estensione Modello Dati e Test Suite](#fase-0-baseline-estensione-modello-dati-e-test-suite)
   - [Fase 1: Implementazione degli 8 Typed Tools con Envelope Standard](#fase-1-implementazione-degli-8-typed-tools-con-envelope-standard)
   - [Fase 2: Storage Dual-Layer e Indicizzazione Bitemporale](#fase-2-storage-dual-layer-e-indicizzazione-bitemporale)
   - [Fase 3: Contradiction Register e Contradiction Gate Out-of-Loop](#fase-3-contradiction-register-e-contradiction-gate-out-of-loop)
   - [Fase 4: Bounded Loop Engine (~80 righe) & Hard Bounds Guard](#fase-4-bounded-loop-engine-80-righe--hard-bounds-guard)
   - [Fase 5: Grounding Verifier a Passata Singola](#fase-5-grounding-verifier-a-passata-singola)
   - [Fase 6: Interfaccia Utente Epistemica (Trace Inspector & Contradiction Desk)](#fase-6-interfaccia-utente-epistemica-trace-inspector--contradiction-desk)
   - [Fase 7: Suite di Collaudo, Refusal Test e Debugging](#fase-7-suite-di-collaudo-refusal-test-e-debugging)
4. [Checklist Completa di Implementazione (TODOs con Checkbox)](#4-checklist-completa-di-implementazione-todos-con-checkbox)
5. [Protocollo di Test & Casi di Validazione (Refusal Tests)](#5-protocollo-di-test--casi-di-validazione-refusal-tests)
6. [Criteri di Rilascio e Definizione di Fatto (DoD)](#6-criteri-di-rilascio-e-definizione-di-fatto-dod)

---

## 1. Obiettivi e Principi Guida

1. **Rifiuto Deterministico dell'Indovinello (Zero-Guessing)**:
   Se un'informazione non è presente o è ambigua, il sistema **non deve tentare di indovinare o riformulare ad libitum**. Risponde con il flag `insufficient: true` e un messaggio trasparente.
2. **Separazione Dual-Layer**:
   I frammenti testuali (*Evidence Layer*) non galleggiano isolati: ogni chunk mappa a nodi del grafo concettuale (*Structured Knowledge Layer*).
3. **Governance Esterna al Loop**:
   Il *Contradiction Gate* vive **fuori** dal loop di generazione dell'agente. Nessuna allucinazione o prompt injection può persuadere il modello a forzare una sintesi su concetti contraddittori.
4. **Hard Bounds Rigidi**:
   Loop compatto con limiti invalicabili: **massimo 8 round di tool-call**, token budget, wall-clock timeout e profondità massima di **2 hop** nel grafo. Se un limite scatta, il sistema compone la risposta sulla trace parziale e segnala l'interruzione.
5. **Grounding Verificabile**:
   Ogni claim della risposta finale mappa a una citazione della trace o a un arco percorso. I claim non provati vengono rimossi in una singola passata di revisione.

---

## 2. Architettura di Riferimento del Sistema

```
                      ┌──────────────────────────────────────────────┐
                      │                 USER QUERY                   │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │       BOUNDED LOOP ENGINE (FSM ~80 LOC)      │
                      │  Max 8 Rounds | Max 2 Hops | Token/Time Guard │
                      └───────┬───────────────────────────────┬──────┘
                              │                               │
       Invoca Typed Tools (8) │                               │ Produce Trace
                              ▼                               ▼
     ┌────────────────────────────────────┐       ┌────────────────────────┐
     │           TYPED TOOLS              │       │    EXECUTION TRACE     │
     │ 1. search_evidence                 │       │ - Tools invocati       │
     │ 2. search_knowledge                │       │ - Entità toccate       │
     │ 3. resolve_entity                  │       │ - Archi percorsi       │
     │ 4. traverse (max 2 hops)           │       │ - Chunk citati         │
     │ 5. timeline                        │       │ - Insufficient flags   │
     │ 6. diff (bitemporale)              │       └───────────┬────────────┘
     │ 7. list_contradictions             │                   │
     │ 8. get_source                      │                   │
     └─────────────────┬──────────────────┘                   │
                       │                                      ▼
         Envelope standard con                ┌───────────────────────────────────┐
         `insufficient: boolean`              │      CONTRADICTION GATE           │
                       │                      │    (Out-of-Loop Composer)         │
                       ▼                      │ Ispezione indipendente entità     │
     ┌────────────────────────────────────┐   │ Verifica registro contraddizioni  │
     │      DUAL-LAYER STORAGE            │   └───────────────┬───────────────────┘
     │ Evidence Chunks ◄──► Graph Nodes   │                   │
     │ (valid_from / valid_to bitemporal) │       ┌───────────┴───────────┐
     └────────────────────────────────────┘       │ Conflitto Rilevato?   │
                                                  └───┬───────────────┬───┘
                                                  YES │            NO │
                                                      ▼               ▼
                                       ┌──────────────────┐ ┌───────────────────┐
                                       │ REFUSAL OUTPUT   │ │ DRAFT SYNTHESIS   │
                                       │ Esposizione poli-│ └─────────┬─────────┘
                                       │ cy divergenti,   │           │
                                       │ owner e date.    │           ▼
                                       │ Blocco sintesi!  │ ┌───────────────────┐
                                       └──────────────────┘ │ GROUNDING CHECK   │
                                                            │ Singola passata:  │
                                                            │ rimozione claim   │
                                                            │ non supportati    │
                                                            └─────────┬─────────┘
                                                                      │
                                                                      ▼
                                                            ┌───────────────────┐
                                                            │ VERIFIED RESPONSE │
                                                            │ + Citation Foot-  │
                                                            │   notes & Trace   │
                                                            └───────────────────┘
```

---

## 3. Roadmap di Sviluppo a Fasi (Milestones)

### Fase 0: Baseline, Estensione Modello Dati e Test Suite
- **Scopo**: Definire i tipi TypeScript formali, preparare le strutture dati nel layer di persistenza (IndexedDB e Firestore) e predisporre i casi di test per la regressione.
- **Deliverable**:
  - `src/types.ts` esteso con `EvidenceChunk`, `StructuredKnowledgeEntity`, `TypedRelationship`, `ContradictionRecord`, `TypedToolEnvelope`, `BoundedLoopConfig`, `ExecutionTrace`.
  - Dataset iniziale di contraddizioni note (es. *OKF v0.1 vs OKF v0.2* su `domain`, *Client vs Server API Key Policy*).

### Fase 1: Implementazione degli 8 Typed Tools con Envelope Standard
- **Scopo**: Creare il modulo deterministico dei tool con envelope standard `{ data, insufficient, trace, error }`.
- **File Principale**: `src/lib/cekikj/typedTools.ts`
- **Tool da implementare**:
  1. `search_evidence(query: string, filters?: EvidenceFilters)`: ricerca puntuale sui chunk testuali.
  2. `search_knowledge(query: string, filters?: KnowledgeFilters)`: ricerca sulle entità e concetti curati.
  3. `resolve_entity(queryLabel: string)`: risoluzione etichetta ambigua -> ID canonico + candidati.
  4. `traverse(entityId: string, relationshipType?: string, depth?: number)`: esplorazione archi con limite rigido `depth <= 2`.
  5. `timeline(entityId: string)`: ricostruzione cronologica degli stati dell'entità.
  6. `diff(entityId: string, dateA: string, dateB: string)`: differenziale tra due istanti temporali di vigenza.
  7. `list_contradictions(conceptId?: string)`: consultazione del registro ufficiale delle contraddizioni.
  8. `get_source(sourceId: string)`: provenienza puntuale del chunk o dell'arco.

### Fase 2: Storage Dual-Layer e Indicizzazione Bitemporale
- **Scopo**: Separare i chunk di evidenza dai nodi ontologici, mantenendo gli anchor bi-direzionali (`canonicalEntityAnchors`) e le date bitemporali (`valid_from`, `valid_to`, `recorded_at`).
- **File Principale**: `src/lib/cekikj/dualLayerStore.ts`
- **Funzionalità**:
  - Chunking deterministico con token count e puntatori al documento genitore.
  - Ancoraggio entità canoniche -> chunk di supporto.
  - Filtro temporale `asOf(date)` per query storiche (*"cosa valeva il 2025-06-01?"*).

### Fase 3: Contradiction Register e Contradiction Gate Out-of-Loop
- **Scopo**: Rendere le incongruenze oggetti di prima classe e proteggere la sintesi attraverso un gate separato che non si fida dell'agente.
- **File Principale**: `src/lib/cekikj/contradictionGate.ts`
- **Meccanismo**:
  - Il gate riceve l'intera `ExecutionTrace` dell'agente.
  - Estrae autonomamente tutte le entità e concetti interrogati o citati.
  - Esegue un controllo indipendente su `list_contradictions`.
  - Se individua una contraddizione con status `open`:
    - **BLOCCA** la generazione libera.
    - Emette un payload strutturato con le posizioni contrastanti, le fonti, le date di efficacia e gli owner responsabili.

### Fase 4: Bounded Loop Engine (~80 righe) & Hard Bounds Guard
- **Scopo**: Implementare il motore di esecuzione FSM compatto, sicuro e deterministico.
- **File Principale**: `src/lib/cekikj/boundedEngine.ts`
- **Invarianti Invalicabili**:
  - Limite a 8 round di interazione tool.
  - Timeout wall-clock (default 12.000 ms).
  - Massimo 2 hop di traversal.
  - Early exit se non emergono nuovi nodi canonici per 2 turni consecutivi.
  - **Graceful degradation**: se scatta un limite, compone la risposta sui dati parziali raccolti, segnalando esplicitamente l'evento nell'output (`bounds_exceeded: true`).

### Fase 5: Grounding Verifier a Passata Singola
- **Scopo**: Garantire che ogni claim sia supportato da un'evidenza tracciata.
- **File Principale**: `src/lib/cekikj/groundingVerifier.ts`
- **Logica**:
  - Suddivisione della bozza di risposta in proposizioni atomiche (claims).
  - Verifica di copertura su chunk citati o archi percorsi nella trace.
  - Calcolo del `groundingScore = claimVerificati / claimTotali`.
  - Eliminazione dei claim non supportati o evidenziazione tra parentesi `[Non confermato da evidenze]`.
  - Nessun ciclo infinito di auto-critica: **singola passata deterministica**.

### Fase 6: Interfaccia Utente Epistemica (Trace Inspector & Contradiction Desk)
- **Scopo**: Offrire all'utente la visibilità completa sul processo epistemico.
- **Componenti UI**:
  - `src/components/CekikjInspectorModal.tsx`:
    - Visualizzatore della trace: round impiegati (es. 4/8), token consumati, hop percorsi.
    - Badge di stato del Contradiction Gate (`PASS`, `BLOCKED`, `REFUSAL`).
    - Tabella comparativa per concetti in conflitto.
  - Integrazione nell'Omnibar / SearchBar: toggle "Modalità Epistemica Zero-Guessing (Cekikj)".

### Fase 7: Suite di Collaudo, Refusal Test e Debugging
- **Scopo**: Verificare matematicamente i 5 pilastri della specifica.
- **File di Test**: `src/lib/cekikj/__tests__/cekikjSuite.test.ts`
- **Test Essenziali**:
  1. *Refusal Test*: l'agente riceve una domanda su un concetto con contraddizione aperta e il gate scatta anche se l'agente non ha invocato `list_contradictions`.
  2. *Insufficient Flag Test*: domanda su concetto inesistente -> restituisce `insufficient: true` senza allucinazioni.
  3. *Hard Bounds Test*: query complessa a ventaglio -> arresto garantito al round 8 con risposta parziale e flag.
  4. *Bitemporal Query Test*: verifica vigenza a data T1 vs T2.
  5. *Grounding Pruning Test*: inserimento forzato di un claim fittizio e verifica della rimozione automatica.

---

## 4. Checklist Completa di Implementazione (TODOs con Checkbox)

### Milestone 1: Modello Dati & Contratti (Types)
- [x] **1.1** Aggiornare `src/types.ts` con i tipi per il layer epistemico:
  - [x] `EvidenceChunk` (id, docId, text, tokenCount, entityAnchors, validFrom, validTo)
  - [x] `StructuredKnowledgeEntity` (id, canonicalName, aliases, domain, description, timeline)
  - [x] `TypedRelationship` (id, sourceId, targetId, relationType, weight, validFrom, validTo)
  - [x] `ContradictionRecord` (id, conceptId, conceptName, status, conflictingSources, owner, effectiveDates)
  - [x] `TypedToolEnvelope<T>` (data, insufficient, trace, error)
  - [x] `ExecutionTrace` (rounds, toolCalls, touchedEntities, traversedEdges, boundsStatus)
  - [x] `GroundingReport` (claimsTotal, claimsVerified, prunedClaims, score)

### Milestone 2: Suite degli 8 Typed Tools (`src/lib/cekikj/typedTools.ts`)
- [x] **2.1** Implementare `search_evidence` con ricerca testuale su chunk e flag `insufficient`.
- [x] **2.2** Implementare `search_knowledge` con lookup su entità canoniche e concetti curati.
- [x] **2.3** Implementare `resolve_entity` con risoluzione esatta o lista candidati ambigui.
- [x] **2.4** Implementare `traverse` con vincolo rigido su `depth <= 2` e filtraggio per tipo relazione.
- [x] **2.5** Implementare `timeline` con ordinamento cronologico delle transizioni di stato.
- [x] **2.6** Implementare `diff` per calcolare variazioni tra due date di vigenza (`date_a`, `date_b`).
- [x] **2.7** Implementare `list_contradictions` per estrarre i conflitti aperti su un concetto o globali.
- [x] **2.8** Implementare `get_source` per recuperare i metadati di provenienza e ownership.
- [x] **2.9** Standardizzare l'envelope comune di risposta per tutti gli 8 tool con latenza e trace.

### Milestone 3: Storage Dual-Layer & Registro Contraddizioni
- [x] **3.1** Creare `src/lib/cekikj/dualLayerStore.ts` per gestire la sincronizzazione tra Evidence e Knowledge.
- [x] **3.2** Popolare il dataset di prova con almeno 3 contraddizioni di dominio reali per i test:
  - [x] Contraddizione 1: Policy formato campo `domain` in OKF v0.1 vs OKF v0.2.
  - [x] Contraddizione 2: Gestione API Key Client-Side vs Server-Side Proxy.
  - [x] Contraddizione 3: Strategia di Caching delle Risorse (IndexedDB Cache-First vs Stale-While-Revalidate).
- [x] **3.3** Implementare le query temporali con intervallo `valid_from` <= T <= `valid_to`.

### Milestone 4: Contradiction Gate Out-of-Loop (`src/lib/cekikj/contradictionGate.ts`)
- [x] **4.1** Implementare il compositore indipendente a valle del loop dell'agente.
- [x] **4.2** Aggiungere l'ispezione automatica di tutte le entità citate nella trace.
- [x] **4.3** Configurare il blocco totale della sintesi non verificata in caso di conflitto aperto.
- [x] **4.4** Formattare l'output obbligatorio di divergenza:
  - [x] Elenco policy contrastanti
  - [x] Autori / Team di competenza (owners)
  - [x] Date di validità
  - [x] Invito esplicito all'arbitraggio umano

### Milestone 5: Bounded Loop Engine (`src/lib/cekikj/boundedEngine.ts`)
- [x] **5.1** Scrivere il ciclo di orchestrazione a macchina a stati finiti (struttura snella ~80 righe).
- [x] **5.2** Applicare il limite rigido: `maxRounds = 8`.
- [x] **5.3** Applicare il limite rigido: `maxHops = 2`.
- [x] **5.4** Applicare il timeout wall-clock con `AbortController` (12 secondi).
- [x] **5.5** Implementare il fallback elegante: composizione forzata da trace parziale con avviso all'utente se un bound scatta.

### Milestone 6: Grounding Verifier (`src/lib/cekikj/groundingVerifier.ts`)
- [x] **6.1** Implementare l'estrattore di claim atomici dal testo della risposta.
- [x] **6.2** Verificare la corrispondenza con chunk e archi della trace.
- [x] **6.3** Eseguire la potatura o annotazione dei claim privi di evidenza in una singola passata.
- [x] **6.4** Calcolare e allegare il `GroundingScore` (0 - 100%).

### Milestone 7: Interfaccia Utente & Integrazione Applicativa
- [x] **7.1** Creare la componente `src/components/CekikjInspectorModal.tsx` per ispezionare trace, bound e gate.
- [x] **7.2** Aggiungere il badge "Zero-Guessing Engine" nell'header e nell'Omnibar.
- [x] **7.3** Creare la vista del "Registro Contraddizioni" accessibile dalla sidebar (nuova voce o tab dedicata).
- [x] **7.4** Visualizzare i piedi di pagina delle citazioni con link diretto alla sorgente verificata.

### Milestone 8: Validazione, Collaudo e Certificazione Pass/Fail
- [x] **8.1** Eseguire e validare il *Refusal Test 1* (conflitto rilevato dal gate).
- [x] **8.2** Eseguire e validare il *Test Bitemporale* (filtro a data specifica).
- [x] **8.3** Eseguire e validare il *Test Hard Bounds* (interruzione al round 8).
- [x] **8.4** Eseguire e validare il *Test Grounding* (rimozione claim non supportato).
- [x] **8.5** Eseguire `npm run lint` e `npm run build` verificando zero errori.

---

## 5. Protocollo di Test & Casi di Validazione (Refusal Tests)

### Test Case 1: Refusal Test su Concetto Conteso (Contradiction Gate)
- **Input Query**: *"Qual è la regola ufficiale per la conservazione delle API Key nei client?"*
- **Comportamento Atteso**:
  - L'agente esplora le entità correlate (`API Key Security`, `Client-Side Architecture`).
  - Anche se l'agente tentasse di sintetizzare un compromesso, il **Contradiction Gate** rileva il conflitto aperto nel registro tra la Policy A (Server-Only Proxy) e la Policy B (Client-Side Storage consentito per prototipi).
  - Il gate interviene, **blocca** la sintesi e restituisce un output strutturato con le due policy, le rispettive date di efficacia e gli owner di sicurezza.
- **Criterio di Successo**: Passa se nessuna sintesi arbitraria viene generata e le due posizioni contrastanti sono esposte chiaramente.

### Test Case 2: Insufficient Flag su Informazione Assente (Zero-Guessing)
- **Input Query**: *"Qual è il parametro di configurazione del server Quantum Vault v4.2?"*
- **Comportamento Atteso**:
  - `search_knowledge` e `search_evidence` restituiscono `data: []` con `insufficient: true`.
  - Il sistema non elabora congetture basate sul linguaggio naturale, ma risponde dichiarando l'assenza del dato e terminando entro 2 round.
- **Criterio di Successo**: Passa se l'agente non inventa parametri e segnala esplicitamente la carenza di dati.

### Test Case 3: Hard Bounds Interruption
- **Input Query**: Query ricorsiva ad alto branching creata appositamente per richiedere più di 8 hop.
- **Comportamento Atteso**:
  - Al termine dell'8° round di chiamate ai tool, il loop si arresta forzatamente.
  - La risposta viene composta unicamente con le evidenze parziali raccolte fino al round 8.
  - Viene mostrato il banner di allerta: *"Limite operativo raggiunto (8 round). Risposta parziale generata senza tentare di indovinare."*
- **Criterio di Successo**: Passa se il numero di chiamate è esattamente <= 8 e non si verificano timeout incontrollati.

### Test Case 4: Query Bitemporale
- **Input Query**: *"Qual era lo schema obbligatorio dei tag in data 2024-01-15?"*
- **Comportamento Atteso**:
  - L'agente invoca `timeline` o `diff` specificando la data target.
  - Vengono filtrate solo le regole con `valid_from <= 2024-01-15` e `valid_to >= 2024-01-15`.
  - Non vengono incluse le regole della revisione successiva (es. 2026).
- **Criterio di Successo**: Passa se la risposta ignora la versione attuale e risponde con lo stato storicamente valido alla data indicata.

---

## 6. Criteri di Rilascio e Definizione di Fatto (DoD)

Un task o milestone è considerato **COMPLETO (DONE)** se e solo se:
1. Il codice è interamente scritto in TypeScript con tipi rigidi, senza utilizzo di `any` ingiustificati.
2. Tutti gli 8 Typed Tools rispondono con l'envelope standard `{ data, insufficient, trace, error }`.
3. Il Contradiction Gate è dimostrato indipendente dal loop dell'agente (il blocco avviene tramite logica esterna di composizione).
4. Il linter (`npm run lint`) non restituisce errori di sintassi o import mancanti.
5. Il build di produzione (`npm run build`) compila con successo.
6. La documentazione OKF del Knowledge Vault è aggiornata coerentemente.

---

## 7. Integrazione con CaptureBar & Vault Intelligence Agentico

La roadmap di convergenza tra l'infrastruttura Cekikj (Typed Tools, Bounded Grounding, Contradiction Gate) e le interfacce utente del Vault è formalizzata nel documento:
`/SPEC_PIANO_CAPTUREBAR_INTELLIGENCE.md`

In particolare:
- **CaptureBar Unificata**: Riconoscimento rapido dell'intento con switch automatico tra cattura risorsa e interrogazione agentica (slash commands `/ask`, `/note`, `/mcp`, `/paper`, `/fix`), registrazione vocale diretta (Web MediaRecorder + `gemini-3.5-transcribe`), e peek anti-duplicati in tempo reale.
- **Vault Intelligence Drawer**: Esposizione diretta degli 8 Typed Tools di Cekikj nel loop generativo Gemini 3.7 Flash, memoria contestuale multi-turno, e bottoni operativi interattivi sulle raccomandazioni dell'agente (creazione relazioni nel grafo D3, isolamento subgrafo, apertura Contradiction Desk).

