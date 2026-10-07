import { ResourceItem, ResourceType, OKFEntity, OKFRelation } from '../types';

export interface LocalParsedResult {
  type: ResourceType;
  title: string;
  url?: string;
  summary: string;
  tags: string[];
  metadata: Record<string, any>;
}

export function localFallbackAnalyzeResource(
  rawInput: string,
  explicitType?: ResourceType
): LocalParsedResult {
  const text = (rawInput || '').trim();
  let type: ResourceType = explicitType || 'knowledge';
  let title = 'Nuova Risorsa';
  let summary = '';
  let tags: string[] = [];
  let url = '';
  const metadata: Record<string, any> = {};

  // 1. Check for Troubleshooting / Bug Report
  const isTroubleshoot =
    explicitType === 'troubleshooting' ||
    (text.toLowerCase().includes('problema') &&
      (text.toLowerCase().includes('soluzione') ||
        text.toLowerCase().includes('risoluzione') ||
        text.toLowerCase().includes('fix'))) ||
    text.toLowerCase().includes('root cause') ||
    text.toLowerCase().includes('causa:') ||
    (text.toLowerCase().includes('errore') && text.toLowerCase().includes('.dll')) ||
    text.toLowerCase().includes('smart app control');

  if (isTroubleshoot) {
    type = 'troubleshooting';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    title = lines[0]?.replace(/^[#*-]+\s*/, '').slice(0, 100) || 'Risoluzione Errore Tecnico';
    summary = lines.slice(1, 4).join(' ').slice(0, 300) || title;
    tags.push('troubleshooting', 'bugfix', 'diagnostica');

    if (text.toLowerCase().includes('windows')) tags.push('windows');
    if (text.toLowerCase().includes('primus') || text.toLowerCase().includes('acca')) tags.push('acca', 'primus');
    if (text.toLowerCase().includes('dll')) tags.push('dll');

    metadata.affectedSystem =
      text.match(/(?:sistema|software|programma|applicativo)[:\s]+([^\n]+)/i)?.[1]?.trim() ||
      'Sistema Operativo / Software';
    metadata.rootCause =
      text.match(/(?:causa|root cause|motivo)[:\s]+([^\n]+)/i)?.[1]?.trim() ||
      'Blocco sicurezza / Conflitto librerie';

    const steps = text
      .split('\n')
      .filter((l) => /^\d+\.|\bpasso\b|\bstep\b/i.test(l.trim()))
      .map((l) => l.trim().replace(/^\d+\.\s*/, ''));
    if (steps.length > 0) {
      metadata.solutionSteps = steps;
    }
  } else if (
    explicitType === 'procedure' ||
    text.toLowerCase().startsWith('procedura:') ||
    text.toLowerCase().startsWith('playbook:') ||
    text.toLowerCase().startsWith('sop:') ||
    text.toLowerCase().includes('procedura operativa standard') ||
    text.toLowerCase().includes('procedura operativa') ||
    text.toLowerCase().includes('(sop)') ||
    (text.toLowerCase().includes('procedura') &&
      (text.toLowerCase().includes('passo') ||
        text.toLowerCase().includes('step') ||
        text.toLowerCase().includes('manutenzione') ||
        text.toLowerCase().includes('onboarding') ||
        text.toLowerCase().includes('installazione') ||
        text.toLowerCase().includes('assistenza')))
  ) {
    type = 'procedure';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    title =
      lines[0]
        ?.replace(/^[#*-]+\s*/, '')
        .replace(/^(?:procedura|playbook|sop):\s*/i, '')
        .slice(0, 100) || 'Procedura Operativa Standard';
    summary = lines.slice(1, 4).join(' ').slice(0, 300) || title;
    tags.push('procedure', 'playbook', 'sop', 'okf-v0.2');

    metadata.docType = 'guide';
    metadata.domain =
      text.toLowerCase().includes('stampant') ||
      text.toLowerCase().includes('kyocera') ||
      text.toLowerCase().includes('ricoh')
        ? 'Hardware & Multifunction Printers'
        : 'Standard Operating Procedures';
    metadata.procedureType = text.toLowerCase().includes('manutenzion')
      ? 'maintenance'
      : text.toLowerCase().includes('onboarding')
      ? 'onboarding'
      : text.toLowerCase().includes('installaz')
      ? 'installation'
      : 'customer_support';
    metadata.targetSystem =
      text.match(/(?:sistema|dispositivo|stampante|piattaforma)[:\s]+([^\n]+)/i)?.[1]?.trim() ||
      'Sistema Generale';
    metadata.riskLevel =
      text.toLowerCase().includes('critico') || text.toLowerCase().includes('fermo') ? 'high' : 'low';

    const steps = text
      .split('\n')
      .filter((l) => /^(?:\d+[\.)]|[-*]\s*\[[\s x]\]|\bpasso\s*\d+|\bstep\s*\d+)/i.test(l.trim()))
      .map((l) => l.trim().replace(/^(?:\d+[\.)]|[-*]\s*\[[\s x]\]|\bpasso\s*\d+[:.-]?|\bstep\s*\d+[:.-]?)\s*/i, ''));
    if (steps.length > 0) {
      metadata.solutionSteps = steps;
      metadata.stepsCount = steps.length;
    }

    const durationMatch = text.match(/(?:durata|tempo stimato|tempo|duration)[:\s]+([^\n,]+)/i);
    if (durationMatch) {
      metadata.estimatedDuration = durationMatch[1].trim();
    }
    const rollbackMatch = text.match(/(?:rollback|ripristino|piano di emergenza)[:\s]+([^\n]+)/i);
    if (rollbackMatch) {
      metadata.rollbackPlan = rollbackMatch[1].trim();
    }
  } else if (
    explicitType === 'rss' ||
    text.toLowerCase().endsWith('.xml') ||
    text.toLowerCase().includes('/feed') ||
    text.toLowerCase().includes('/rss') ||
    text.toLowerCase().startsWith('rss:') ||
    text.includes('<rss') ||
    text.includes('<feed')
  ) {
    // 3. RSS / Atom Feed detection
    type = 'rss';
    const cleanText = text.replace(/^rss:\s*/i, '').trim();
    const urlMatch = cleanText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) url = urlMatch[0];

    metadata.feedUrl = url || cleanText;
    metadata.feedFormat = cleanText.includes('<feed') || url.includes('atom') ? 'atom' : 'rss';

    let domainName = 'Feed RSS';
    if (url) {
      try {
        domainName = new URL(url).hostname.replace(/^www\./, '');
      } catch {}
    }

    // Specialized check for arXiv RSS feeds
    const arxivRssMatch = (url || cleanText).match(/arxiv\.org\/rss\/([a-zA-Z0-9_.-]+)/i);
    if (arxivRssMatch) {
      const cat = arxivRssMatch[1];
      const arxivCatNames: Record<string, string> = {
        'q-bio.NC': 'Neurons and Cognition',
        'cs.AI': 'Artificial Intelligence',
        'cs.LG': 'Machine Learning',
        'cs.CL': 'Computation and Language',
        'cs.CV': 'Computer Vision',
        'cs.NE': 'Neural and Evolutionary Computing',
        'cs.RO': 'Robotics',
        'stat.ML': 'Machine Learning',
        'q-bio.QM': 'Quantitative Methods',
      };
      const catName = arxivCatNames[cat] ? ` (${arxivCatNames[cat]})` : '';
      title = `arXiv RSS: ${cat}${catName}`;
      summary = `Feed RSS ufficiale di arXiv per la categoria ${cat}${catName}: aggiornamento e preprint scientifici.`;
      tags.push('rss', 'feed', 'arxiv', 'preprint', 'research', cat.toLowerCase());
    } else {
      title = domainName !== 'Feed RSS' ? `Feed RSS - ${domainName}` : 'Canale RSS';
      summary = `Flusso di aggiornamento e syndication RSS/Atom da ${url || cleanText}.`;
      tags.push('rss', 'feed', 'syndication', 'updates');
    }

    metadata.docType = 'tool_description';
  } else if (
    explicitType === 'paper' ||
    (!text.toLowerCase().includes('/rss') && (
      text.includes('arxiv.org/') ||
      text.includes('doi.org/') ||
      text.includes('openreview.net/') ||
      text.toLowerCase().startsWith('paper:')
    ))
  ) {
    // 2. Scientific Paper detection
    type = 'paper';
    const cleanText = text.replace(/^paper:\s*/i, '').trim();
    const urlMatch = cleanText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) url = urlMatch[0];

    const arxivMatch = (url || cleanText).match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
    if (arxivMatch) {
      metadata.arxivId = arxivMatch[1];
      metadata.pdfUrl = `https://arxiv.org/pdf/${arxivMatch[1]}.pdf`;
      url = url || `https://arxiv.org/abs/${arxivMatch[1]}`;
    }

    const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
    title = lines[0]?.replace(/^#+\s*/, '').replace(/^https?:\/\/[^\s]+$/, '').slice(0, 120) || (arxivMatch ? `arXiv:${arxivMatch[1]}` : 'Paper Scientifico');
    summary = lines.slice(1, 4).join(' ').slice(0, 300) || `Paper di ricerca scientifica ${arxivMatch ? `[arXiv:${arxivMatch[1]}]` : ''}`;
    tags.push('paper', 'research', 'scientific-paper', 'academic');
    if (arxivMatch) tags.push('arxiv');

    metadata.docType = 'research';
    metadata.publishedYear = new Date().getFullYear();
    metadata.domain = 'Artificial Intelligence & Computer Science';
  } else if (
    explicitType === 'note' ||
    text.toLowerCase().startsWith('nota:') ||
    text.toLowerCase().startsWith('note:') ||
    text.toLowerCase().startsWith('memo:') ||
    text.toLowerCase().startsWith('scratchpad:')
  ) {
    // 4. Quick Note / Scratchpad detection
    type = 'note';
    const cleanText = text.replace(/^(?:nota|note|memo|scratchpad):\s*/i, '').trim();
    const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
    title = lines[0]?.replace(/^#+\s*/, '').slice(0, 80) || 'Nota Rapida';
    summary = lines.slice(1).join(' ').slice(0, 250) || lines[0] || 'Appunto veloce nel Vault.';
    tags.push('note', 'scratchpad', 'memo');
    metadata.noteCategory = 'scratchpad';
    metadata.docType = 'concept';
    metadata.markdownContent = cleanText;
  } else {
    // 2. Check URL Pattern
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      url = urlMatch[0];
    } else if (text.includes('github.com/')) {
      const ghMatch = text.match(/github\.com\/[^\s]+/i);
      if (ghMatch) url = `https://${ghMatch[0]}`;
    }

    // 3. GitHub repository check
    const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/i;
    const matchGh = (url || text).match(ghRegex);

    if (matchGh) {
      const owner = matchGh[1];
      const repoName = matchGh[2].replace(/\.git$/, '').replace(/[#?].*$/, '');
      url = `https://github.com/${owner}/${repoName}`;
      title = `${owner}/${repoName}`;

      if (
        explicitType === 'mcp_server' ||
        (!explicitType &&
          (text.toLowerCase().includes('mcp-server') || text.toLowerCase().includes('model context protocol')) &&
          !text.toLowerCase().includes('not mcp'))
      ) {
        type = 'mcp_server';
        tags.push('mcp', 'model-context-protocol', 'server', repoName.toLowerCase());
        metadata.protocol = 'stdio';
        metadata.command = `npx -y @modelcontextprotocol/server-${repoName}`;
        metadata.configSnippet = JSON.stringify(
          {
            mcpServers: {
              [repoName]: {
                command: 'npx',
                args: ['-y', `@modelcontextprotocol/server-${repoName}`],
              },
            },
          },
          null,
          2
        );
      } else if (explicitType === 'knowledge') {
        type = 'knowledge';
        tags.push('knowledge', 'github', 'repo', repoName.toLowerCase());
      } else {
        type = 'github_repo';
        tags.push('github', 'open-source', 'repository', repoName.toLowerCase(), owner.toLowerCase());
        metadata.owner = owner;
        metadata.repoName = repoName;
        metadata.installCommand = `git clone https://github.com/${owner}/${repoName}.git`;
      }
      summary = `Repository GitHub ${owner}/${repoName}. Codice sorgente e documentazione open-source.`;
    } else if (
      explicitType === 'link' ||
      (!explicitType &&
        url &&
        (text.startsWith('http') ||
          text.includes('link:') ||
          text.includes('tool:') ||
          text.includes('web:') ||
          !text.startsWith('---')))
    ) {
      type = 'link';
      tags.push('link', 'web', 'tool');
      if (url) {
        try {
          const parsedUrl = new URL(url);
          const domain = parsedUrl.hostname.replace(/^www\./, '');
          title = domain;
          metadata.domain = domain;
          metadata.siteName = domain;
          metadata.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          tags.push(domain.split('.')[0]);
        } catch {}
      }
      summary = text.replace(url, '').trim() || `Collegamento web a ${url || title}`;
    } else if (
      text.includes('mcpServers') ||
      text.includes('claude_desktop_config') ||
      text.toLowerCase().startsWith('mcp:')
    ) {
      type = 'mcp_server';
      title = 'MCP Server Config';
      summary = 'Configurazione server Model Context Protocol';
      tags.push('mcp', 'tools', 'protocol');
      metadata.protocol = 'stdio';
    } else if (
      text.toLowerCase().includes('system prompt') ||
      text.toLowerCase().includes('you are a') ||
      text.toLowerCase().includes('skill definition') ||
      text.toLowerCase().startsWith('skill:')
    ) {
      type = 'ai_skill';
      title = 'AI Skill Definition';
      summary = text.slice(0, 180) + '...';
      tags.push('prompt', 'ai-skill', 'system-instruction');
      metadata.systemPrompt = text;
      metadata.recommendedModel = 'gemini-3.7-flash';
    } else if (
      text.startsWith('---') ||
      text.includes('okf_version') ||
      text.includes('# ') ||
      (!url && text.length > 300) ||
      explicitType === 'knowledge'
    ) {
      type = 'knowledge';
      const lines = text.split('\n').filter((l) => l.trim().length > 0);

      let extractedTitle = '';
      const boldMatch = text.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        extractedTitle = boldMatch[1].trim();
      } else if (lines.length > 0) {
        extractedTitle = lines[0].replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
      }
      title = extractedTitle.slice(0, 100) || 'Documento Knowledge';

      const cleanParagraph = text.replace(/^[#*-]+\s*/gm, '').replace(/\*\*/g, '').trim();
      summary = cleanParagraph.slice(0, 300) || title;

      tags.push('knowledge', 'okf-v0.2');
      if (text.toLowerCase().includes('claude')) tags.push('claude', 'anthropic');
      if (text.toLowerCase().includes('mcp')) tags.push('mcp');
      if (text.toLowerCase().includes('cli') || text.toLowerCase().includes('terminale')) tags.push('cli');
      if (text.toLowerCase().includes('git')) tags.push('git');
      if (text.toLowerCase().includes('agent') || text.toLowerCase().includes('agentico')) tags.push('agentic-ai');

      const extractedEntities: OKFEntity[] = [{ name: title, type: 'concept', description: summary.slice(0, 100) }];
      const boldItems = Array.from(text.matchAll(/\*\*([^*]+)\*\*/g))
        .map((m) => m[1].trim())
        .filter((name) => name.length > 2 && name.length < 40 && name !== title)
        .slice(0, 5);

      boldItems.forEach((item) => {
        extractedEntities.push({ name: item, type: 'feature', description: `Elemento chiave in ${title}` });
      });

      metadata.okfVersion = '0.2';
      metadata.domain =
        text.toLowerCase().includes('claude') || text.toLowerCase().includes('agent')
          ? 'Agentic Systems & AI'
          : 'Software Architecture';
      metadata.docType = 'specification';
      metadata.markdownContent = text.startsWith('---')
        ? text
        : `---\nokf_version: "0.2"\ntitle: "${title}"\ntype: "${metadata.docType}"\ndomain: "${metadata.domain}"\ntags: ${JSON.stringify(Array.from(new Set(tags)))}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${title}\n\n${text}`;
      metadata.entities = extractedEntities;
      metadata.relations = [{ targetTitle: 'Knowledge Vault', relationType: 'references', weight: 0.8 }];
    } else {
      type = (explicitType as any) || (url ? 'link' : 'article');
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        title = lines[0].replace(/^#+\s*/, '').slice(0, 100);
        summary = lines.slice(1).join('\n\n').trim().slice(0, 300) || lines[0];
      }
      if (type === 'link') {
        tags.push('link', 'web');
      } else {
        tags.push('knowledge', 'dev');
      }

      if (url) {
        try {
          const parsedUrl = new URL(url);
          const domain = parsedUrl.hostname.replace(/^www\./, '');
          metadata.domain = domain;
          metadata.siteName = domain;
          metadata.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch {}
      }
    }
  }

  if (
    explicitType &&
    ['troubleshooting', 'article', 'github_repo', 'mcp_server', 'ai_skill', 'knowledge', 'link', 'paper', 'rss', 'note'].includes(
      explicitType
    )
  ) {
    type = explicitType;
  }

  const isWebLink = type === 'link' || Boolean(url && !text.startsWith('---') && !text.includes('okf_version'));

  if (isWebLink) {
    // I link web non devono essere trasformati in documenti con schema OKF v0.2
    delete metadata.okfVersion;
    delete metadata.okf_version;
    if (metadata.docType && !['guide', 'tool_description'].includes(metadata.docType)) {
      delete metadata.docType;
    }
    // Rimuovi tag OKF impropri
    tags = tags.filter((t) => !['okf-v0.2', 'okf', 'knowledge'].includes(t.toLowerCase()));
    if (!tags.includes('link')) tags.push('link');
    if (!tags.includes('web')) tags.push('web');
  } else {
    // Universal OKF v0.2 Guarantee for technical documents
    metadata.okfVersion = '0.2';
    if (!metadata.docType) {
      metadata.docType = type === 'github_repo' ? 'architecture'
        : type === 'mcp_server' ? 'tool_description'
        : type === 'ai_skill' ? 'prompt_skill'
        : type === 'troubleshooting' ? 'specification'
        : type === 'paper' ? 'research'
        : type === 'rss' ? 'tool_description'
        : type === 'note' ? 'concept'
        : type === 'article' ? 'guide'
        : 'concept';
    }

    if (!metadata.markdownContent) {
      const cleanTags = Array.from(new Set(tags.length > 0 ? tags : [type, 'okf-v0.2']));
      metadata.markdownContent = `---\nokf_version: "0.2"\ntitle: "${title}"\ntype: "${metadata.docType}"\ndomain: "${metadata.domain || 'Software Architecture'}"\ntags: ${JSON.stringify(cleanTags)}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${title}\n\n> **${metadata.docType?.toUpperCase()} · OKF v0.2**\n> Ambito: ${metadata.domain || 'Software Architecture'}\n\n${summary || text}\n\n${url ? `\n\n**Riferimento Web:** [${url}](${url})\n` : ''}`;
    }
  }

  if (!metadata.domain || metadata.domain === 'general') {
    metadata.domain = text.toLowerCase().includes('claude') || text.toLowerCase().includes('agent') || text.toLowerCase().includes('mcp')
      ? 'Agentic Systems & AI'
      : text.toLowerCase().includes('cloud') || text.toLowerCase().includes('docker') || text.toLowerCase().includes('deploy')
      ? 'DevOps & Cloud'
      : type === 'troubleshooting'
      ? 'System Diagnostics & Fix'
      : 'Software Architecture';
  }

  if (!metadata.entities || metadata.entities.length === 0) {
    const defaultEntities: OKFEntity[] = [
      { name: title, type: 'concept', description: summary.slice(0, 100) || 'Elemento centrale' },
      { name: metadata.domain, type: 'domain', description: 'Dominio di appartenenza' },
    ];
    if (metadata.owner && metadata.repoName) {
      defaultEntities.push({ name: metadata.repoName, type: 'software', description: `Repository GitHub ${metadata.owner}/${metadata.repoName}` });
    }
    tags.slice(0, 3).forEach((t) => {
      if (t.length > 2 && t !== 'dev' && t !== 'knowledge') {
        defaultEntities.push({ name: t.charAt(0).toUpperCase() + t.slice(1), type: 'technology', description: `Tag: ${t}` });
      }
    });
    metadata.entities = defaultEntities;
  }

  if (!metadata.relations || metadata.relations.length === 0) {
    metadata.relations = [
      { targetTitle: 'Knowledge Vault', relationType: 'references', weight: 0.85, description: 'Archiviazione nel Vault' }
    ];
  }

  if (!metadata.markdownContent) {
    const cleanTags = Array.from(new Set(tags.length > 0 ? tags : [type, 'okf-v0.2']));
    metadata.markdownContent = `---\nokf_version: "0.2"\ntitle: "${title}"\ntype: "${metadata.docType}"\ndomain: "${metadata.domain}"\ntags: ${JSON.stringify(cleanTags)}\ncreated_at: "${new Date().toISOString()}"\n---\n\n# ${title}\n\n> **${metadata.docType?.toUpperCase()} · OKF v0.2**\n> Ambito: ${metadata.domain}\n\n${summary || text}\n\n${url ? `\n\n**Riferimento Web:** [${url}](${url})\n` : ''}`;
  }

  return {
    type,
    title: title || 'Nuova Risorsa',
    url: url || undefined,
    summary: summary || text.slice(0, 200),
    tags: Array.from(new Set(tags)),
    metadata,
  };
}
