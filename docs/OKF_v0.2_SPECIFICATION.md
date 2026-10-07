---
okf_version: "0.2"
id: "spec-okf-v02-formal"
title: "Specifica Formale Ufficiale dello Standard OKF v0.2 (Open Knowledge Format)"
type: "specification"
domain: "Knowledge Architecture & Ontological Systems"
tags: ["okf", "okf-v0.2", "specification", "schema", "yaml", "ontology", "entities", "relations", "cekikj", "llm-interop"]
entities:
  - name: "Open Knowledge Format v0.2"
    type: "specification"
    description: "Standard aperto e deterministico per la serializzazione di conoscenza strutturata per LLM e agenti autonomi"
  - name: "OKF Frontmatter"
    type: "component"
    description: "Blocco YAML di testa che dichiara metadati, entità canoniche e relazioni tipizzate"
  - name: "Document Type Taxonomy"
    type: "taxonomy"
    description: "I 6 tipi di documento canonici: concept, architecture, guide, specification, tool_description, prompt_skill"
  - name: "Relational Edge Schema"
    type: "schema"
    description: "Contratto formale degli archi orientati tra documenti con peso numerico e semantica direzionale"
  - name: "Entity Dictionary"
    type: "ontology"
    description: "Array di entità normalizzate per abilitare la correlazione topologica automatica nel grafo D3"
relations:
  - targetTitle: "Knowledge Vault: Architettura di Sistema OKF v0.2 (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "implements"
    weight: 1.0
    description: "Fornisce la specifica formale dei dati su cui si basa l'architettura completa del Vault"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "governs"
    weight: 0.95
    description: "Stabilisce le regole di conformità per gli output estratti dal modello Gemini 3.7 Flash"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "references"
    weight: 0.9
    description: "Guida operativa per la costruzione e l'implementazione del parser e serializzatore OKF"
---

# Specifica Formale Ufficiale dello Standard OKF v0.2 (Open Knowledge Format)

> **Versione**: 0.2.0  
> **Stato**: STABLE / NORMATIVO  
> **Finalità**: Fornire a modelli linguistici (LLM), agenti autonomi e sistemi di knowledge management un formato standardizzato, bidirezionale e privo di ambiguità per rappresentare la conoscenza tecnica in formato Markdown + YAML Frontmatter.

---

## 1. Obiettivo e Principi Guida

Lo standard **OKF (Open Knowledge Format) v0.2** risolve il problema fondamentale dell'ambiguità e del "guessing" degli agenti AI quando ingeriscono documentazione tecnica non strutturata.

1. **Dual-Layer Knowledge**: Ogni documento separa nettamente il **Livello Ontologico** (metadati, entità, relazioni nel frontmatter YAML) dal **Livello Evidenziale** (testo Markdown, snippet, formule, diagrammi nel corpo).
2. **Deterministic Interoperability**: Qualsiasi LLM esterno che legge un documento OKF v0.2 è in grado di comprendere istantaneamente la posizione del documento nel grafo globale della conoscenza senza dover eseguire ricerche euristiche non affidabili.
3. **Canonical Normalization**: Le entità e le relazioni utilizzano denominazioni standardizzate per garantire che algoritmi di graph-traversal e grafi fisici (come D3 Force) colleghino automaticamente i nodi.

---

## 2. Schema Formale del Frontmatter YAML

Ogni documento conforme deve aprirsi con tre trattini `---`, terminare con tre trattini `---`, e rispettare la seguente grammatica:

```yaml
---
okf_version: "0.2"                    # [OBBLIGATORIO] Deve essere "0.2"
id: "string"                          # [FACOLTATIVO] Identificativo univoco (es. "synth-1710000000" o ID Firestore)
title: "string"                       # [OBBLIGATORIO] Titolo chiaro, univoco e descrittivo (max 120 caratteri)
type: "concept"                       # [OBBLIGATORIO] Uno dei 6 tipi canonici (vedi Sezione 3)
domain: "string"                      # [OBBLIGATORIO] Ambito tematico (es. "AI Systems", "Security", "Databases")
tags:                                 # [OBBLIGATORIO] Array di tag in minuscolo (minimo 2 tag)
  - "tag-uno"
  - "tag-due"
entities:                             # [OBBLIGATORIO] Array di entità chiave (minimo 1 entità)
  - name: "Nome Canonico"             # [OBBLIGATORIO] Nome proprio/tecnico dell'entità
    type: "technology"                # [OBBLIGATORIO] Tipo entità (concept | framework | technology | toolchain | pattern | organization)
    description: "Sintesi ruolo"      # [RACCOMANDATO] Spiegazione del ruolo dell'entità nel documento
relations:                            # [RACCOMANDATO] Array di archi orientati verso altri nodi (può essere vuoto [])
  - targetTitle: "Titolo Target"      # [OBBLIGATORIO se presente] Titolo esatto del documento target
    targetId: "target-id-opzionale"   # [FACOLTATIVO] ID univoco della risorsa collegata
    relationType: "references"        # [OBBLIGATORIO] Vocabolario controllato (vedi Sezione 4)
    weight: 0.85                      # [OBBLIGATORIO] Float compreso tra 0.1 e 1.0 indicante l'intensità della relazione
    description: "Motivazione arco"   # [RACCOMANDATO] Breve spiegazione logica del collegamento
---
```

---

