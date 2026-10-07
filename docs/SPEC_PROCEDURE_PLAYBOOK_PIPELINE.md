---
okf_version: "0.2"
id: "spec-procedure-playbook-pipeline"
title: "Specifica Formale: Pipeline di Ingestione Procedure & Playbook Operativi (SOP Engine)"
type: "specification"
domain: "Standard Operating Procedures & Proactive Knowledge"
tags: ["okf", "specification", "procedure", "playbook", "sop", "maintenance", "troubleshooting", "cekikj", "onboarding"]
entities:
  - name: "SOP Proceduralizer Engine"
    type: "component"
    description: "Motore di trasformazione che converte appunti disordinati, tracce audio, manuali e screenshot in procedure operative standardizzate"
  - name: "Interactive Checklist Protocol"
    type: "protocol"
    description: "Modello di esecuzione interattiva dei passaggi con criteri di accettazione e rollback plan"
  - name: "Bidirectional Fault-Procedure Mesh"
    type: "topology"
    description: "Rete topologica che collega ogni procedura preventiva ai nodi di troubleshooting reattivi del Vault"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Definisce il formato di serializzazione e la tipizzazione delle procedure"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "extends"
    weight: 0.95
    description: "Estende la pipeline di acquisizione introducendo il canale procedurale proattivo"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "integrates"
    weight: 0.9
    description: "Si integra con il grafo D3 a 5 forze e il modello di persistenza a 3 livelli"
---

# Specifica Formale: Pipeline di Ingestione Procedure & Playbook Operativi (SOP Engine)

> **Documento Tecnico Normativo del Knowledge Vault (OKF v0.2 Native)**  
> *Modulo: Standard Operating Procedures (SOP) & Proactive Knowledge Architecture*  
> *Stato: PROPOSTA FORMALE / IN ATTESA DI CONFERMA*  

---

## 1. Visione e Obiettivi del Modulo

Il Knowledge Vault ha finora gestito due dimensioni fondamentali della conoscenza tecnica:
1. **Conoscenza Concettuale ed Architetturale** (`type: "knowledge"`): descrive *cosa sono* e *come sono composti* i sistemi.
2. **Conoscenza Reattiva e Diagnostica** (`type: "troubleshooting"`): descrive *come risolvere* un errore, un crash o un guasto già verificatosi.

Il presente modulo formalizza la terza dimensione cruciale: **la Conoscenza Proattiva e Standardizzata** (`type: "procedure"`), ovvero *come compiere con successo un'operazione preventiva, di configurazione, manutenzione o assistenza* prima o a prescindere dal verificarsi di un'anomalia.

### Ambiti Esemplificativi:
- **Assistenza Tecnica Hardware & Multifunzione**: Playbook di configurazione scansione SMB/Email, calibrazione densità ottica, pulizia filo corona, sostituzione unità tamburo/fusore.
- **Sistemistica IT & Cloud**: Procedure di onboarding utente, deployment in produzione, migrazione database, backup manuale o ripristino di emergenza (DRP).
- **Comprensione e Triage Clienti**: Procedure guidate per l'intervista tecnica di primo livello al cliente telefonico o in ticket.

---

## 2. Contratto dei Dati e Tipizzazione OKF v0.2

### 2.1. Estensione di `ResourceType` e `NavCategory`
Viene introdotto il tipo canonico:
```typescript
export type ResourceType = 
  | 'article' 
  | 'github_repo' 
  | 'mcp_server' 
  | 'ai_skill' 
  | 'knowledge' 
  | 'link' 
  | 'troubleshooting' 
  | 'paper' 
  | 'rss' 
  | 'note' 
  | 'document_refactor'
  | 'procedure'; // <-- NUOVO TIPO CANONICO
```

### 2.2. Struttura dei Metadati di Procedura (`ResourceMetadata`)
I documenti di tipo `procedure` arricchiscono `ResourceMetadata` con i seguenti attributi formali:
```typescript
// Procedure & SOP specific metadata
procedureType?: 'maintenance' | 'deployment' | 'installation' | 'onboarding' | 'customer_support' | 'audit' | 'troubleshooting_workflow' | string;
targetSystem?: string;               // es. "Kyocera TASKalfa 3253ci", "Docker / Linux OS", "Active Directory"
estimatedDuration?: string;          // es. "20 min", "1 ora"
riskLevel?: 'low' | 'medium' | 'high' | 'critical'; // Livello di criticità operativa
requiredTools?: string[];            // Attrezzi, cacciaviti, token admin, cavi console, chiavi software
safetyWarnings?: string[];           // Avvertenze di sicurezza fisica/elettrica o blocco produzione
prerequisites?: string[];            // Condizioni necessarie prima di avviare l'attività
stepsCount?: number;                 // Numero complessivo di passaggi
rollbackPlan?: string;               // Procedura di ripristino in caso di fallimento intermedio
relatedTroubleshootingIds?: string[]; // ID delle schede di errore correlate nel Vault
```

