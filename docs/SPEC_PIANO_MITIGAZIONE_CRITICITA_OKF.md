---
okf_version: "0.2"
id: "spec-mitigation-criticalities-vault"
title: "Specifica Tecnica e Piano di Mitigazione delle Criticità Architetturali ed Operative"
type: "specification"
domain: "System Resilience, Security & Fault Tolerance"
tags: ["okf", "specification", "mitigation", "resilience", "circuit-breaker", "tri-layer-storage", "deduplication", "mcp-server", "security", "cekikj", "fault-tolerance"]
entities:
  - name: "Tri-Layer Storage Engine"
    type: "technology"
    description: "Architettura di persistenza concorrente su tre livelli: IndexedDB, Server Backup con Ring Buffer e Cloud Firestore"
  - name: "Firestore Circuit Breaker"
    type: "pattern"
    description: "Meccanismo di isolamento automatico in caso di quota 429 con calcolo temporizzato del reset a mezzanotte PST"
  - name: "Atomic File Writer & Self-Healer"
    type: "component"
    description: "Modulo di scrittura atomica su disco con pre-validazione sintattica JSON e ripristino automatico da snapshot"
  - name: "MCP Live State Synchronizer"
    type: "service"
    description: "Sottosistema di allineamento in tempo reale tra stato client IndexedDB e filesystem del server per client MCP esterni"
  - name: "Multi-Tier AI Fallback Chain"
    type: "toolchain"
    description: "Catena di resilienza generativa: Gemini 3.7 Flash -> Flash Latest -> Parser euristico deterministico a 0ms"
relations:
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "governs"
    weight: 1.0
    description: "Impone requisiti normativi e guardrail di sicurezza all'architettura di sistema"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "constrains"
    weight: 0.95
    description: "Fissa i limiti di retry, cooldown e de-duplicazione nella pipeline di acquisizione"
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.9
    description: "Garantisce la conservazione dell'integrità ontologica durante i guasti o i rollback"
  - targetTitle: "Mappa Strutturale di Progetto, Cartelle e File (PROJECT_STRUCTURE)"
    relationType: "documents"
    weight: 0.85
    description: "Mappa i file sorgente e i moduli oggetto degli interventi di mitigazione"
---

# Specifica Tecnica e Piano di Mitigazione delle Criticità Architetturali ed Operative

> **Stato**: APPROVATO / NORMATIVO  
> **Target Applicativo**: Knowledge Vault (OKF v0.2)  
> **Finalità**: Definire i requisiti formali, i circuit breaker e le contromisure prescrittive per neutralizzare i 5 punti di rottura operativi indotti da agenti esterni e le 5 criticità architetturali intrinseche del sistema.

---

## 1. Matrice Globale dei Rischi

