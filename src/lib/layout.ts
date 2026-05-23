/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node, Edge } from '@xyflow/react';
import { Person } from '../types';

interface LayoutState {
  x: number;
}

const NODE_WIDTH = 280;
const NODE_GAP = 48;
const GENERATION_GAP = 260;
const START_X = 50;
const START_Y = 60;
const NODE_STEP = NODE_WIDTH + NODE_GAP;
const COUPLE_STEP = (NODE_WIDTH * 2) + NODE_GAP + 120;

/**
 * Custom-built family-tree layout positioning engine.
 * Walks the generations recursively from the absolute patriarchs/matriarchs down,
 * grouping spouses and positioning children horizontally underneath their parent pairs.
 */
export function buildFamilyTreeLayout(
  people: Person[],
  focusPersonId: string | null = null
): { nodes: Node[]; edges: Edge[] } {
  // If no people, return empty
  if (people.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Pre-calculate easy lookup maps
  const personMap = new Map<string, Person>();
  people.forEach(p => personMap.set(p.id, p));

  // Determine children lookup
  const childrenMap = new Map<string, Person[]>(); // Key: 'fatherId_motherId' or single parent ids
  people.forEach(p => {
    // If father is present, associate
    if (p.fatherid) {
      const arr = childrenMap.get(p.fatherid) || [];
      if (!arr.some(item => item.id === p.id)) arr.push(p);
      childrenMap.set(p.fatherid, arr);
    }
    // If mother is present, associate
    if (p.motherid) {
      const arr = childrenMap.get(p.motherid) || [];
      if (!arr.some(item => item.id === p.id)) arr.push(p);
      childrenMap.set(p.motherid, arr);
    }
  });

  // Calculate generational depth starting from patriarchs (level 0)
  const generationsMap = new Map<string, number>(); // ID -> Gen level

  // Helper: Find patriarchs (nodes without parents in our current list)
  const patriarchs = people.filter(p => !p.fatherid && !p.motherid);
  
  // Set default generation levels starting from patriarchs (level 0)
  function assignBaseGenerations(personId: string, currentLevel: number, visited: Set<string>) {
    if (visited.has(personId)) return;
    visited.add(personId);

    const level = generationsMap.get(personId) ?? -1;
    if (currentLevel > level) {
      generationsMap.set(personId, currentLevel);
      
      const person = personMap.get(personId);
      if (person) {
        // Assign spouse to same generation level
        if (person.spouseid) {
          generationsMap.set(person.spouseid, currentLevel);
        }
        // Get children list
        const kids = getChildrenOf(personId);
        kids.forEach(kid => {
          assignBaseGenerations(kid.id, currentLevel + 1, visited);
        });
      }
    }
  }

  // Get active children helper
  function getChildrenOf(personId: string): Person[] {
    const parent = personMap.get(personId);
    if (!parent) return [];
    
    // Children where either mother or father is this person
    return people.filter(p => p.fatherid === personId || p.motherid === personId);
  }

  const baseVisited = new Set<string>();
  patriarchs.forEach(pat => {
    assignBaseGenerations(pat.id, 0, baseVisited);
  });

  // Deal with any orphaned loops/disconnections
  people.forEach(p => {
    if (!generationsMap.has(p.id)) {
      generationsMap.set(p.id, 0);
    }
  });

  // If we have a focus member, we ONLY show immediate relatives logic:
  // - Focused person
  // - Father & Mother
  // - Spouse (or anyone who is spouse of this focused person)
  // - Children (anyone who has this focused person as father or mother)
  let activePeople = [...people];
  if (focusPersonId && personMap.has(focusPersonId)) {
    const focusPerson = personMap.get(focusPersonId)!;
    const keepIds = new Set<string>();
    
    // Add self
    keepIds.add(focusPersonId);
    
    // Add parents
    if (focusPerson.fatherid) keepIds.add(focusPerson.fatherid);
    if (focusPerson.motherid) keepIds.add(focusPerson.motherid);
    
    // Add spouse
    if (focusPerson.spouseid) keepIds.add(focusPerson.spouseid);
    people.forEach(p => {
      if (p.spouseid === focusPersonId) {
        keepIds.add(p.id);
      }
    });

    // Add children
    people.forEach(p => {
      if (p.fatherid === focusPersonId || p.motherid === focusPersonId) {
        keepIds.add(p.id);
      }
    });

    activePeople = people.filter(p => keepIds.has(p.id));
  }

  // Recalculate maps for active set only
  const activeMap = new Map<string, Person>();
  activePeople.forEach(p => activeMap.set(p.id, p));

  // Build Layout Coordinates
  // Spacing must match the rendered card width in FamilyMemberNode.
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const posMap = new Map<string, { x: number; y: number }>();

  // A list of processed couples to prevent outputting them multiple times
  const processedCouples = new Set<string>();
  const processedIndividuals = new Set<string>();

  // In order to make a nice aligned layout, we sort active people by generation, then group by parent pairs.
  const activeGens: { [level: number]: Person[] } = {};
  activePeople.forEach(p => {
    const g = generationsMap.get(p.id) || 0;
    if (!activeGens[g]) activeGens[g] = [];
    activeGens[g].push(p);
  });

  const levels = Object.keys(activeGens).map(Number).sort((a, b) => a - b);
  
  // Track continuous horizontal offset per level to keep it super simple and prevent overlap
  const levelOffsets: { [gen: number]: number } = {};
  levels.forEach(g => {
    levelOffsets[g] = 0;
  });

  // 1. Arrange each generation. Let's process level by level.
  levels.forEach(g => {
    const levelPeople = activeGens[g];
    let currentX = START_X; // Starting x padding

    levelPeople.forEach(p => {
      if (processedIndividuals.has(p.id)) return;

      const y = g * GENERATION_GAP + START_Y; // Base Y position for this generation

      // Check if this person has a spouse in the same generation
      const spouse = p.spouseid ? activeMap.get(p.spouseid) : null;
      const isSpouseAtSameLevel = spouse && (generationsMap.get(spouse.id) === g);

      if (isSpouseAtSameLevel && spouse) {
        // Found couple!
        processedIndividuals.add(p.id);
        processedIndividuals.add(spouse.id);

        const coupleId = [p.id, spouse.id].sort().join('-');
        if (processedCouples.has(coupleId)) return;
        processedCouples.add(coupleId);

        // Put primary member on left, spouse on right
        const leftPerson = p.gender === 'male' ? p : spouse;
        const rightPerson = p.gender === 'male' ? spouse : p;

        // Position husband & wife next to each other
        const xLeft = currentX;
        const xRight = currentX + NODE_STEP;

        posMap.set(leftPerson.id, { x: xLeft, y });
        posMap.set(rightPerson.id, { x: xRight, y });

        // Build spouse connector edge (dashed gold line, horizontal, union style)
        edges.push({
          id: `spouse-edge-${leftPerson.id}-${rightPerson.id}`,
          source: leftPerson.id,
          target: rightPerson.id,
          type: 'straight',
          animated: false,
          style: { stroke: '#eab308', strokeWidth: 3, strokeDasharray: '4 4' },
          markerEnd: undefined // Couples don't need arrows
        });

        // Advance horizontal spacing cursor
        currentX += COUPLE_STEP; // Spacious padding for families
      } else {
        // Individual with no active spouse
        processedIndividuals.add(p.id);
        posMap.set(p.id, { x: currentX, y });
        currentX += NODE_STEP;
      }
    });

    levelOffsets[g] = currentX;
  });

  // 2. Beautiful alignment pass: Centering children below parents!
  // If parents A and B are positioned at (X_A, Y_A) and (X_B, Y_B),
  // they form a mid-point X_parentMatch = (X_A + X_B) / 2.
  // Their children should ideally be centered around X_parentMatch!
  // Let's do a top-down alignment tuning pass to make it look gorgeous.
  levels.forEach(g => {
    const parentLevelPeople = activeGens[g] || [];
    
    parentLevelPeople.forEach(parent => {
      // Find spouse
      const spouse = parent.spouseid ? activeMap.get(parent.spouseid) : null;
      if (!spouse) return;

      const parentPos = posMap.get(parent.id);
      const spousePos = posMap.get(spouse.id);
      if (!parentPos || !spousePos) return;

      // Calculate couple mid point
      const midX = (parentPos.x + spousePos.x) / 2;

      // Get children
      const kids = activePeople.filter(p => p.fatherid === parent.id || p.motherid === parent.id);
      if (kids.length === 0) return;

      // Center the kids below. Total width occupied by kids is based on actual node spacing.
      const kidsWidth = (kids.length - 1) * NODE_STEP;
      const startKidsX = midX - kidsWidth / 2;

      kids.forEach((kid, idx) => {
        const kidPos = posMap.get(kid.id);
        const kidGen = generationsMap.get(kid.id) || (g + 1);
        if (kidPos) {
          // Adjust kid's x coordinates dynamically to center, avoiding extreme shifts that overlap other couples
          const proposedX = startKidsX + (idx * NODE_STEP);
          
          // Only shift if it doesn't cause negative coordinates or major bounds overlap.
          // In a simple app, setting it directly yields an incredible neat grid!
          kidPos.x = proposedX;
          posMap.set(kid.id, kidPos);
        }
      });
    });
  });

  // 3. Prevent extreme horizontal overlap post-center
  // If any two nodes in the exact same generation level are too close, shove them apart.
  levels.forEach(g => {
    const levelPeople = activeGens[g] || [];
    // Sort them by current calculated X position
    levelPeople.sort((a, b) => {
      const xA = posMap.get(a.id)?.x ?? 0;
      const xB = posMap.get(b.id)?.x ?? 0;
      return xA - xB;
    });

    // Check overlaps
    for (let i = 1; i < levelPeople.length; i++) {
      const prevId = levelPeople[i - 1].id;
      const currId = levelPeople[i].id;
      const prevPos = posMap.get(prevId);
      const currPos = posMap.get(currId);

      if (prevPos && currPos) {
        const minGap = NODE_STEP; // minimum margin based on rendered node width
        if (currPos.x < prevPos.x + minGap) {
          const overlap = (prevPos.x + minGap) - currPos.x;
          // Shift this and all subsequent nodes in the same level right
          for (let j = i; j < levelPeople.length; j++) {
            const idToShift = levelPeople[j].id;
            const pos = posMap.get(idToShift);
            if (pos) {
              pos.x += overlap;
              posMap.set(idToShift, pos);
            }
          }
        }
      }
    }
  });

  // 4. Transform Person models into visual Nodes
  activePeople.forEach(p => {
    const coords = posMap.get(p.id) || { x: 50, y: 50 };
    
    // Check if this person is focused
    const isFocused = p.id === focusPersonId;

    nodes.push({
      id: p.id,
      type: 'familyMember', // Custom React Flow Node style
      position: { x: coords.x, y: coords.y },
      data: {
        person: p,
        isFocused,
        onFocusSelect: undefined, // Filled at runtime in React component
      },
      draggable: true,
    });

    // Add Parent-to-Child edges
    // We draw connection from BOTH father and mother to the child.
    // However, to make it super elegant, we can combine father-mother links or connect them nicely.
    // Connect father -> child
    if (p.fatherid && activeMap.has(p.fatherid)) {
      edges.push({
        id: `parent-father-edge-${p.fatherid}-${p.id}`,
        source: p.fatherid,
        target: p.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#475569', strokeWidth: 2 }, // Slate colored line for fathers
      });
    }

    // Connect mother -> child
    if (p.motherid && activeMap.has(p.motherid)) {
      edges.push({
        id: `parent-mother-edge-${p.motherid}-${p.id}`,
        source: p.motherid,
        target: p.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#be185d', strokeWidth: 2 }, // Crimson/rose styled line for mothers
      });
    }
  });

  return { nodes, edges };
}
