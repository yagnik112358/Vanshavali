/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Node, Edge } from '@xyflow/react';
import { Person, SpouseRelation } from '../types';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 150;
const NODE_GAP = 88;
const LEVEL_GAP = 300;
const SUBTREE_GAP = 180;
const START_X = 80;
const START_Y = 60;

/**
 * Strict level-order family tree layout.
 *
 * Parents are always placed above children. Siblings are grouped under the same
 * parent unit, and the tree grows horizontally instead of compressing lines
 * through unrelated people.
 */
export function buildFamilyTreeLayout(
  people: Person[],
  focusPersonId: string | null = null
): { nodes: Node[]; edges: Edge[] } {
  if (people.length === 0) {
    return { nodes: [], edges: [] };
  }

  const personMap = new Map<string, Person>();
  people.forEach(person => personMap.set(person.id, person));

  let activePeople = [...people];
  if (focusPersonId && personMap.has(focusPersonId)) {
    const focusPerson = personMap.get(focusPersonId)!;
    const keepIds = new Set<string>([focusPersonId]);

    getParentIds(focusPerson, personMap).forEach(parentId => keepIds.add(parentId));
    if (focusPerson.spouseid) keepIds.add(focusPerson.spouseid);
    getSpouseRelations(focusPerson).forEach(relation => keepIds.add(relation.personId));

    people.forEach(person => {
      if (person.spouseid === focusPersonId) keepIds.add(person.id);
      if (getSpouseRelations(person).some(relation => relation.personId === focusPersonId)) keepIds.add(person.id);
      if (getParentIds(person, personMap).includes(focusPersonId)) keepIds.add(person.id);
    });

    activePeople = people.filter(person => keepIds.has(person.id));
  }

  const activeMap = new Map<string, Person>();
  activePeople.forEach(person => activeMap.set(person.id, person));

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const posMap = new Map<string, { x: number; y: number }>();

  function getParentIds(person: Person, lookup: Map<string, Person>): string[] {
    return [person.fatherid, person.motherid].filter((id): id is string => !!id && lookup.has(id));
  }

  function getSpouseRelations(person: Person): SpouseRelation[] {
    const relationMap = new Map<string, SpouseRelation>();
    (person.spouses || []).forEach(relation => {
      if (!relation.personId) return;
      relationMap.set(relation.personId, {
        personId: relation.personId,
        status: relation.status || 'current',
        startDate: relation.startDate || null,
        endDate: relation.endDate || null,
        childrenIds: relation.childrenIds || [],
      });
    });
    if (person.spouseid && !relationMap.has(person.spouseid)) {
      relationMap.set(person.spouseid, {
        personId: person.spouseid,
        status: 'current',
        startDate: null,
        endDate: null,
        childrenIds: [],
      });
    }
    return Array.from(relationMap.values());
  }

  const spouseGraph = new Map<string, Set<string>>();
  activePeople.forEach(person => spouseGraph.set(person.id, new Set<string>()));
  activePeople.forEach(person => {
    getSpouseRelations(person).forEach(relation => {
      if (!activeMap.has(relation.personId)) return;
      spouseGraph.get(person.id)?.add(relation.personId);
      spouseGraph.get(relation.personId)?.add(person.id);
    });
  });

  const spouseUnitByPerson = new Map<string, string>();
  const visitedSpouseUnits = new Set<string>();
  activePeople.forEach(person => {
    if (visitedSpouseUnits.has(person.id)) return;

    const stack = [person.id];
    const component: string[] = [];
    visitedSpouseUnits.add(person.id);

    while (stack.length > 0) {
      const personId = stack.pop()!;
      component.push(personId);
      spouseGraph.get(personId)?.forEach(spouseId => {
        if (visitedSpouseUnits.has(spouseId)) return;
        visitedSpouseUnits.add(spouseId);
        stack.push(spouseId);
      });
    }

    const unitKey = component.sort().join('__');
    component.forEach(personId => spouseUnitByPerson.set(personId, unitKey));
  });

  function getUnitKey(personId: string): string {
    return spouseUnitByPerson.get(personId) || personId;
  }

  function getPeopleOrderIndex(personId: string): number {
    return activePeople.findIndex(person => person.id === personId);
  }

  const unitMembers = new Map<string, Person[]>();
  activePeople.forEach(person => {
    const key = getUnitKey(person.id);
    const members = unitMembers.get(key) || [];
    if (!members.some(member => member.id === person.id)) {
      members.push(person);
    }
    unitMembers.set(key, members);
  });

  unitMembers.forEach((members, key) => {
    members.sort((a, b) => {
      if (a.gender === 'male' && b.gender !== 'male') return -1;
      if (a.gender !== 'male' && b.gender === 'male') return 1;
      return getPeopleOrderIndex(a.id) - getPeopleOrderIndex(b.id);
    });
    unitMembers.set(key, members);
  });

  function getUnitSortIndex(unitKey: string): number {
    const indexes = (unitMembers.get(unitKey) || [])
      .map(member => getPeopleOrderIndex(member.id))
      .filter(index => index >= 0);
    return indexes.length > 0 ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
  }

  const parentUnitByUnit = new Map<string, string>();
  unitMembers.forEach((members, unitKey) => {
    for (const member of members) {
      const parentId = getParentIds(member, activeMap).find(id => getUnitKey(id) !== unitKey);
      if (parentId) {
        parentUnitByUnit.set(unitKey, getUnitKey(parentId));
        break;
      }
    }
  });

  function getParentIdsForUnit(unitKey: string): string[] {
    const parentIds = new Set<string>();
    (unitMembers.get(unitKey) || []).forEach(member => {
      getParentIds(member, activeMap).forEach(parentId => {
        if (getUnitKey(parentId) !== unitKey) {
          parentIds.add(parentId);
        }
      });
    });
    return Array.from(parentIds);
  }

  const childrenByUnit = new Map<string, string[]>();
  parentUnitByUnit.forEach((parentUnitKey, childUnitKey) => {
    const children = childrenByUnit.get(parentUnitKey) || [];
    if (!children.includes(childUnitKey)) {
      children.push(childUnitKey);
    }
    childrenByUnit.set(parentUnitKey, children);
  });

  childrenByUnit.forEach((children, parentKey) => {
    children.sort((a, b) => getUnitSortIndex(a) - getUnitSortIndex(b));
    childrenByUnit.set(parentKey, children);
  });

  function getUnitWidth(unitKey: string): number {
    const memberCount = unitMembers.get(unitKey)?.length || 1;
    return (memberCount * NODE_WIDTH) + ((memberCount - 1) * NODE_GAP);
  }

  const measuredWidths = new Map<string, number>();
  function measureSubtree(unitKey: string, visiting = new Set<string>()): number {
    if (measuredWidths.has(unitKey)) return measuredWidths.get(unitKey)!;
    if (visiting.has(unitKey)) return getUnitWidth(unitKey);

    visiting.add(unitKey);
    const childKeys = childrenByUnit.get(unitKey) || [];
    const childrenWidth = childKeys.reduce((total, childKey, index) => {
      const gap = index === 0 ? 0 : SUBTREE_GAP;
      return total + gap + measureSubtree(childKey, visiting);
    }, 0);
    visiting.delete(unitKey);

    const width = Math.max(getUnitWidth(unitKey), childrenWidth);
    measuredWidths.set(unitKey, width);
    return width;
  }

  const positioned = new Set<string>();
  function positionSubtree(unitKey: string, left: number, level: number): void {
    if (positioned.has(unitKey)) return;
    positioned.add(unitKey);

    const subtreeWidth = measureSubtree(unitKey);
    const members = unitMembers.get(unitKey) || [];
    const unitWidth = getUnitWidth(unitKey);
    const unitLeft = left + ((subtreeWidth - unitWidth) / 2);
    const y = START_Y + (level * LEVEL_GAP);

    members.forEach((member, index) => {
      posMap.set(member.id, {
        x: unitLeft + (index * (NODE_WIDTH + NODE_GAP)),
        y,
      });
    });

    const childKeys = [...(childrenByUnit.get(unitKey) || [])].sort((a, b) => {
      const getDesiredCenter = (childKey: string): number => {
        const parentCenters = getParentIdsForUnit(childKey)
          .map(parentId => posMap.get(parentId))
          .filter((pos): pos is { x: number; y: number } => !!pos)
          .map(pos => pos.x + (NODE_WIDTH / 2));
        if (parentCenters.length === 0) return getUnitSortIndex(childKey);
        return parentCenters.reduce((sum, center) => sum + center, 0) / parentCenters.length;
      };

      return getDesiredCenter(a) - getDesiredCenter(b);
    });
    const childrenWidth = childKeys.reduce((total, childKey, index) => {
      const gap = index === 0 ? 0 : SUBTREE_GAP;
      return total + gap + measureSubtree(childKey);
    }, 0);

    let childLeft = left + ((subtreeWidth - childrenWidth) / 2);
    childKeys.forEach((childKey, index) => {
      if (index > 0) childLeft += SUBTREE_GAP;
      positionSubtree(childKey, childLeft, level + 1);
      childLeft += measureSubtree(childKey);
    });
  }

  const rootUnitKeys = Array.from(unitMembers.keys())
    .filter(unitKey => !parentUnitByUnit.has(unitKey) || parentUnitByUnit.get(unitKey) === unitKey)
    .sort((a, b) => getUnitSortIndex(a) - getUnitSortIndex(b));

  let nextRootX = START_X;
  rootUnitKeys.forEach(rootKey => {
    positionSubtree(rootKey, nextRootX, 0);
    nextRootX += measureSubtree(rootKey) + SUBTREE_GAP;
  });

  Array.from(unitMembers.keys()).forEach(unitKey => {
    if (positioned.has(unitKey)) return;
    positionSubtree(unitKey, nextRootX, 0);
    nextRootX += measureSubtree(unitKey) + SUBTREE_GAP;
  });

  activePeople.forEach(person => {
    const coords = posMap.get(person.id) || { x: START_X, y: START_Y };
    nodes.push({
      id: person.id,
      type: 'familyMember',
      position: coords,
      data: {
        person,
        isFocused: person.id === focusPersonId,
        onFocusSelect: undefined,
      },
      draggable: true,
      zIndex: 10,
    });
  });

  const drawnSpouseEdges = new Set<string>();
  activePeople.forEach(person => {
    getSpouseRelations(person).forEach(relation => {
      if (!activeMap.has(relation.personId)) return;
      const edgeKey = [person.id, relation.personId].sort().join('__');
      if (drawnSpouseEdges.has(edgeKey)) return;
      drawnSpouseEdges.add(edgeKey);

      const sourcePos = posMap.get(person.id);
      const targetPos = posMap.get(relation.personId);
      const sourceIsLeft = (sourcePos?.x || 0) <= (targetPos?.x || 0);

      const sourceY = sourcePos?.y ?? targetPos?.y ?? START_Y;
      edges.push({
        id: `spouse-edge-${edgeKey}`,
        source: sourceIsLeft ? person.id : relation.personId,
        target: sourceIsLeft ? relation.personId : person.id,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'familyRelation',
        data: { laneY: sourceY - 34 },
        animated: false,
        style: {
          stroke: relation.status === 'current' ? '#eab308' : '#a8a29e',
          strokeWidth: relation.status === 'current' ? 3 : 2,
          strokeDasharray: relation.status === 'current' ? '4 4' : '2 6',
        },
        zIndex: 0,
      });
    });
  });

  const childLaneIndex = new Map<string, number>();
  activePeople
    .filter(child => getParentIds(child, activeMap).length > 0)
    .sort((a, b) => (posMap.get(a.id)?.x || 0) - (posMap.get(b.id)?.x || 0))
    .forEach((child, index) => childLaneIndex.set(child.id, index));

  const drawnParentEdges = new Set<string>();
  activePeople.forEach(child => {
    getParentIds(child, activeMap).forEach(parentId => {
      const edgeId = `parent-edge-${parentId}-${child.id}`;
      if (drawnParentEdges.has(edgeId)) return;
      drawnParentEdges.add(edgeId);

      const parentPos = posMap.get(parentId);
      const childPos = posMap.get(child.id);
      const laneOffset = ((childLaneIndex.get(child.id) || 0) % 4) * 24;
      const laneY = parentPos && childPos
        ? Math.min(parentPos.y + NODE_HEIGHT + 48 + laneOffset, childPos.y - 56)
        : undefined;

      edges.push({
        id: edgeId,
        source: parentId,
        sourceHandle: 'bottom',
        target: child.id,
        targetHandle: 'top',
        type: 'familyRelation',
        data: { laneY },
        animated: false,
        style: {
          stroke: child.fatherid === parentId ? '#475569' : '#be185d',
          strokeWidth: 2.25,
        },
        zIndex: 0,
      });
    });
  });

  return { nodes, edges };
}
