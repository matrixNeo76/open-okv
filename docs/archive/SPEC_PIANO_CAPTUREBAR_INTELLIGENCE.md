---
okf_version: "0.2"
id: "spec-piano-capturebar-intelligence-v3"
title: "Analisi di Verifica Dettagliata & Piano Operativo Definitivo: CaptureBar e Vault Intelligence"
type: "specification"
domain: "knowledge-architecture"
tags:
  - "audit-codebase"
  - "capture-bar"
  - "vault-intelligence"
  - "zero-duplication"
  - "multi-turn-memory"
  - "voice-memo"
  - "okf-v0.2"
entities:
  - name: "CaptureBar Component"
    type: "component"
    description: "Componente client in /src/components/CaptureBar.tsx dedicato all'ingestione nel Vault di note, link, repo, server MCP e file con auto-resize e dropdown ontologico a 11 categorie."
  - name: "VaultIntelligenceDrawer Component"
    type: "component"
    description: "Slide-over drawer in /src/components/VaultIntelligenceDrawer.tsx con interfaccia multi-turno, 3 modalità cognitive, trace Cekikj, esportazione OKF/JSON e vista grafo D3."
  - name: "Agentic Query Backend Engine"
    type: "backend_service"
    description: "Motore orchestratore in /server/vaultAgents.ts e endpoint /api/vault/agentic-query con 5 agenti (Orchestrator, Graph Navigator, Deep Content Analyst, Code Specialist, Grounding Verifier)."
relations:
  - targetTitle: "Specifica & Piano: Vault Intelligence Query Engine"
    relationType: "rel:refines"
    weight: 1.0
    description: "Mappatura puntuale dello stato attuale del codice, eliminazione di proposte ridondanti e definizione delle uniche migliorie necessarie."
---

# Analisi di Verifica Approfondita & Piano Operativo Definitivo

> **Audit dello Stato Reale del Codice e Piano di Perfezionamento senza Duplicazioni**  
> **Data**: Settembre 2026 — **Standard**: OKF v0.2 & Architettura Cekikj

---

## 1. Mappatura dello Stato Reale del Codice (Cosa Esiste Già)

Dalla scansione riga per riga di `src/components/CaptureBar.tsx`, `src/components/VaultIntelligenceDrawer.tsx`, `src/App.tsx`, `server.ts` e `server/vaultAgents.ts`, ecco l'inventario esatto delle funzionalità già implementate ed operative:

### Nella CaptureBar (`src/components/CaptureBar.tsx`):
- [x] **Input Elastico**: Textarea ad espansione dinamica da 1 a 4 righe (36px–130px) con gestione `Invio` (cattura) e `Shift+Invio` (a capo).
- [x] **Type Selector Ontologico a Dropdown**: Menu popover a scomparsa per le 11 categorie OKF (`auto`, `knowledge`, `paper`, `rss`, `note`, `troubleshooting`, `mcp_server`, `github_repo`, `ai_skill`, `article`, `link`).
- [x] **Pulsante Graffetta Allegati**: `<input type="file">` per caricamento file verso il buffer di staging (`handleUploadRawFile` per PDF, TXT, MD, immagini, JSON, audio fino a 50MB).
- [x] **Stepper Feedback a 3 Stadi**: `1. Invio -> 2. AI Parsing -> 3. Vault`.
- [x] **Pulsante Intelligence Integrato**: Pulsante `Intelligence (⌘K)` in alto a destra con icona `BrainCircuit` e scorciatoia da tastiera per aprire il drawer.
- [x] **Pulsante Uploader .md**: Scorciatoia rapida per il modal di importazione massiva Markdown.

