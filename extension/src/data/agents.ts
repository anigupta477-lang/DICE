import type { AgentDefinition } from '../types';

export const AGENTS: AgentDefinition[] = [
  {
    id: 'tab-architect',
    name: 'Tab-Architect',
    shortDescription: 'Organizes browser tabs and workspaces.',
    responsibility:
      'Groups related research tabs, manages active browser workspaces, and saves or restores research sessions.',
    technology: 'Chrome Tabs API',
  },
  {
    id: 'morph',
    name: 'Morph',
    shortDescription: 'Cleans webpages and extracts useful content.',
    responsibility:
      'Strips clutter from visited pages and extracts clean, structured text and key excerpts for analysis.',
    technology: 'Chrome Content Scripts',
  },
  {
    id: 'voice-steering',
    name: 'Voice Steering',
    shortDescription: 'Controls DICE through voice commands.',
    responsibility:
      'Captures spoken queries and mid-session refinements so you can steer research hands-free.',
    technology: 'ElevenLabs Conversational AI',
  },
  {
    id: 'scout-swarm',
    name: 'Scout Swarm',
    shortDescription: 'Researches multiple sources in parallel.',
    responsibility:
      'Dispatches concurrent web workers to gather specifications, reviews, and primary evidence across sources.',
    technology: 'Python asyncio + HTTPX',
  },
  {
    id: 'gatekeeper',
    name: 'Gatekeeper',
    shortDescription: 'Checks risky actions and approvals.',
    responsibility:
      'Evaluates untrusted content and pauses state-changing actions until explicit user approval is granted.',
    technology: 'Python rule engine',
  },
  {
    id: 'synthesis',
    name: 'Synthesis',
    shortDescription: 'Combines evidence and generates insights.',
    responsibility:
      'Cross-references findings, surfaces contradictions across sources, and drafts structured research summaries.',
    technology: 'Ollama',
  },
];
