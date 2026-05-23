/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BaseEdge, EdgeProps } from '@xyflow/react';

interface FamilyRelationEdgeData extends Record<string, unknown> {
  laneY?: number;
}

export function FamilyRelationEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = data as FamilyRelationEdgeData | undefined;
  const laneY = typeof edgeData?.laneY === 'number'
    ? edgeData.laneY
    : sourceY + ((targetY - sourceY) / 2);

  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${laneY}`,
    `L ${targetX} ${laneY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ');

  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />;
}

export default FamilyRelationEdge;
