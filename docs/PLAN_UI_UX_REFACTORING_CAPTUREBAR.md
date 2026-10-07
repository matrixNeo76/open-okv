---
okf_version: "0.2"
id: "plan-ui-ux-refactoring-capturebar"
title: "Piano di Refactoring UI/UX: CaptureBar Unified Command Deck e Pulizia Interfaccia"
type: "guide"
domain: "Frontend Engineering & UI/UX Architecture"
tags: ["okf", "guide", "ui-ux", "refactoring", "capturebar", "layout", "anti-slop"]
entities:
  - name: "Unified Command Deck"
    type: "architecture"
    description: "Nuova barra di cattura inferiore ancorata al canvas con gerarchia a riga singola senza testo troncato o gradiente invasivo"
  - name: "Top Header Navigation Cluster"
    type: "architecture"
    description: "Riorganizzazione visiva dell'header superiore che separa controlli di vista da indicatori di governance"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.9
    description: "Garantisce coerenza estetica e tipografica con lo standard OKF"
---

# Piano di Refactoring UI/UX: CaptureBar Unified Command Deck e Pulizia Interfaccia

> **Documento di Guida Operativa per la Risoluzione delle Criticità Grafiche e di Usabilità**  
> *Autore: Knowledge Vault UI/UX Architecture Team*  
> *Data: Settembre 2026*  

---

## 1. Obiettivo dell'Intervento
Risolvere definitivamente le anomalie visive riscontrate nello screenshot (`Cattura.PNG`), trasformando la **CaptureBar** da una striscia galleggiante asimmetrica con testi troncati in un **Unified Command Deck** perfettamente armonizzato con la griglia e il layout dell'applicazione, riordinando contestualmente la barra superiore.

---

## 2. Dettaglio delle Modifiche Architetturali

### Modulo 1: Riprogettazione della CaptureBar (`CaptureBar.tsx` e `App.tsx`)
1. **Docking & Larghezza Coerente**:
   - Rimuovere il vincolo rigido `max-w-4xl mx-auto` con gradiente nero fumoso coprente (`bg-gradient-to-t from-[#050505] via-[#050505]/90 to-transparent`).
   - Sostituirlo con un ancoraggio inferiore pulito (`max-w-5xl mx-auto w-full px-4 sm:px-6 pb-4 pt-1`), provvisto di un contenitore rifinito con bordo sottile, backdrop blur (`bg-[#0D0D0D]/95 backdrop-blur-md border border-[#262626] rounded-2xl shadow-2xl`), lasciando respirare le schede soprastanti.
2. **Eliminazione del Wrap su 4 Righe del Tipo di Risorsa**:
   - Correggere il selettore del tipo risorsa: il testo deve comparire su **una sola riga orizzontale** (`whitespace-nowrap`), con badge compatto: `[ Auto-Detect ]` o `[ 🎓 Paper ]` con padding bilanciato (`px-2.5 py-1 text-xs`).
3. **Selettore del Modello a Larghezza Naturale (Zero Testo Troncato)**:
   - Eliminare il taglio con i puntini di sospensione (`Auto Fallback (Pred...`).
   - Assegnare una larghezza minima flessibile per mostrare per intero l'etichetta del modello: `⚡ Auto Fallback (Consigliato)` o `⚡ Gemini 3.8 Flash`.
4. **Armonizzazione dei Pulsanti Ausiliari**:
   - Allineare a destra i controlli `Importa Doc / Paper` e `Intelligence ⌘K` in un gruppo unificato con stile coerente (bordo dorato fine, medesima altezza di 28px, micro-icone allineate).
5. **Area di Input Principale**:
   - Altezza ottica bilanciata dell'area di digitazione con placeholder pulito.
   - Azioni di fondo: graffetta per allegare, microfono per dettatura e pulsante "Cattura" perfettamente centrati e con proporzioni ergonomiche.

### Modulo 2: Razionalizzazione dell'Header Superiore (`App.tsx`)
1. **Clusterizzazione dei Pulsanti di Sistema**:
   - Separare visivamente:
     - **Gruppo Viste Principali**: `[ Griglia | Tabella | Grafo ]` + `[ Focus ]`.
     - **Gruppo Governance & Stato**: accorpare o spaziare in modo discreto `[ Cekikj Gate ]`, `[ Server MCP ]`, `[ Health Check ]` con un divisore verticale sottile (`h-4 w-px bg-[#262626]`).
     - **Gruppo Azioni**: `[ + Nuova Alt+N ]`.

### Modulo 3: Controllo Margini Inferiori e Sidebar Utente
1. **Padding del Profilo Utente (Sidebar Sinistra)**:
   - Aggiungere padding inferiore (`pb-3`) al blocco utente per evitare che il nome e lo stato tocchino il bordo dello schermo o vengano tagliati.

---

## 3. Piano Operativo di Esecuzione (Passo-Passo)

- [ ] **Step 1**: Modifica del wrapper di alloggiamento in `src/App.tsx` (sostituzione del gradiente fumoso con dock ancorato a larghezza armonica `max-w-5xl`).
- [ ] **Step 2**: Refactoring dei controlli superiori in `src/components/CaptureBar.tsx`:
  - Correzione del pulsante di selezione del tipo (layout orizzontale su 1 riga, no wrap).
  - Espansione della larghezza minima del selettore del modello per rimuovere la troncatura.
  - Allineamento tipografico e di altezza per `Importa Doc / Paper` e `Intelligence`.
- [ ] **Step 3**: Rifinitura dell'header in `src/App.tsx` con separatori visivi puliti tra viste e controlli diagnostici.
- [ ] **Step 4**: Aggiustamento del layout del profilo utente nella sidebar in `src/components/Sidebar.tsx` / `App.tsx`.
- [ ] **Step 5**: Verifica tramite `lint_applet` e `compile_applet`.

---
