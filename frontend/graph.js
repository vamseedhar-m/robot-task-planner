/* eslint-disable */
const GRAPH = (() => {
  const NODE_W = 250;
  const NODE_H = 60;
  const H_GAP = 160;
  const V_GAP = 30;

  const ACTION_COLORS = {
    move: '#4d9fff',
    grasp: '#34c96a',
    release: '#f08642',
    inspect: '#a87fff',
    decision: '#e8a020',
    wait: '#6b7a99',
    home: '#4d9fff'
  };

  function getNodeColor(step) {
    if (step.constraint_warnings && step.constraint_warnings.length > 0) return '#f85149';
    return ACTION_COLORS[step.action_type] || '#6b7a99';
  }

  // ── Layout: BFS-based column assignment (cycle-safe) ─────────────────────
  // Uses forward-edge-only BFS so plans with loop-back steps still lay out
  // left-to-right instead of stacking every node in column 0.
  function computeLayout(steps) {
    if (!steps || steps.length === 0) return {};

    const stepMap = {};
    const stepIdx = {};
    steps.forEach((s, i) => { stepMap[s.id] = s; stepIdx[s.id] = i; });

    // Build successor lists
    const successors = {};
    steps.forEach(s => { successors[s.id] = []; });
    steps.forEach(s => {
      if (s.next_step_id && stepMap[s.next_step_id]) successors[s.id].push(s.next_step_id);
      if (s.branches) s.branches.forEach(b => {
        if (stepMap[b.next_step_id]) successors[s.id].push(b.next_step_id);
      });
    });

    // Column assignment: BFS, skip back-edges (target index ≤ source index)
    const cols = {};
    steps.forEach(s => { cols[s.id] = 0; });

    const visited = new Set([steps[0].id]);
    const queue = [steps[0].id];
    while (queue.length > 0) {
      const id = queue.shift();
      (successors[id] || []).forEach(nid => {
        if (stepIdx[id] < stepIdx[nid]) {           // forward edge only
          if (cols[id] + 1 > cols[nid]) cols[nid] = cols[id] + 1;
          if (!visited.has(nid)) { visited.add(nid); queue.push(nid); }
        }
      });
    }

    // Relaxation (Bellman-Ford style, forward edges) — pushes convergence
    // nodes rightward past all their predecessors. Capped to prevent loops.
    let changed = true;
    let guard = steps.length;
    while (changed && guard-- > 0) {
      changed = false;
      steps.forEach(s => {
        (successors[s.id] || []).forEach(nid => {
          if (stepIdx[s.id] < stepIdx[nid] && cols[s.id] >= cols[nid]) {
            cols[nid] = cols[s.id] + 1;
            changed = true;
          }
        });
      });
    }

    // Row assignment: BFS — decision branches fan rows downward
    const rows = {};
    steps.forEach(s => { rows[s.id] = 0; });
    const rowVisited = new Set([steps[0].id]);
    const rowQ = [steps[0].id];
    while (rowQ.length > 0) {
      const id = rowQ.shift();
      const step = stepMap[id];
      if (!step) continue;
      if (step.is_decision_point && step.branches && step.branches.length > 0) {
        step.branches.forEach((b, i) => {
          if (stepMap[b.next_step_id] && !rowVisited.has(b.next_step_id)) {
            rows[b.next_step_id] = rows[id] + i;
            rowVisited.add(b.next_step_id); rowQ.push(b.next_step_id);
          }
        });
      } else if (step.next_step_id && stepMap[step.next_step_id] && !rowVisited.has(step.next_step_id)) {
        rows[step.next_step_id] = rows[id];
        rowVisited.add(step.next_step_id); rowQ.push(step.next_step_id);
      }
    }

    // Re-index rows per column to consecutive integers, preserving order
    const colGroups = {};
    steps.forEach(s => {
      const c = cols[s.id];
      if (!colGroups[c]) colGroups[c] = [];
      colGroups[c].push({ id: s.id, origRow: rows[s.id] });
    });
    Object.values(colGroups).forEach(group => {
      group.sort((a, b) => a.origRow - b.origRow);
      group.forEach((item, i) => { rows[item.id] = i; });
    });

    // Pixel positions — vertically centre shorter columns
    const maxRowsInAnyCol = Math.max(...Object.values(colGroups).map(g => g.length));
    const positions = {};
    steps.forEach(s => {
      const col = cols[s.id] || 0;
      const row = rows[s.id] || 0;
      const groupSize = (colGroups[col] || []).length || 1;
      const yOffset = ((maxRowsInAnyCol - groupSize) / 2) * (NODE_H + V_GAP);
      positions[s.id] = {
        x: col * (NODE_W + H_GAP),
        y: yOffset + row * (NODE_H + V_GAP)
      };
    });

    return positions;
  }

  // ── Edge path ─────────────────────────────────────────────────────────────
  // syOffset / eyOffset stagger same-source and same-target edges so no two
  // arrows ever share a path segment.
  // isBackEdge routes loop-back arrows below the graph as a Bézier arc.
  function edgePath(src, dst, syOffset, eyOffset, isBackEdge) {
    syOffset = syOffset || 0;
    eyOffset = eyOffset || 0;

    if (isBackEdge) {
      // Arc below the nodes — depth scales with horizontal span
      const bsx = src.x + NODE_W;
      const bsy = src.y + NODE_H - 6;
      const bex = dst.x;
      const bey = dst.y + NODE_H - 6;
      const depth = 30 + (bsx - bex) * 0.12;
      const loopY = Math.max(bsy, bey) + depth;
      return `M ${bsx} ${bsy} C ${bsx + 20} ${loopY} ${bex - 20} ${loopY} ${bex} ${bey}`;
    }

    const sx = src.x + NODE_W;
    const sy = src.y + NODE_H / 2 + syOffset;
    const ex = dst.x;
    const ey = dst.y + NODE_H / 2 + eyOffset;

    if (Math.abs(sy - ey) < 2) return `M ${sx} ${sy} L ${ex} ${ey}`;

    const mx = sx + (ex - sx) * 0.5;
    const r = 6;
    const dy = ey > sy ? 1 : -1;

    return [
      `M ${sx} ${sy}`,
      `L ${mx - r} ${sy}`,
      `Q ${mx} ${sy} ${mx} ${sy + dy * r}`,
      `L ${mx} ${ey - dy * r}`,
      `Q ${mx} ${ey} ${mx + r} ${ey}`,
      `L ${ex} ${ey}`
    ].join(' ');
  }

  function renderGraph(container, taskPlan, onNodeClick) {
    const existingSvg = container.querySelector('svg');
    if (existingSvg) existingSvg.remove();

    const steps = taskPlan.steps;
    if (!steps || steps.length === 0) return;

    const positions = computeLayout(steps);

    const padding = 60;
    const maxX = steps.reduce((m, s) => Math.max(m, (positions[s.id] || { x: 0 }).x), 0) + NODE_W + padding;
    const maxY = steps.reduce((m, s) => Math.max(m, (positions[s.id] || { y: 0 }).y), 0) + NODE_H + padding;

    const svg = d3.select(container).append('svg').attr('width', '100%').attr('height', '100%');
    const defs = svg.append('defs');

    ['normal', 'branch', 'back'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5 Z')
        .attr('fill', type === 'branch' ? '#e8a020' : '#8899bb');
    });

    const zoomGroup = svg.append('g').attr('class', 'zoom-layer');
    let zoom = null;

    function fitAndCenter() {
      const cw = container.clientWidth || 800;
      const ch = container.clientHeight || 500;
      const scale = Math.max(0.2, Math.min(1, (cw - 40) / maxX, (ch - 40) / maxY));
      const tx = (cw - maxX * scale) / 2;
      const ty = (ch - maxY * scale) / 2;
      if (zoom) {
        try { svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale)); }
        catch (_) { zoomGroup.attr('transform', `translate(${tx},${ty}) scale(${scale})`); }
      } else {
        zoomGroup.attr('transform', `translate(${tx},${ty}) scale(${scale})`);
      }
    }

    // Build edge list — detect back-edges by step array index
    const stepIdx = {};
    steps.forEach((s, i) => { stepIdx[s.id] = i; });

    const edges = [];
    steps.forEach(step => {
      if (step.is_decision_point && step.branches) {
        step.branches.forEach(b => {
          const isBack = stepIdx[b.next_step_id] !== undefined && stepIdx[b.next_step_id] < stepIdx[step.id];
          edges.push({ source: step.id, target: b.next_step_id, label: b.condition, isBranch: true, isBack });
        });
      } else if (step.next_step_id) {
        const isBack = stepIdx[step.next_step_id] !== undefined && stepIdx[step.next_step_id] < stepIdx[step.id];
        edges.push({ source: step.id, target: step.next_step_id, label: null, isBranch: false, isBack });
      }
    });

    // ── Per-edge y-offsets so no two forward arrows share any segment ───────
    // Edges leaving the same source fan from different y positions.
    // Edges entering the same target arrive at different y positions.
    const sourceGroups = {};
    const targetGroups = {};
    edges.forEach(e => {
      if (!e.isBack) {
        (sourceGroups[e.source] = sourceGroups[e.source] || []).push(e);
        (targetGroups[e.target] = targetGroups[e.target] || []).push(e);
      }
    });

    function spreadOffsets(groups, prop) {
      Object.values(groups).forEach(group => {
        const n = group.length;
        const spread = Math.min((n - 1) * 8, NODE_H * 0.45);
        group.forEach((edge, i) => {
          edge[prop] = n > 1 ? -spread / 2 + i * (spread / (n - 1)) : 0;
        });
      });
    }
    spreadOffsets(sourceGroups, '_sy');
    spreadOffsets(targetGroups, '_ey');

    // Render edges
    const edgeLayer = zoomGroup.append('g');
    edges.forEach(edge => {
      const sp = positions[edge.source];
      const tp = positions[edge.target];
      if (!sp || !tp) return;

      const strokeColor = edge.isBranch ? '#e8a020' : '#8899bb';
      const markerType = edge.isBranch ? 'branch' : edge.isBack ? 'back' : 'normal';

      edgeLayer.append('path')
        .attr('d', edgePath(sp, tp, edge._sy, edge._ey, edge.isBack))
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', edge.isBack ? 1 : 1.5)
        .attr('stroke-dasharray', edge.isBack ? '4,4' : edge.isBranch ? '5,3' : 'none')
        .attr('opacity', edge.isBack ? 0.45 : 1)
        .attr('marker-end', `url(#arrow-${markerType})`);

      // Branch condition label (not on back-edges)
      if (edge.label && !edge.isBack) {
        const labelText = edge.label;
        const charW = 6.5;
        const labelW = Math.min(H_GAP - 20, Math.max(60, labelText.length * charW + 16));
        const labelH = 18;
        const lx = sp.x + NODE_W + 10;
        const ly = tp.y + NODE_H / 2;

        edgeLayer.append('rect')
          .attr('x', lx).attr('y', ly - labelH / 2)
          .attr('width', labelW).attr('height', labelH).attr('rx', 4)
          .attr('fill', '#080c12').attr('stroke', '#e8a020').attr('stroke-width', 1);

        edgeLayer.append('text')
          .attr('x', lx + labelW / 2).attr('y', ly + 5)
          .attr('text-anchor', 'middle')
          .attr('fill', '#e8a020')
          .attr('font-size', '10px').attr('font-weight', '500')
          .attr('font-family', 'Inter, system-ui, sans-serif')
          .text(labelText);
      }
    });

    // ── Nodes ────────────────────────────────────────────────────────────────
    const stepNumber = {};
    steps.forEach((s, i) => { stepNumber[s.id] = i + 1; });

    const nodeLayer = zoomGroup.selectAll('.node')
      .data(steps).enter().append('g').attr('class', 'node')
      .attr('transform', d => {
        const p = positions[d.id] || { x: 0, y: 0 };
        return `translate(${p.x},${p.y})`;
      });

    // Per-node SVG clipPath — never JS-truncates, shows as much as physically fits
    nodeLayer.append('clipPath')
      .attr('id', (d, i) => `nc-${i}`)
      .append('rect')
      .attr('x', 36).attr('y', 4)
      .attr('width', NODE_W - 56)    // 194 px ≈ 30 chars at 10.5 px Inter 600
      .attr('height', NODE_H - 8);

    nodeLayer.append('rect').attr('class', 'node-shadow')
      .attr('x', -3).attr('y', -3).attr('width', NODE_W + 6).attr('height', NODE_H + 6)
      .attr('rx', 10).attr('fill', 'none').attr('stroke', 'none');

    nodeLayer.append('rect').attr('class', 'node-bg')
      .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 8)
      .attr('fill', d => d.constraint_warnings && d.constraint_warnings.length ? '#1a0f0e' : '#0f1520')
      .attr('stroke', d => getNodeColor(d)).attr('stroke-width', 1.5);

    // Left colour bar
    nodeLayer.append('rect').attr('width', 4).attr('height', NODE_H).attr('rx', 2)
      .attr('fill', d => getNodeColor(d));

    // Step number badge
    nodeLayer.append('circle').attr('cx', 20).attr('cy', 20).attr('r', 9)
      .attr('fill', d => getNodeColor(d) + '22')
      .attr('stroke', d => getNodeColor(d)).attr('stroke-width', 1.5);

    nodeLayer.append('text').attr('x', 20).attr('y', 24).attr('text-anchor', 'middle')
      .attr('fill', d => getNodeColor(d)).attr('font-size', '10px').attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, monospace').text(d => stepNumber[d.id]);

    // Step name (clipped, never truncated by JS)
    nodeLayer.append('text').attr('x', 37).attr('y', 23)
      .attr('clip-path', (d, i) => `url(#nc-${i})`)
      .attr('fill', '#eef2f8').attr('font-size', '10.5px').attr('font-weight', '600')
      .attr('font-family', 'Inter, system-ui, sans-serif').text(d => d.name);

    // Action type label
    nodeLayer.append('text').attr('x', 37).attr('y', 39)
      .attr('fill', d => getNodeColor(d)).attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace').text(d => d.action_type.toUpperCase());

    // Warning badge (!)
    nodeLayer.filter(d => d.constraint_warnings && d.constraint_warnings.length)
      .append('circle').attr('cx', NODE_W - 13).attr('cy', 13).attr('r', 8)
      .attr('fill', '#1a0f0e').attr('stroke', '#f85149').attr('stroke-width', 1.5);
    nodeLayer.filter(d => d.constraint_warnings && d.constraint_warnings.length)
      .append('text').attr('x', NODE_W - 13).attr('y', 17).attr('text-anchor', 'middle')
      .attr('fill', '#f85149').attr('font-size', '10px').attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, monospace').text('!');

    // Decision diamond indicator (◆)
    nodeLayer.filter(d => d.is_decision_point)
      .append('text').attr('x', NODE_W - 13)
      .attr('y', d => d.constraint_warnings && d.constraint_warnings.length ? 35 : 17)
      .attr('text-anchor', 'middle').attr('fill', '#e8a020').attr('font-size', '11px').text('◆');

    // Click to select
    nodeLayer.on('click', function (event, d) {
      event.stopPropagation();
      zoomGroup.selectAll('.node-bg').attr('stroke-width', 1.5);
      zoomGroup.selectAll('.node-shadow').attr('stroke', 'none');
      d3.select(this).select('.node-bg').attr('stroke-width', 3);
      d3.select(this).select('.node-shadow')
        .attr('stroke', getNodeColor(d)).attr('stroke-width', 2).attr('stroke-opacity', 0.5);
      onNodeClick(d);
    });

    // Hover tooltip
    nodeLayer
      .on('mouseenter', function (event, d) {
        d3.select(this).select('.node-bg')
          .attr('fill', d.constraint_warnings && d.constraint_warnings.length ? '#221210' : '#161d2e');
        const tip = document.getElementById('node-tooltip');
        if (tip) {
          tip.querySelector('.tooltip-name').textContent = d.name;
          tip.querySelector('.tooltip-desc').textContent = d.description || '';
          const rect = container.getBoundingClientRect();
          tip.style.left = (event.clientX - rect.left + 14) + 'px';
          tip.style.top = Math.max(4, event.clientY - rect.top - 48) + 'px';
          tip.classList.remove('hidden');
        }
      })
      .on('mousemove', function (event) {
        const tip = document.getElementById('node-tooltip');
        if (tip && !tip.classList.contains('hidden')) {
          const rect = container.getBoundingClientRect();
          tip.style.left = (event.clientX - rect.left + 14) + 'px';
          tip.style.top = Math.max(4, event.clientY - rect.top - 48) + 'px';
        }
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).select('.node-bg')
          .attr('fill', d.constraint_warnings && d.constraint_warnings.length ? '#1a0f0e' : '#0f1520');
        const tip = document.getElementById('node-tooltip');
        if (tip) tip.classList.add('hidden');
      });

    svg.on('click', () => {
      zoomGroup.selectAll('.node-bg').attr('stroke-width', 1.5);
      zoomGroup.selectAll('.node-shadow').attr('stroke', 'none');
    });

    requestAnimationFrame(() => {
      try {
        zoom = d3.zoom().scaleExtent([0.15, 3])
          .on('zoom', event => { zoomGroup.attr('transform', event.transform); });
        svg.call(zoom);
      } catch (_) { zoom = null; }
      fitAndCenter();
    });

    container._fitView = fitAndCenter;
    container._svg = svg;
  }

  function fitView(container) {
    if (container._fitView) container._fitView();
  }

  return { renderGraph, fitView, ACTION_COLORS };
})();