| ID | Categoria | Descrizione del Rischio | Probabilità | Impatto | Livello di Rischio | Mitigazione Primaria |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **OP-01** | Operativo | Dirottamento della porta 3000 / Split dev-server da agenti | Alta | Bloccante | 🔴 **CRITICO** | Hard-coded binding in `server.ts`, script npm bloccati, proxy reverse check |
| **OP-02** | Operativo | Esposizione client-side di chiavi segrete (`GEMINI_API_KEY`) | Media | Disastroso | 🔴 **CRITICO** | Linter anti-`VITE_` per secret, proxy `/api/*` forzato, audit server-side |
| **OP-03** | Operativo | Corruzione o deviazione dalla grammatica OKF v0.2 | Alta | Medio-Alto | 🟠 **ALTO** | Validatore runtime in `okfParser.ts`, fallback a tipo `concept` assistito |
| **OP-04** | Operativo | Allucinazione di relazioni e violazione del principio Cekikj | Alta | Alto | 🟠 **ALTO** | Contradiction Gate, rifiuto categorico (`insufficient: true`), hard bounds |
| **OP-05** | Operativo | Bypass della firma canonica di de-duplicazione | Media | Medio | 🟡 **MEDIO** | Normalizzatore universale URL in `conflictResolver.ts` prima del salvataggio |
| **AR-01** | Architetturale | Race Condition e disallineamento nel Tri-Layer Storage | Media | Alto | 🟠 **ALTO** | Riconciliazione timestamp bitemporale, timeout esteso a 20s, local-shadowing |
| **AR-02** | Architetturale | Saturazione quote Google Cloud / Firestore (Errore 429) | Media | Medio-Alto | 🟠 **ALTO** | Circuit Breaker con orologio PST, commutazione istantanea offline senza alert |
| **AR-03** | Architetturale | Rate Limit API Gemini (429/503) e cooldown incontrollato | Alta | Medio | 🟡 **MEDIO** | Cascade fallback su 3 modelli + Heuristic Parser a 0ms, cooldown dinamico |
| **AR-04** | Architetturale | Corruzione del file di backup su disco per crash/interruzioni | Bassa | Disastroso | 🔴 **CRITICO** | `atomicWriteFile` con validazione `JSON.parse` preventiva e roll-forward snapshot |
| **AR-05** | Architetturale | Disallineamento dati su Server MCP per client esterni | Media | Medio-Alto | 🟠 **ALTO** | Flush heartbeat periodico da client a server, endpoint `/api/backup-sync` rapido |

---

## 2. Specifiche delle 5 Criticità Operative (Agenti Esterni)

### OP-01: Protezione della Porta Unica (Porta 3000 Ingress)
* **Vulnerabilità**: Gli agenti autonomi tentano di default di separare frontend e backend, avviando Vite su porta 5173 o Express su 3001, provocando il blocco totale del routing sul container Cloud Run.
* **Specifica di Mitigazione**:
  1. `server.ts` è configurato come **orchestratore unico**: aggancia il middleware di Vite (`middlewareMode: true`) in modalità sviluppo e serve i file statici di `dist/` in produzione.
  2. Il parametro `PORT = 3000` e l'host `0.0.0.0` sono cablati a livello architetturale e non possono essere alterati da variabili ambientali.
  3. Il file `package.json` definisce solo `tsx server.ts` per il comando `dev`, impedendo lanci concorrenti.

### OP-02: Isolamento Rigido dei Segreti Cloud (Anti-Leak)
* **Vulnerabilità**: Tentativi da parte di LLM esterni di importare `@google/genai` nel bundle React client o di creare variabili d'ambiente `VITE_GEMINI_API_KEY`.
* **Specifica di Mitigazione**:
  1. **Divieto di Prefisso**: Qualsiasi variabile d'ambiente contenente credenziali API o segreti non deve mai contenere il prefisso `VITE_`.
  2. **Gateway Server-Side**: Tutte le operazioni di intelligenza artificiale devono essere confinate all'interno di `server/services/` e richiamate esclusivamente tramite chiamate `POST /api/*`.
  3. **Build Guardrail**: L'SDK `@google/genai` è dichiarato solo nelle dipendenze di backend e il build di Vite blocca la compilazione se rileva import server nel tree frontend.

### OP-03: Garanzia di Integrità Ontologica OKF v0.2
* **Vulnerabilità**: Generazione di file o schede con formati non conformi, omissione del blocco frontmatter YAML o invenzione di categorie arbitrarie (es. `tutorial`, `note`, `paper`).
* **Specifica di Mitigazione**:
  1. **Schema Check a Runtime**: Il modulo `src/lib/okfParser.ts` applica la validazione automatica dei 6 tipi canonici (`concept`, `architecture`, `guide`, `specification`, `tool_description`, `prompt_skill`).
  2. **Auto-Sanitizzazione**: Se un agente esterno produce un tipo non contemplato, il parser esegue il re-mapping deterministico su `concept` o `guide` impostando `wasAutoRepaired: true` e preservando il payload originale nei metadati.

