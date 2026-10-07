---
okf_version: "0.2"
title: "Specifica di Conformità Architetturale: Trilogia Cekikj (Knowledge Layer, Typed Tools e Contradiction Gate)"
type: "specification"
domain: "Agentic Systems & Epistemic Architecture"
tags: ["okf", "specification", "cekikj", "knowledge-layer", "typed-tools", "contradiction-gate", "hard-bounds", "grounding-check", "bitemporal"]
entities:
  - name: "Evidence Layer"
    type: "layer"
    description: "Livello di memorizzazione dei chunk testuali grezzi, citazioni e vettori non strutturati"
  - name: "Structured Knowledge Layer"
    type: "layer"
    description: "Livello ontologico esplicito di entità canoniche, concetti risolti e relazioni tipizzate"
  - name: "Typed Tools"
    type: "toolchain"
    description: "Suite di 8 strumenti deterministici in sola lettura con contratti rigidi e flag insufficient"
  - name: "Contradiction Gate"
    type: "governance"
    description: "Compositore a valle indipendente dall'agente che blocca la sintesi in caso di collisione di fonti"
  - name: "Bounded Loop Engine"
    type: "orchestration"
    description: "Macchina a stati finiti con limiti invalicabili su round (max 8), token, timeout e hop nel grafo"
  - name: "Grounding Verifier"
    type: "verification"
    description: "Passata singola di validazione post-sintesi che mappa ogni claim a un edge o citazione della trace"
relations:
  - targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relationType: "extends"
    weight: 1.0
    description: "Eleva il Knowledge Vault a motore epistemico affidabile con garanzie zero-guessing"
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "governs"
    weight: 0.95
    description: "Stabilisce le regole di ingaggio per agenti esterni che interrogano il Vault"
  - targetTitle: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)"
    relationType: "constrains"
    weight: 0.9
    description: "Vincola la navigazione a grafo con traversal tipizzato e limiti di hop"
---

# Specifica di Conformità Architetturale: Trilogia Cekikj
### *Knowledge Layer, Typed Tools, Hard Bounds e Contradiction Gate*

> **Riferimento accademico/tecnico**: Miodrag Cekikj, *"Designing a Persistent Knowledge Layer That Refuses to Guess"* (Parte 1), *"Making the Knowledge Layer a Graph You Actually Traverse"* (Parte 2), *"Stop Giving Your AI Agent a Search Box and Start Giving It Typed Tools, Hard Bounds, and a Gate It Cannot Talk Past"* (Parte 3) — Towards Data Science / AI Advances.

---

## 1. Tesi Centrali dell'Architettura

1. **Vocabolario degli Strumenti**: *"An agent's reasoning is bounded by the vocabulary of its tools"*. Il ragionamento dell'agente è strettamente vincolato al modello mentale fornitogli dai suoi strumenti.
2. **La Trappola del Search Box**: Uno strumento generico `vector_search(query)` con budget di tentativi produce solo *iterated guessing* (congetture riformulate ad ogni iterazione), e non conoscenza verificabile e deterministica.
3. **Il Mondo (Dual-Layer Knowledge)**: L'agente non deve navigare solo frammenti di testo non strutturato (*Evidence Layer*), ma un livello ontologico esplicito di concetti canonici, entità risolte, relazioni tipizzate ed evoluzione temporale (*Structured Knowledge Layer*).
4. **Typed Tools (8 Strumenti Read-Only)**: L'implementazione reale espone 8 contratti fissi con flag esplicito `insufficient: boolean`:
   - `search_evidence(query, filters?)`: ricerca sui chunk grezzi (evidence).
   - `search_knowledge(query, filters?)`: ricerca sulla conoscenza curata/canonica.
   - `resolve_entity(query_label)`: da etichetta ambigua a ID canonico o candidati.
   - `traverse(entity_id, relationship_type, depth=1..2)`: esplorazione di archi tipizzati con vincolo di hop.
   - `timeline(entity_id)`: vista temporale degli stati di un'entità.
   - `diff(entity_id, date_a, date_b)`: differenziale tra versioni/stati nel tempo.
   - `list_contradictions(concept_id)`: interrogazione del registro delle contraddizioni.
   - `get_source(chunk_id | edge_id)`: recupero della fonte puntuale.