### Nel Vault Intelligence Drawer (`src/components/VaultIntelligenceDrawer.tsx`):
- [x] **Slide-Over con Espansione**: Drawer scorrevole laterale con toggle a pieno schermo (`isExpanded`).
- [x] **Selettore Modalità Cognitive**: 3 modalità (Sintesi Rapida, Analisi Topologica Grafo, Focus Implementativo).
- [x] **Cronologia Visiva Conversazionale**: Array di messaggi `conversation: ConversationMessage[]` con autoscroll verso l'ultimo messaggio.
- [x] **Stepper Agenti Live**: Visualizzazione in tempo reale delle 5 fasi durante l'orchestrazione (Orchestrator, Graph Navigator, Deep Analyst, Code Specialist, Grounding Verifier).
- [x] **Badge Risorse Citate**: Citazioni interattive cliccabili con anteprima e apertura diretta della scheda nel Vault.
- [x] **Menu Copia & Download**: Esportazione in Documento OKF (.md), Testo Semplice o JSON Strutturato.
- [x] **Salva come Nota OKF**: Archiviazione 1-click della sintesi come nuova scheda permanente nel Vault con entità e relazioni estratte.
- [x] **Vista Grafo D3**: Pulsante per visualizzare i nodi citati direttamente nel canvas topologico D3.
- [x] **Domande Suggerite Cliccabili**: Chip con `suggestedQuestions` in fondo a ogni risposta per rilanciare la query con un click (`handleSend(sq)`).
- [x] **Trace Cekikj e Audit Epistemico**: Esposizione degli step con stato di validità e flag `insufficient: boolean` per il Zero-Guessing.

### Nel Backend (`server/vaultAgents.ts` e `server.ts`):
- [x] **5 Sotto-Agenti**: `runGraphNavigator` (traversal a 2-hop), `runDeepContentAnalyst` (full-text scoring), `runCodeImplementationSpecialist` (GitHub & MCP), `runGroundingVerifier` (validazione citazioni reali nel Vault) e `executeAgenticVaultQuery` (orchestratore centrale con Gemini 3.7 Flash e fallback locale).
- [x] **Conversione File & Audio**: Endpoint `/api/convert-file-to-okf` con `gemini-3.5-transcribe` per elaborare audio e file binari.

---

## 2. Cosa NON Dobbiamo Fare (Evitare Rischi e Inutili Complicazioni)

1. **NESSUN "Dual-Mode Automatico"**: Come già concordato, cercare di capire via euristica se l'utente vuole catturare o fare una domanda romperebbe l'uso della CaptureBar, rischiando di aprire l'Intelligence quando si vuole salvare una nota o un articolo intitolato con un punto interrogativo.
2. **NESSUN "Slash Command Obrigatory" (`/ask`, `/paper`, ecc.)**: La CaptureBar ha già un chiaro dropdown grafico per le 11 categorie; forzare comandi slash aumenterebbe l'attrito cognitivo e la complessità del parsing.
3. **NESSUNA Riscrittura dei 5 Agenti**: I 5 agenti sono già scritti ed operativi in `server/vaultAgents.ts`. Non occorre ricrearli da capo.

---

## 3. Le Uniche 3 Criticità/Mancanze Reali Riscontrate

Dall'audit emergono esattamente tre gap puntuali da risolvere per rendere il sistema impeccabile:

### Gap 1: Placeholder Ingannevole nella CaptureBar
- **Problema attuale**: La riga 350 di `CaptureBar.tsx` recita: *"Chiedi all'agente o incolla link, repo GitHub, server MCP o file .md..."*.
- **Perché è un difetto**: Suggerisce all'utente che scrivendo una domanda nella CaptureBar riceverà una risposta di chat, mentre invece quel testo viene salvato nel Vault come nuova risorsa!
- **Soluzione**: Modificare il placeholder predefinito in:  
  `"Incolla link, repository GitHub, server MCP o digita note da archiviare nel Vault..."`

### Gap 2: Mancanza di Registrazione Vocale Diretta (Voice Memo Push-to-Talk)
- **Problema attuale**: L'utente può caricare file audio già registrati solo tramite la graffetta e il file manager del sistema operativo. Non esiste un pulsante per registrare direttamente dal microfono del browser.
- **Soluzione**: Aggiungere un pulsante Microfono discreto accanto alla graffetta nella CaptureBar.  
  - Click sul microfono -> avvio registrazione nativa (Web Audio / `MediaRecorder` API).
  - Feedback visivo compatto con timer (es. `● 0:08 - Registrazione in corso...`) e tasto stop.
  - Al termine, il blob audio (WebM/WAV) viene convertito in File e inviato direttamente a `handleUploadRawFile(file)` (o convertito istantaneamente in OKF con `gemini-3.5-transcribe`).
  - Risultato: La nota vocale viene trascritta e salvata nel Vault in un solo gesto.

