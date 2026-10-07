import { GeminiModelOption } from '../types';

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    id: 'auto',
    label: 'Auto Fallback (Predefinito)',
    badge: 'Consigliato',
    description: 'Priorità a gemini-3.8-flash, poi 3.7-flash, flash-latest e fallback euristico 0ms in caso di quota 429.',
    supportsThinking: true,
    recommendedFor: 'balanced',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    badge: 'Novità Thinking',
    description: 'Modello di ultimissima generazione ad altissima velocità e capacità native di Thinking Budget (1024-2048 token).',
    supportsThinking: true,
    recommendedFor: 'intelligence',
  },
  {
    id: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    badge: 'Analisi Ibrida',
    description: 'Modello ad alta stabilità, supporto ragionato e parsing formale OKF v0.2.',
    supportsThinking: true,
    recommendedFor: 'intelligence',
  },
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    badge: 'Produzione',
    description: 'Modello di produzione stabile e veloce per ingestione e metadati.',
    supportsThinking: false,
    recommendedFor: 'capture',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    badge: 'Stabile',
    description: 'Elaborazione rapida e affidabile per risorse web e repository.',
    supportsThinking: false,
    recommendedFor: 'capture',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    badge: 'Ultra Veloce',
    description: 'Latenza minima e consumo ridotto di token per note veloci.',
    supportsThinking: false,
    recommendedFor: 'fast',
  },
];