5. **Hard Bounds**: Loop compatto (~80 righe), limiti invalicabili (max 8 round, token budget, timeout, max 2 hop). Se un limite scatta, il sistema non collassa: forza la composizione parziale da quanto raccolto e lo dichiara apertamente.
6. **The Contradiction Gate**: Governance fuori dal loop. *"Governance che vive dentro il loop è consultiva; governance che sopravvive all'agenzia deve vivere fuori di esso"*. Un composer a valle verifica indipendentemente le entità toccate e blocca la sintesi forzata se esistono contraddizioni aperte.
7. **Grounding Check**: Passata singola di revisione in cui ogni affermazione deve avere una citazione precisa nella trace o un percorso di archi realmente attraversato.

---

## 2. I 6 Pilastri di Conformità (Criteri Pass / Fail)

| Pilastro | Requisito Fondamentale | Criterio di Superamento (Pass/Fail) |
| :--- | :--- | :--- |
| **1. Dual-Layer Knowledge** | Separazione netta tra Evidence Layer (chunk testuali/vettori) e Structured Knowledge Layer (entità, concetti, relazioni). | **Pass**: Ogni evidenza testuale mappa a ID canonici nel grafo. Nessun retrieval opera solo su chunk isolati privi di semantica. |
| **2. Typed Tooling** | Contratti tipizzati con envelope standard (`data`, `insufficient: boolean`, `source_trace`), non una casella di testo generica. | **Pass**: Nessuna chiamata a testo libero senza schema. Tutti gli 8 tool esposti con schema rigido e flag `insufficient`. |
| **3. Bitemporal & State** | Gestione della dimensione temporale esplicita (`valid_from`, `valid_to` vs data di registrazione a sistema). | **Pass**: L'agente risponde a *"quale regola valeva il giorno X?"* filtrando per intervalli di vigenza temporale reale. |
| **4. Contradiction Register & Gate** | Registro esplicito delle incongruenze verificato da un compositore indipendente dal loop dell'agente. | **Pass**: In presenza di conflitti aperti, il gate blocca la sintesi arbitraria ed espone le fonti contrastanti con owner e date. |
| **5. Bounded Loop Engine** | Loop snello, deterministico (~80 righe) con vincoli rigidi (max 8 round, budget, timeout, 2 hop) e fallback trasparente. | **Pass**: Impossibilità per l'LLM di bypassare i limiti o forzare allucinazioni; segnalazione esplicita del troncamento. |
| **6. Grounding Check** | Ogni claim della risposta finale è riconducibile a una citazione della trace o a un edge realmente percorso. | **Pass**: Claim non supportati rimossi o segnalati con revisione deterministica a singola passata (no loop all'infinito). |

---

## 3. Piano di Allineamento & Roadmap Operativa (Fasi 0 - 5)

- **Fase 0 — Baseline & Audit**: Mappatura tool attuali, audit ontologico, definizione test suite *"refusal test"* (domande con conflitti noti).
- **Fase 1 — Audit del Tool Surface & Refactoring**: Implementazione degli 8 Typed Tools con envelope comune (`data`, `insufficient`, `trace`).
- **Fase 2 — Strutturazione Dati (Grafo + Bitemporalità)**: Associazione di ancoraggi bi-direzionali tra chunk e nodi ontologici; inserimento di `valid_from` e `valid_to` sugli archi e stati.
- **Fase 3 — Contradiction Register & Out-of-Loop Gate**: Tabella/collezione dedicata alle contraddizioni; compositore a valle disaccoppiato dall'agente.
- **Fase 4 — Bounded Orchestration Engine**: Macchina a stati finiti con hard bounds rigidi e fallback sicuro su trace parziale.
- **Fase 5 — Test di Regressione & Validazione**: Esecuzione dei refusal test, verifica bitemporale e grounding score.