## 3. Tassonomia dei 6 Tipi Canonici di Documento

Un documento OKF v0.2 **DEVE** appartenere a uno dei seguenti 6 tipi nel campo `type`:

| Tipo | Definizione Semantica | Quando Utilizzarlo | Esempio |
| :--- | :--- | :--- | :--- |
| **`concept`** | Teoria, principio astratto, definizione o modello concettuale. | Spiegare *cosa* è una tecnologia, una formula, un paradigma o un'idea. | Cos'è il Vectorless RAG, Teorema CAP. |
| **`architecture`** | Blueprint strutturale, diagramma di componenti, flusso dati o topologia. | Descrivere *come* i moduli di un sistema software/hardware interagiscono tra loro. | Architettura del Vault, Topologia Microservizi. |
| **`specification`** | Contratto normativo, standard formale, protocollo di comunicazione o schema API. | Definire regole rigide, interfacce, grammatiche o requisiti tecnici vincolanti. | La specifica OKF v0.2, Protocollo MCP v1.0. |
| **`guide`** | Procedura passo-passo, tutorial, workflow di onboarding o troubleshooting. | Spiegare *come fare* qualcosa dall'inizio alla fine in modo sequenziale. | Guida alla Replicazione del Vault, Setup OAuth. |
| **`tool_description`** | Scheda descrittiva di un tool, server MCP, CLI, SDK o funzione autonoma. | Censire le capacità, argomenti, input/output ed esempi d'uso di uno strumento. | Server MCP GitHub, Docker CLI, Gemini Flash SDK. |
| **`prompt_skill`** | Istruzione di sistema, prompt specializzato, skill per agenti autonomi. | Definire direttive di comportamento, ruoli e vincoli per modelli generativi. | System Prompt di Ingestione, Skill Focus Mode. |

*(Nota di compatibilità: I tipi legacy come `research`, `paper`, `snippet` sono ammessi solo come estensioni del tipo `concept` o `guide`).*

---

## 4. Vocabolario Controllato delle Relazioni Topologiche

Il campo `relationType` all'interno dell'array `relations` consente agli algoritmi di graph navigation di calcolare percorsi semantici rigorosi. I tipi ammessi sono:

- **`implements`** (peso raccomandato: `1.0`): Il documento implementa concretamente quanto descritto nel target (es. codice/sistema che implementa una specifica).
- **`governs`** (peso raccomandato: `0.9 - 1.0`): Il documento impone regole, vincoli o protocolli di governance al target (es. policy di sicurezza, contratti epistemici).
- **`depends_on`** (peso raccomandato: `0.8 - 0.9`): Il documento non può funzionare o essere compreso senza il target (dipendenza funzionale).
- **`extends`** (peso raccomandato: `0.7 - 0.9`): Il documento amplia, specializza o aggiorna i concetti definiti nel target.
- **`documents`** (peso raccomandato: `0.8 - 0.95`): Il documento descrive, analizza o funge da documentazione esplicita per il target.
- **`references`** (peso raccomandato: `0.5 - 0.8`): Il documento cita o include menzioni contestuali al target come risorsa correlata.
- **`conflicts_with`** (peso raccomandato: `0.9`): Indica una contraddizione aperta o un contrasto epistemico (attivazione del Contradiction Gate).

---

## 5. Standard di Normalizzazione delle Entità

Per permettere al motore topologico D3 di raggruppare i nodi in Hub Tematici:
1. **Denominazione Canonica**: Utilizzare sempre il nome proprio industriale o scientifico privo di versioning puntuale non essenziale (es. `TypeScript`, non `TS 5.4`; `Google Cloud Firestore`, non `Firestore DB v1`).
2. **Tipi di Entità Ammessi**:
   - `technology` (linguaggi, database, librerie: es. *React*, *Express*, *D3.js*)
   - `concept` (paradigmi e astrazioni: es. *Vectorless RAG*, *Bitemporal Knowledge*, *Zero-Guessing*)
   - `framework` (architetture operative: es. *Model Context Protocol*, *Open Knowledge Format*)
   - `organization` (aziende e consorzi: es. *Anthropic*, *Google DeepMind*, *W3C*)
   - `toolchain` (suite e strumenti eseguibili: es. *Vite*, *npm*, *Docker*)
   - `pattern` (design pattern software: es. *Ring Buffer*, *Observer*, *Repository Pattern*)

---

## 6. Algoritmo di Validazione Sintattica OKF v0.2

Un validatore software o un LLM deve applicare le seguenti verifiche di conformità:

1. **Frontmatter Delimiter Check**: Il testo deve iniziare con `^---\s*\n` e contenere una chiusura `\n---\s*`.
2. **Version Check**: Deve essere presente `okf_version: "0.2"` o `okfVersion: "0.2"`.
3. **Type Check**: Il campo `type` deve appartenere rigorosamente all'insieme dei 6 tipi canonici.
4. **Entity Count Check**: L'array `entities` deve contenere almeno 1 elemento con campi `name` e `type`.
5. **Tags Check**: L'array `tags` deve contenere almeno 2 tag validi non vuoti.
6. **Integrity Score**: Se tutti i controlli hanno esito positivo, il documento riceve il flag `okfValidationPassed = true` e viene marcato come `okf_v0.2_compliant`. In caso contrario, viene catalogato come `draft_pending_validation`.
