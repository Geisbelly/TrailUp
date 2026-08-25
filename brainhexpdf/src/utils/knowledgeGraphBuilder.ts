import {
  BrainHexType,
  DeckData,
  SlideData,
  KnowledgeGraphData,
  KnowledgeGraphNode,
  KnowledgeGraphLink,
  KnowledgeGraphNodeType,
} from '../types';
import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';

/**
 * Extracts and synthesizes a high-fidelity Knowledge Graph from a DeckData structure,
 * tailored directly to the Deck's BrainHex Profile archetype.
 */
export function buildDeckKnowledgeGraph(deck: DeckData): KnowledgeGraphData {
  const profile = deck.targetProfile || 'Mastermind';
  const theme = deck.themeConfig || BRAIN_HEX_PROFILES[profile] || BRAIN_HEX_PROFILES.Mastermind;
  const primaryColor = theme.palette?.primary || '#8B5CF6';
  const secondaryColor = theme.palette?.secondary || '#A78BFA';
  const accentColor = theme.palette?.accent || '#F59E0B';

  const nodes: KnowledgeGraphNode[] = [];
  const links: KnowledgeGraphLink[] = [];
  const nodeMap = new Map<string, KnowledgeGraphNode>();

  // 1. Central BrainHex Archetype Node
  const archetypeNodeId = `archetype-${profile.toLowerCase()}`;
  const archetypeNode: KnowledgeGraphNode = {
    id: archetypeNodeId,
    label: `${theme.perfil}: ${theme.nomePt}`,
    type: 'archetype',
    description: `${theme.archetype} • ${theme.mote || theme.tom}. Lente epistemológica do conhecimento.`,
    color: primaryColor,
    radius: 34,
    group: 'Archetype',
    importance: 10,
    tags: [theme.archetype, theme.elemento, theme.simbolo],
  };
  nodes.push(archetypeNode);
  nodeMap.set(archetypeNodeId, archetypeNode);

  // 2. Identify Subtopics / Module Clusters
  const subtopicSet = new Set<string>();
  deck.slides.forEach((s) => {
    if (s.subtopic && s.subtopic.trim()) {
      subtopicSet.add(s.subtopic.trim());
    }
  });

  const clusterColors = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#8B5CF6', // Purple
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#14B8A6', // Teal
  ];

  const subtopicColorMap = new Map<string, string>();
  Array.from(subtopicSet).forEach((sub, idx) => {
    const col = clusterColors[idx % clusterColors.length];
    subtopicColorMap.set(sub, col);

    const moduleId = `module-${idx}`;
    const moduleNode: KnowledgeGraphNode = {
      id: moduleId,
      label: sub,
      type: 'module',
      description: `Módulo temático: ${sub}`,
      color: col,
      radius: 22,
      group: sub,
      importance: 8,
      tags: ['Módulo', sub],
    };
    nodes.push(moduleNode);
    nodeMap.set(moduleId, moduleNode);

    // Link Archetype to Modules
    links.push({
      source: archetypeNodeId,
      target: moduleId,
      type: 'archetype_lens',
      label: 'Módulo',
      weight: 3,
      color: primaryColor,
    });
  });

  // Track extracted concepts to connect shared ideas across slides
  const conceptToSlideMap = new Map<string, string[]>();

  // 3. Process Slides into Graph Nodes
  deck.slides.forEach((slide: SlideData, index: number) => {
    const slideId = `slide-${index}`;
    const subtopic = slide.subtopic?.trim() || 'Fundamentos';
    const slideColor = subtopicColorMap.get(subtopic) || secondaryColor;

    const isChallenge =
      slide.type === 'interactive_challenge' ||
      slide.type === 'boss_battle' ||
      slide.type === 'decision_branch' ||
      slide.type === 'checklist_quest' ||
      !!slide.quiz?.question ||
      !!slide.interactiveElement?.prompt;

    const description =
      slide.pedagogicalObjective ||
      slide.thematicStorytelling?.narrativeBeat ||
      slide.narrativeText ||
      slide.keyTakeaways?.[0] ||
      slide.title;

    const slideNode: KnowledgeGraphNode = {
      id: slideId,
      label: `Slide ${index + 1}: ${slide.title}`,
      type: isChallenge ? 'challenge' : 'slide',
      slideIndex: index,
      subtopic: subtopic,
      description: description,
      color: isChallenge ? '#EF4444' : slideColor,
      radius: isChallenge ? 20 : 16,
      rankLevel: deck.rankLevel,
      interactiveType: slide.type,
      group: subtopic,
      importance: isChallenge ? 9 : 7,
      tags: [slide.type, slide.layout || 'standard'],
    };

    nodes.push(slideNode);
    nodeMap.set(slideId, slideNode);

    // Link Slide to its Module
    const moduleEntry = Array.from(subtopicSet).findIndex((s) => s === subtopic);
    if (moduleEntry !== -1) {
      links.push({
        source: `module-${moduleEntry}`,
        target: slideId,
        type: 'contains_concept',
        label: 'Contém',
        weight: 2,
        color: slideColor,
      });
    } else {
      // Direct to Archetype
      links.push({
        source: archetypeNodeId,
        target: slideId,
        type: 'sequential',
        label: 'Eixo',
        weight: 1,
        color: secondaryColor,
      });
    }

    // Sequential Link between slides
    if (index > 0) {
      links.push({
        source: `slide-${index - 1}`,
        target: slideId,
        type: 'sequential',
        label: 'Próximo',
        weight: 1.5,
        color: '#64748B',
      });
    }

    // 4. Extract Key Takeaways & Specific Concepts
    const extractedConcepts: string[] = [];

    if (slide.keyTakeaways && slide.keyTakeaways.length > 0) {
      slide.keyTakeaways.forEach((t) => {
        const clean = t.replace(/^[-•*]\s*/, '').trim();
        if (clean.length > 4 && clean.length < 50) {
          extractedConcepts.push(clean);
        }
      });
    }

    // If visual diagram nodes exist, extract them as concept links
    if (slide.visualDiagram?.nodes) {
      slide.visualDiagram.nodes.forEach((vdNode) => {
        if (vdNode.label && vdNode.label.length < 40) {
          extractedConcepts.push(vdNode.label);
        }
      });
    }

    // Extract highlighted bold or quoted words from paragraphs
    if (slide.contentParagraphs) {
      slide.contentParagraphs.forEach((p) => {
        const matches = p.match(/\*\*([^*]+)\*\*/g);
        if (matches) {
          matches.forEach((m) => {
            const raw = m.replace(/\*\*/g, '').trim();
            if (raw.length > 3 && raw.length < 35) {
              extractedConcepts.push(raw);
            }
          });
        }
      });
    }

    // Deduplicate per slide and add concept nodes
    const uniqueSlideConcepts = Array.from(new Set(extractedConcepts)).slice(0, 3);

    uniqueSlideConcepts.forEach((conceptStr, cIdx) => {
      const conceptKey = conceptStr.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const conceptNodeId = `concept-${conceptKey}`;

      if (!conceptToSlideMap.has(conceptKey)) {
        conceptToSlideMap.set(conceptKey, []);
      }
      conceptToSlideMap.get(conceptKey)!.push(slideId);

      if (!nodeMap.has(conceptNodeId)) {
        const conceptNode: KnowledgeGraphNode = {
          id: conceptNodeId,
          label: conceptStr,
          type: 'concept',
          description: `Conceito-chave referenciado no slide ${index + 1}`,
          color: accentColor,
          radius: 11,
          group: subtopic,
          importance: 5,
          tags: ['Conceito', subtopic],
        };
        nodes.push(conceptNode);
        nodeMap.set(conceptNodeId, conceptNode);
      }

      // Link Slide to Concept
      links.push({
        source: slideId,
        target: conceptNodeId,
        type: isChallenge ? 'tests_concept' : 'contains_concept',
        label: isChallenge ? 'Testa' : 'Aplica',
        weight: 1,
        color: `${accentColor}90`,
      });
    });
  });

  // 5. Cross-reference links: Concepts that appear in multiple slides create bridge connections
  conceptToSlideMap.forEach((slideList, conceptKey) => {
    if (slideList.length > 1) {
      for (let i = 0; i < slideList.length - 1; i++) {
        for (let j = i + 1; j < slideList.length; j++) {
          links.push({
            source: slideList[i],
            target: slideList[j],
            type: 'cross_reference',
            label: 'Conceito Compartilhado',
            weight: 0.8,
            color: '#A855F7',
          });
        }
      }
    }
  });

  // Build cluster summary
  const clusters = Array.from(subtopicSet).map((sub, idx) => ({
    id: `module-${idx}`,
    name: sub,
    color: subtopicColorMap.get(sub) || clusterColors[idx % clusterColors.length],
    count: deck.slides.filter((s) => (s.subtopic?.trim() || 'Fundamentos') === sub).length,
  }));

  return {
    nodes,
    links,
    archetype: profile,
    deckTitle: deck.title,
    subject: deck.subject || deck.title,
    clusters,
  };
}