### OP-04: Cekikj Zero-Guessing & Contradiction Gate
* **Vulnerabilità**: Gli agenti esterni generano deduzioni o correlazioni sintetiche arbitrarie in assenza di evidenze documentali dirette.
* **Specifica di Mitigazione**:
  1. **Rifiuto Deterministico**: Quando la confidenza dei dati nel Vault è insufficiente per rispondere a un quesito, il motore `server/vaultAgents.ts` solleva `insufficient: true` ed interrompe l'inferenza generativa.
  2. **Contradiction Gate Attivo**: Se un'asserzione interseca un conflitto aperto nel registro (`status: "open"`), la sintesi viene bloccata e viene proposto un bivio analitico esplicito all'utente.
  3. **Hard Bounds**: Nessun agente può superare gli 8 cicli di tool-call o i 2 hop di navigazione relazionale.

### OP-05: Prevenzione Bypass Deduplicazione Canonica
* **Vulnerabilità**: L'importazione di URL con piccole variazioni sintattiche (slash finale, query tracking `?utm_*`, prefissi `http`/`https`) genera record duplicati nel database.
* **Specifica di Mitigazione**:
  1. **Firma Canonica Obbligatoria**: Prima di qualsiasi operazione di persistenza, la funzione `getCanonicalSignature()` in `src/lib/conflictResolver.ts` purifica l'URL rimuovendo fragment, trailing slash e parametri non essenziali.
  2. **Intercettazione a Monte**: Se la firma canonica è già registrata in cache o in Firestore, la risorsa viene aggiornata in modalità `merge` evitando la creazione di un nuovo ID.

---

## 3. Specifiche delle 5 Criticità Architetturali (Codice di Sistema)

### AR-01: Resilienza Tri-Layer Storage e Race Condition
* **Vulnerabilità**: Latenza di risposta Firestore o timeout cold-start che provocano una discrepanza tra IndexedDB locale, file JSON sul server e collezione Firestore remota.
* **Specifica di Mitigazione**:
  1. **Timeout Esteso a 20s**: La chiamata `withFirestoreTimeout` concede 20.000ms al cloud prima di degradare in modalità fallback locale.
  2. **Pre-Flight Dedup nel Catch**: Se la scrittura cloud va in timeout, il blocco `catch` verifica se il record è già in arrivo dal listener `onSnapshot` prima di istanziare un record temporaneo `local-`.
  3. **Reconciler Bitemporale**: `conflictResolver.ts` applica la priorità `remote_newer` vs `local_newer` confrontando i timestamp UTC ISO per garantire la convergenza deterministica dello stato.

### AR-02: Circuit Breaker per Quote Cloud (Errore 429 / Mezzanotte PST)
* **Vulnerabilità**: Esaurimento della quota giornaliera gratuita di Google Cloud Firestore, con conseguenti errori continui e degradazione dell'esperienza utente.
* **Specifica di Mitigazione**:
  1. **Rilevamento Intelligente**: `isQuotaError(err)` rileva i codici `resource-exhausted` o `429`.
  2. **Attivazione Circuit Breaker**: Il sistema imposta `KV_QUOTA_EXCEEDED_FLAG` in LocalStorage, disattiva il network Firestore (`disableNetwork(db)`) e reindirizza tutte le letture/scritture al Livello 1 (IndexedDB) e Livello 2 (`vault-backup.json`).
  3. **Calcolo Reset Automatico**: Il modulo `cacheManager.ts` monitora la mezzanotte del fuso orario del Pacifico (00:00 PST / 09:00 CET). Al superamento dell'orario di reset, il flag viene rimosso automaticamente e la sincronizzazione cloud riprende senza richiedere interventi manuali.