### Gap 3: Il Drawer NON Invia la `history` al Backend (Memoria Multi-Turno Spezzata)
- **Problema attuale**: In `server/vaultAgents.ts` il backend accetta già il parametro `history?: Array<{ role: "user" | "assistant"; content: string }>;`. Tuttavia, in `VaultIntelligenceDrawer.tsx` (riga 254-260), la chiamata `fetch('/api/vault/agentic-query')` **non include** il campo `history` nel payload JSON inviato!  
  Inoltre, nel prompt di `vaultAgents.ts`, il contesto conversazionale pregresso non viene inserito nel prompt di generazione LLM.  
  Di conseguenza, quando l'utente clicca su una domanda suggerita di approfondimento o fa una domanda di follow-up ("E rispetto al primo articolo?"), l'agente risponde ignorando quanto detto al turno precedente.
- **Soluzione**:
  1. In `VaultIntelligenceDrawer.tsx`: serializzare gli ultimi turni della conversazione (fino a 6 messaggi) nel payload inviato come `history`.
  2. In `server/vaultAgents.ts`: integrare la `history` nel prompt LLM in modo che l'orchestrazione Gemini mantenga la memoria contestuale dei turni precedenti.

### Gap 4 (Bonus UX): Ponte Testuale Fluido da CaptureBar a Intelligence
- **Problema attuale**: Se l'utente scrive una domanda nella CaptureBar e poi si rende conto di volerla chiedere all'Intelligence, cliccando su `Intelligence (⌘K)` il drawer si apre con l'input vuoto, e il testo scritto rimane nella CaptureBar.
- **Soluzione**: Se la CaptureBar contiene testo quando l'utente clicca sul pulsante `Intelligence (⌘K)`, il testo viene passato come `initialQuery` al drawer, la CaptureBar si svuota e il drawer si apre con la query precompilata pronta all'invio.

---

## 4. Piano Operativo di Intervento (Chirurgico e a Basso Rischio)

| Fase | File Interessati | Azione Specifica |
| :--- | :--- | :--- |
| **Fase 1: Rifinitura CaptureBar** | `/src/components/CaptureBar.tsx`<br>`/src/App.tsx` | 1. Aggiornare il placeholder (rimuovere *"Chiedi all'agente"*).<br>2. Aggiungere il pulsante Microfono push-to-talk (MediaRecorder) accanto alla graffetta per note vocali immediate.<br>3. Se c'è testo e l'utente clicca `Intelligence (⌘K)`, passare il testo come query iniziale al drawer. |
| **Fase 2: Connessione Memoria Multi-Turno** | `/src/components/VaultIntelligenceDrawer.tsx`<br>`/server/vaultAgents.ts` | 1. Inviare la sequenza di `history` (query utente + sintesi assistente) nel payload di `/api/vault/agentic-query`.<br>2. Includere la cronologia nel prompt LLM in `vaultAgents.ts` per risposte contestuali coerenti. |
| **Fase 3: Verifica e Collaudo** | Terminale / Strumenti | Eseguire `lint_applet` e `compile_applet` per validare l'assenza totale di errori di tipo e regressioni. |

---

## 5. Stato di Implementazione: COMPLETATO con Successo

Tutte le fasi del piano operativo sono state implementate e validate con successo:
1. **Rifinitura CaptureBar**:
   - Placeholder corretto e chiarificato: `"Incolla link, repository GitHub, server MCP o digita note da archiviare nel Vault..."`
   - Registratore vocale integrato push-to-talk (MediaRecorder API nativa con timer live, tasto Annulla e Salva Nota Vocale) e autorizzazione `"microphone"` registrata in `metadata.json`.
   - Ponte testo CaptureBar -> Intelligence collegato: se c'è testo nella barra e l'utente clicca `Intelligence (⌘K)`, la stringa viene precompilata automaticamente nel Drawer.
2. **Connessione Memoria Multi-Turno**:
   - In `VaultIntelligenceDrawer.tsx` il payload invia la cronologia dei turni precedenti (`history`).
   - In `server/vaultAgents.ts` l'orchestratore Gemini 3.7 Flash riceve la cronologia nel prompt mantenendo il contesto per domande di follow-up e suggerimenti d'approfondimento.
3. **Verifica & Collaudo**:
   - `lint_applet` (TypeScript strict) superato a pieni voti.
   - `compile_applet` terminato con esito positivo senza regressioni.
