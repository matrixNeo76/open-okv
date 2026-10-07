---
okf_version: "0.2"
title: "Specifica Tecnica UI/UX 2026: Riprogettazione Header, Body e CaptureBar Agentica"
type: "specification"
domain: "Frontend Architecture & Agentic UX"
tags: ["okf", "specification", "ui-ux", "agentic-capture", "header", "body-optimization"]
entities:
  - name: "Header"
    type: "component"
    description: "Barra superiore con Omnibar di ricerca Cmd+K, controllo di ordinamento e selettore viste compatto"
  - name: "StatsBanner"
    type: "component"
    description: "Barra contestuale snella con drawer/espansione a scomparsa per le metriche analitiche del Vault"
  - name: "CaptureBar"
    type: "component"
    description: "Console agentica multimodale con auto-detect intelligente delle categorie e input estensibile"
relations:
  - targetTitle: "Knowledge Vault Architecture"
    relationType: "extends"
    weight: 1.0
    description: "Modernizzazione strutturale delle 3 componenti chiave dell'interfaccia utente"
---

# Piano di Implementazione & Specifica Tecnica UI/UX 2026

## 🎯 Obiettivi di Design
1. **Header**: Eliminare il sovraffollamento visivo; introdurre Omnibar di ricerca con `⌘K` / `/` e contatore risultati dinamico; integrare menu a tendina Ordinamento (Sort); raggruppare strumenti ausiliari nel menu a comparsa `··· Altro`.
2. **Body (StatsBanner & Cards)**: Rendere lo StatsBanner collassabile a 38px di altezza per restituire oltre il 70% di visibilità verticale ai documenti; uniformare il clamp ottico delle schede.
3. **CaptureBar (Terminale Agentico)**: Rimuovere la riga fissa e ingombrante degli 8 bottoni tipologici, sostituendola con un micro-selettore intelligente `[✨ Auto-Detect AI ▼]`; aggiungere allegati rapidi, input auto-estensibile da 1 a 4 righe e capacità conversazionale/agentica.

---

## 📋 Registro Fasi di Esecuzione (TODOs & Checkbox)

### FASE 1: Riprogettazione Header (`Header.tsx`)
- [x] **1.1 Omnibar con Shortcut & Counter**:
  - Aggiunta scorciatoia globale `⌘K` o `/` per focus istantaneo sull'input di ricerca.
  - Badge visivo dinamico con conteggio risultati (es. `3 risultati`).
  - Pulsante rapido di clear input `✕`.
- [x] **1.2 Menu a Tendina Ordinamento (Sort Dropdown)**:
  - Integrazione controllata del prop `sortBy` con selettore elegante: *Più recenti*, *Meno recenti*, *Titolo (A-Z)*, *Titolo (Z-A)*, *Per Tipologia*, *Prima Preferiti*.
- [x] **1.3 Segmented Control Viste**:
  - Switch compatto `[田 Griglia | ☰ Tabella | 🕸 Grafo]` con indicatore pill attivo e tooltip rifiniti.
- [x] **1.4 Menu Ausiliario `··· Altro` & CTA Primaria**:
  - Raggruppamento delle azioni secondarie (*Stampa Dossier*, *Console Log Live*, *Google Drive Hub*).
  - Mantenimento del pulsante primario dorato `+ Nuova Risorsa`.

### FASE 2: Ottimizzazione Body & StatsBanner Elastico (`StatsBanner.tsx`)
- [x] **2.1 Modalità Compatta Default (38-42px)**:
  - Header compatto con titolo categoria corrente, icona, contatore e chip orizzontali dei filtri/tag attivi.
- [x] **2.2 Toggle Metriche Vault a Scomparsa**:
  - Tasto toggle `[ ⓘ Metriche Vault ▼ ]` che apre con animazione fluida il cruscotto con grafici, salute storage e distribuzione tipologie senza occupare spazio permanente.

### FASE 3: Potenziamento Agentico della CaptureBar (`CaptureBar.tsx`)
- [x] **3.1 Sostituzione della Riga Fissa Categorie**:
  - Rimozione della barra orizzontale degli 8 pulsanti fissi.
  - Aggiunta del menu a comparsa intelligente `[ ✨ Auto-Detect AI ▼ ]` con opzione di override manuale per ogni tipologia OKF.
- [x] **3.2 Input Auto-estensibile & Micro-deck**:
  - Textarea che si adatta dinamicamente da 1 riga a 4 righe.
  - Scorciatoie da tastiera: `Invio` per inviare / analizzare, `Shift + Invio` per a capo.
  - Tasto allegati rapido `[📎 Allega File]` che alimenta direttamente il parser.
- [x] **3.3 Indicatori di Stato & Feedback AI**:
  - Badge dello stato del modello (`Gemini 3.7 Flash` con fallback euristico) e pipeline dinamica a 3 step.

### FASE 4: Validazione Globale & Verifica Build
- [x] **4.1 Test di build e TypeScript**:
  - Esecuzione `lint_applet` e `compile_applet` con 0 errori.
- [x] **4.2 Test di interazione e persistenza**:
  - Verifica della fluidità su viewport desktop e mobile.