### AR-03: Catena di Fallback Resiliente per le API Gemini
* **Vulnerabilità**: Picchi di carico, degradazione temporanea dei modelli (503) o superamento del rate limit sulle chiamate analitiche.
* **Specifica di Mitigazione**:
  1. **Gerarchia a 3 Stadi**:
     - *Stadio 1*: `gemini-3.7-flash` (massima precisione, schema JSON strutturato).
     - *Stadio 2*: `gemini-flash-latest` / `gemini-3.1-flash-lite` (attivazione istantanea su errore 503 o 429).
     - *Stadio 3*: `heuristicParser.ts` (eseguito localmente a 0ms, estrae tag, titolo, metadati OpenGraph e frontmatter OKF senza alcuna chiamata remota).
  2. **Cooldown Dinamico**: Su errore di saturazione, viene istituito un cooldown di 60s sul provider cloud, durante il quale tutte le catture vengono processate direttamente dallo Stadio 3 per garantire latenza minima e continuità totale.

### AR-04: Scrittura Atomica su Disco e Self-Healing degli Snapshot
* **Vulnerabilità**: Corruzione del file primario `data/vault-backup.json` a causa di crash del container o interruzioni I/O durante la serializzazione.
* **Specifica di Mitigazione**:
  1. **Pre-Validazione JSON**: La funzione `atomicWriteFile` esegue `JSON.parse()` sul buffer di memoria prima di effettuare qualsiasi operazione su disco; se la stringa è troncata o corrotta, la scrittura viene abortita.
  2. **Scrittura Atomica con File Temporaneo**: I dati vengono scritti prima su un file provvisorio `.tmp` e poi rinominati atomicamente (`fs.rename`), garantendo che il file finale non sia mai parziale.
  3. **Self-Healing da Snapshot**: In fase di avvio del server, se `vault-backup.json` risulta mancante o illeggibile, il server carica l'ultimo snapshot valido presente nella directory `data/snapshots/` e auto-ripara il file primario con un log strutturato.

### AR-05: Allineamento Dati in Tempo Reale sul Server MCP
* **Vulnerabilità**: Client MCP esterni (Cursor, Claude Desktop) che interrogano `/api/mcp` possono visualizzare uno stato obsoleto se il client web ha salvato modifiche solo in IndexedDB e non le ha ancora trasmesse al backend.
* **Specifica di Mitigazione**:
  1. **Flush Immediato**: Ogni mutazione eseguita nell'interfaccia utente (creazione, modifica, eliminazione, preferito) invia immediatamente una notifica di sincronizzazione all'endpoint `POST /api/backup-sync`.
  2. **Heartbeat di Sincronizzazione**: Un timer periodico a 30 secondi esegue un controllo di allineamento tra la versione della cache client e la versione su disco del server.
  3. **Metadata Versioning**: Il payload MCP include sempre un campo `vaultTimestamp` e `snapshotVersion` per permettere ai client LLM esterni di validare la freschezza dei dati acquisiti.

---

## 4. Piano di Azione e Checklist di Collaudo Periodico

Per verificare che tutte le mitigazioni rimangano attive e funzionali durante l'evoluzione dell'applicativo:

- [x] **Test 1: Verifica della Porta Unica**
  - Esecuzione `npm run dev`: il server deve attestarsi esclusivamente su `http://0.0.0.0:3000`.
- [x] **Test 2: Sanità del Circuit Breaker**
  - Simulazione offline / disabilitazione rete: l'interfaccia deve notificare la modalità shadow locale senza bloccare le catture.
- [x] **Test 3: Validazione Atomica dei Backup**
  - Controllo integrità della cartella `data/snapshots/`: rotazione FIFO verificata con conservazione degli ultimi 20 stati.
- [x] **Test 4: Verifica Conformità OKF v0.2**
  - Esecuzione `okfParser.ts` su risorse eterogenee: rispetto rigoroso dei 6 tipi e normalizzazione delle entità.
- [x] **Test 5: Coerenza Server MCP**
  - Ispezione delle risposte dell'endpoint `/api/mcp/resources`: corrispondenza 1:1 con l'inventario del Vault.