### 2.3. Schema Frontmatter YAML Normativo
Ogni procedura memorizzata nel Vault presenta il seguente frontmatter YAML nativo:
```yaml
---
okf_version: "0.2"
id: "proc-kyocera-smb-config-2026"
title: "Procedura di Configurazione Scansione Cartella SMB su Multifunzione Kyocera"
type: "procedure"
domain: "Hardware & Multifunction Printers"
docType: "guide"
tags: ["kyocera", "smb", "scansione", "procedura", "windows-share", "okf-v0.2"]
entities:
  - name: "Kyocera Command Center RX"
    type: "toolchain"
    description: "Interfaccia web di gestione della multifunzione"
  - name: "Protocollo SMBv3"
    type: "protocol"
    description: "Protocollo di condivisione file sicuro su porta 445"
relations:
  - targetTitle: "Risoluzione Errore Scansione Kyocera 1102: Errore di Autenticazione SMB"
    relationType: "prevents"
    weight: 0.95
    description: "Questa procedura preventiva evita l'errore di autenticazione configurando NTLMv2"
  - targetTitle: "Knowledge Vault: Architettura Generale"
    relationType: "references"
    weight: 0.8
    description: "Collegamento al contesto di supporto tecnico IT"
---
```

---

## 3. Rete Topologica Bidirezionale (Mesh Procedure ↔ Errori)

La peculiarità dell'architettura è l'interconnessione strutturata nel grafo relazionale D3:
1. **Relazione `prevents` / `mitigates`**:
   - Dalla Procedura al Troubleshooting: la procedura dichiara quali errori noti vengono evitati se eseguita correttamente.
2. **Relazione `requires_procedure`**:
   - Dal Troubleshooting alla Procedura: una scheda di troubleshooting può indicare che per risolvere o prevenire future ricorrenze dell'anomalia è necessario eseguire la procedura standard.
3. **Rappresentazione Visiva nel Grafo**:
   - I nodi `procedure` possiedono colore identificativo dedicato (Ciano Elettrico / Turchese `#06B6D4` o Ambra Dorata `#C5A059`) e connettono visivamente i cluster hardware/software ai nodi rossi di allarme `troubleshooting`.

---

## 4. Pipeline di Ingestione Intelligente (Testo, Voce e Allegati)

### 4.1. Canali di Acquisizione:
1. **Chat / CaptureBar (Testo Libero & Appunti Grezzi)**:
   - Il tecnico incolla un resoconto disordinato dell'assistenza svolta o della procedura applicata.
   - Il modello `gemini-3.7-flash` applica il **SOP Proceduralizer Mandate**, ripulendo le ambiguità, identificando strumenti, parametri e step ordinati.
2. **Foto & Screenshot di Pannelli di Controllo (Vision Multimodale)**:
   - Fotografia del display LCD di una fotocopiatrice, di uno switch o schermata di interfaccia web.
   - Gemini estrae il percorso esatto dei menu e i parametri da compilare.
3. **Manuali di Servizio e PDF**:
   - Estrazione dei capitoli operativi eliminando introduzioni commerciali o avvertenze generiche ridondanti.
4. **Registrazioni Vocali sul Campo (`audio/*`)**:
   - Trascrizione della voce del tecnico registrata in loco con sintesi immediata in playbook esecutivo.

### 4.2. Prompt Mandate: `SOP & PLAYBOOK ENGINE MANDATE`
Viene integrato in `server/routes/captureRoutes.ts` con istruzioni rigorose:
- Estrarre sezioni fisse: **1. Obiettivo & Ambito**, **2. Prerequisiti & Attrezzi**, **3. Checklist Operativa Sequenziale (con Criteri di Accettazione per ogni step)**, **4. Piano di Rollback**, **5. Risoluzione Problemi Correlati**.
- Vietare sintesi vaghe: ogni step deve indicare un'azione puntuale e verificabile.

---

## 5. Esperienza Utente (Frontend & UI)

### 5.1. Sidebar Sinistra (`Sidebar.tsx`)
- Nuovo filtro di primo livello: **"Procedure & Playbook"**.
- Icona dedicata: `Workflow` / `ClipboardList`.
- Contatore in tempo reale (`counts.procedure`).
- Accesso diretto con filtraggio immediato della griglia.

### 5.2. CaptureBar (`CaptureBar.tsx`)
- Aggiunta dell'opzione esplicita nel selettore a tendina:
  `{ id: "procedure", label: "Procedura / Playbook", icon: Workflow, desc: "Playbook, manutenzioni, SOP e guide operative" }`.

### 5.3. ResourceCard (`ResourceCard.tsx`)
- Badge dedicato `Procedura` (ciano/ambra).
- Indicatore compatto del tempo stimato (es. `⏱️ 20 min`) e del rischio (es. `Basso`, `Critico`).
- Anteprima del numero di passaggi operativi.

### 5.4. KnowledgeReader & ResourceModal (Modalità Esecutiva)
- Sezione **"Fasi Operative & Checklist Eseguibile"** con checkbox interattive utilizzabili dal tecnico durante l'intervento.
- Banner di sicurezza per procedure ad alto rischio (`riskLevel: "high" | "critical"`).
- Box di navigazione rapida verso le schede di troubleshooting correlate già censite nel Vault.
