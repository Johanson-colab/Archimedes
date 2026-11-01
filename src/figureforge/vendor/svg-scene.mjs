import { parseEditablePath } from './editable-native.mjs';

const EXPORT_CANVAS = {w:1600, h:900};
// 1600 canvas units -> 10in wide figure, centred on a 13.333x7.5in 16:9 slide.
const PT_PER_UNIT = 0.45;

function parseTransformList(value){
  const ops = [];
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m;
  while((m = re.exec(value||''))){
    const nums = m[2].split(/[\s,]+/).filter(s=>s!=='').map(Number);
    if(nums.some(n=>!Number.isFinite(n))) continue;
    ops.push({fn:m[1].toLowerCase(), a:nums});
  }
  return ops;
}

function multiplyMatrix(m1, m2){   // m1 * m2, both [a,b,c,d,e,f]
  return [
    m1[0]*m2[0]+m1[2]*m2[1], m1[1]*m2[0]+m1[3]*m2[1],
    m1[0]*m2[2]+m1[2]*m2[3], m1[1]*m2[2]+m1[3]*m2[3],
    m1[0]*m2[4]+m1[2]*m2[5]+m1[4], m1[1]*m2[4]+m1[3]*m2[5]+m1[5],
  ];
}

function opsToMatrix(ops){
  let m = [1,0,0,1,0,0];
  ops.forEach(function(op){
    const a = op.a;
    let next = null;
    if(op.fn==='translate') next = [1,0,0,1, a[0]||0, a[1]||0];
    else if(op.fn==='scale'){ const sx=a[0]==null?1:a[0], sy=a[1]==null?sx:a[1]; next=[sx,0,0,sy,0,0]; }
    else if(op.fn==='rotate'){
      const t = (a[0]||0)*Math.PI/180, cos=Math.cos(t), sin=Math.sin(t);
      if(a.length>=3){
        const cx=a[1], cy=a[2];
        next = multiplyMatrix(multiplyMatrix([1,0,0,1,cx,cy],[cos,sin,-sin,cos,0,0]),[1,0,0,1,-cx,-cy]);
      } else next = [cos,sin,-sin,cos,0,0];
    }
    else if(op.fn==='matrix' && a.length>=6) next = a.slice(0,6);
    else if(op.fn==='skewx') next = [1,0,Math.tan((a[0]||0)*Math.PI/180),1,0,0];
    else if(op.fn==='skewy') next = [1,Math.tan((a[0]||0)*Math.PI/180),0,1,0,0];
    if(next) m = multiplyMatrix(m, next);
  });
  return m;
}

function svgColorToHex(value){
  if(!value) return null;
  let v = String(value).trim().toLowerCase();
  if(v==='none' || v==='transparent') return null;
  if(v==='currentcolor') return '000000';
  if(/^#[0-9a-f]{3}$/.test(v)) return v.slice(1).split('').map(c=>c+c).join('').toUpperCase();
  if(/^#[0-9a-f]{6}$/.test(v)) return v.slice(1).toUpperCase();
  if(/^#[0-9a-f]{8}$/.test(v)) return v.slice(1,7).toUpperCase();   // drop alpha
  const rgb = v.match(/^rgba?\(([^)]+)\)$/);
  if(rgb){
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if(parts.length>=3 && parts.slice(0,3).every(n=>Number.isFinite(n))){
      if(parts.length>=4 && parts[3]===0) return null;
      return parts.slice(0,3).map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('').toUpperCase();
    }
    return null;
  }
  const named = {black:'000000',white:'FFFFFF',red:'FF0000',green:'008000',blue:'0000FF',gray:'808080',grey:'808080',silver:'C0C0C0',orange:'FFA500',yellow:'FFFF00',purple:'800080',navy:'000080',teal:'008080',brown:'A52A2A',lightgray:'D3D3D3',lightgrey:'D3D3D3',darkgray:'A9A9A9'};
  return named[v] || null;
}

function styleOf(el){
  let s = {};
  try{ s = getComputedStyle(el); }catch(_){ s = el.style || {}; }
  const pick = name => {
    const inline = el.style?.getPropertyValue(name) || s?.getPropertyValue?.(name) || s?.[name];
    if(inline) return inline;
    const attr = el.getAttribute(name);
    return attr || null;
  };
  return {
    fill: pick('fill'),
    stroke: pick('stroke'),
    strokeWidth: pick('stroke-width'),
    dash: pick('stroke-dasharray'),
    markerStart: pick('marker-start'),
    markerEnd: pick('marker-end'),
    opacity: pick('opacity'),
    fillOpacity: pick('fill-opacity'),
    strokeOpacity: pick('stroke-opacity'),
    fontFamily: pick('font-family'),
    fontSize: pick('font-size'),
    fontWeight: pick('font-weight'),
    fontStyle: pick('font-style'),
    textAnchor: pick('text-anchor'),
    dominantBaseline: pick('dominant-baseline'),
  };
}

function connectorStyle(st){
  const hasMarker = value => !!value && String(value).trim().toLowerCase() !== 'none';
  const rawDash = String(st.dash || '').trim();
  const dash = rawDash && rawDash !== 'none' ? rawDash.split(/[\s,]+/).map(v=>parseFloat(v)) : [];
  return {arrowStart:hasMarker(st.markerStart), arrow:hasMarker(st.markerEnd),
    ...(dash.length && dash.every(v=>Number.isFinite(v)&&v>=0) && dash.some(v=>v>0) ? {dash} : {})};
}

export function parseSvgScene(svg){
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if(doc.querySelector('parsererror')) throw new Error('scene: SVG could not be parsed');
  const root = doc.documentElement;
  const vbRaw = (root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const vb = (vbRaw.length===4 && vbRaw.every(Number.isFinite) && vbRaw[2]>0 && vbRaw[3]>0)
    ? vbRaw
    : [0,0, parseFloat(root.getAttribute('width'))||EXPORT_CANVAS.w, parseFloat(root.getAttribute('height'))||EXPORT_CANVAS.h];

  // A hidden host gives getBBox exact text metrics for the real font and size.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden','true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:'+vb[2]+'px;height:'+vb[3]+'px;overflow:hidden;pointer-events:none;';
  const live = document.importNode(root, true);
  live.setAttribute('width', vb[2]); live.setAttribute('height', vb[3]);
  host.appendChild(live);
  document.body.appendChild(host);

  const nodes = [];
  const warnings = [];

  function applyMatrix(m, x, y){
    return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] };
  }
  const dashOf = st => !!st.strokeDasharray && st.strokeDasharray !== 'none' && st.strokeDasharray !== '0';
  const arrowOf = st => !!st.markerEnd && st.markerEnd !== 'none';
  const numberPair = p => `${+p.x.toFixed(5)} ${+p.y.toFixed(5)}`;
  function transformedPath(d, m){
    return parseEditablePath(d).map(path=>{
      let result = 'M '+numberPair(applyMatrix(m,path.start.x,path.start.y));
      path.commands.forEach(command=>{
        if(command.type==='cubic'){
          result += ' C '+numberPair(applyMatrix(m,command.c1.x,command.c1.y))+
            ' '+numberPair(applyMatrix(m,command.c2.x,command.c2.y))+
            ' '+numberPair(applyMatrix(m,command.end.x,command.end.y));
        } else result += ' L '+numberPair(applyMatrix(m,command.end.x,command.end.y));
      });
      return result+(path.closed?' Z':'');
    }).join(' ');
  }
  function transformedPoints(raw, m){
    const values=String(raw||'').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
    const points=[];
    for(let i=0;i+1<values.length;i+=2) points.push(numberPair(applyMatrix(m,Number(values[i]),Number(values[i+1]))));
    return points.join(' ');
  }

  function walk(el, matrix, useStack=new Set()){
    const tag = (el.tagName||'').toLowerCase();
    const own = parseTransformList(el.getAttribute('transform'));
    const m = own.length ? multiplyMatrix(matrix, opsToMatrix(own)) : matrix;
    const st = styleOf(el);
    if (/^url\(/i.test(st.fill || '') || /^url\(/i.test(st.stroke || '')) {
      const warning = 'Gradient or pattern fills may differ in editable exports; use SVG to retain the original.';
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    if (el.getAttribute('clip-path') || el.getAttribute('mask')) {
      const warning = 'Clipping or masks may differ in editable exports; use SVG to retain the original.';
      if (!warnings.includes(warning)) warnings.push(warning);
    }

    if(tag==='defs' || tag==='style' || tag==='title' || tag==='desc' || tag==='metadata') return;
    if(tag==='use'){
      const href=el.getAttribute('href')||el.getAttribute('xlink:href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
      const match=href.match(/^#([^\s]+)$/);
      if(!match){warnings.push('external or missing <use> reference was skipped');return;}
      let refId; try{refId=decodeURIComponent(match[1]);}catch(_){refId=match[1];}
      if(useStack.has(refId)){warnings.push('cyclic <use> reference was skipped: '+refId);return;}
      const target=[...live.querySelectorAll('[id]')].find(node=>node.id===refId);
      if(!target){warnings.push('unresolved <use> reference was skipped: '+refId);return;}
      const num=(name,fallback)=>{const v=parseFloat(el.getAttribute(name));return Number.isFinite(v)?v:fallback;};
      let instanceMatrix=multiplyMatrix(m,[1,0,0,1,num('x',0),num('y',0)]);
      const nextStack=new Set(useStack);nextStack.add(refId);
      const instance=document.createElementNS('http://www.w3.org/2000/svg','g');
      ['color','fill','stroke','stroke-width','opacity','fill-opacity','stroke-opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline'].forEach(name=>{const value=el.getAttribute(name);if(value!=null)instance.setAttribute(name,value);});
      if(el.getAttribute('style'))instance.setAttribute('style',el.getAttribute('style'));
      const clone=target.cloneNode(true);instance.appendChild(clone);live.appendChild(instance);
      try{
        const targetTag=(target.tagName||'').toLowerCase();
        if(targetTag==='symbol'||targetTag==='svg'){
          const view=(target.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
          const width=num('width',view.length===4?view[2]:0),height=num('height',view.length===4?view[3]:0);
          if(view.length===4&&view.every(Number.isFinite)&&view[2]>0&&view[3]>0&&width>0&&height>0){
            const par=(target.getAttribute('preserveAspectRatio')||'xMidYMid meet').trim().split(/\s+/),mode=par[0]==='defer'?par[1]:par[0];
            let sx=width/view[2],sy=height/view[3],ox=0,oy=0;
            if(mode!=='none'){const scale=(par.includes('slice')?Math.max:Math.min)(sx,sy);sx=sy=scale;const align=mode||'xMidYMid';ox=align.includes('xMax')?width-view[2]*sx:align.includes('xMid')?(width-view[2]*sx)/2:0;oy=align.includes('YMax')?height-view[3]*sy:align.includes('YMid')?(height-view[3]*sy)/2:0;}
            instanceMatrix=multiplyMatrix(instanceMatrix,[sx,0,0,sy,ox-view[0]*sx,oy-view[1]*sy]);
          }else if(targetTag==='symbol')warnings.push('symbol without a valid viewBox was skipped: '+refId);
        }
        if(targetTag==='symbol'||targetTag==='svg')[...clone.children].forEach(child=>walk(child,instanceMatrix,nextStack));else walk(clone,instanceMatrix,nextStack);
      }finally{instance.remove();}
      return;
    }

    if(tag==='g' || tag==='svg'){
      [...el.children].forEach(child=>walk(child, m));
      return;
    }

    const num = (name, fallback) => {
      const raw = el.getAttribute(name);
      if(raw==null) return fallback;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : fallback;
    };

    if(tag==='rect'){
      const x=num('x',0), y=num('y',0), w=num('width',0), h=num('height',0);
      if(w<=0 || h<=0) return;
      const center = applyMatrix(m, x+w/2, y+h/2);
      const scaledW = w*Math.hypot(m[0],m[1]), scaledH = h*Math.hypot(m[2],m[3]);
      if(Math.abs(m[0]*m[2]+m[1]*m[3])>1e-5) warnings.push('skewed rectangle was approximated by a rotated editable rectangle');
      const rot = Math.atan2(m[1], m[0]) * 180/Math.PI;
      const rx = (num('rx',0) || num('ry',0)) || 0;
      nodes.push({type:'rect', x:center.x-scaledW/2, y:center.y-scaledH/2, w:scaledW, h:scaledH, radius:rx,
        fill:svgColorToHex(st.fill), stroke:svgColorToHex(st.stroke),
        strokeWidth:parseFloat(st.strokeWidth)||0, dash:dashOf(st), rotation:Math.abs(rot)>0.01?rot:0});
      return;
    }

    if(tag==='circle' || tag==='ellipse'){
      const cx=num('cx',0), cy=num('cy',0);
      const rx = tag==='circle' ? num('r',0) : num('rx',0);
      const ry = tag==='circle' ? num('r',0) : num('ry',0);
      if(rx<=0 || ry<=0) return;
      const c = applyMatrix(m, cx, cy);
      const scaleX = Math.hypot(m[0], m[1]) || 1;
      const scaleY = Math.hypot(m[2], m[3]) || 1;
      nodes.push({type:'ellipse', x:c.x-rx*scaleX, y:c.y-ry*scaleY, w:rx*2*scaleX, h:ry*2*scaleY,
        fill:svgColorToHex(st.fill), stroke:svgColorToHex(st.stroke),
        strokeWidth:parseFloat(st.strokeWidth)||0, dash:dashOf(st)});
      return;
    }

    if(tag==='line'){
      const p1 = applyMatrix(m, num('x1',0), num('y1',0));
      const p2 = applyMatrix(m, num('x2',0), num('y2',0));
      nodes.push({type:'line', x:p1.x, y:p1.y, x2:p2.x, y2:p2.y,
        stroke:svgColorToHex(st.stroke), strokeWidth:parseFloat(st.strokeWidth)||1,
        dash:dashOf(st), arrow:arrowOf(st)});
      return;
    }

    if(tag==='polygon' || tag==='polyline' || tag==='path'){
      const d = el.getAttribute('d');
      const pts = el.getAttribute('points');
      let bbox = null;
      try{ bbox = el.getBBox(); }catch(_){ bbox = null; }
      if(bbox && (bbox.width>0 || bbox.height>0)){
        const corners = [applyMatrix(m,bbox.x,bbox.y), applyMatrix(m,bbox.x+bbox.width,bbox.y),
                         applyMatrix(m,bbox.x,bbox.y+bbox.height), applyMatrix(m,bbox.x+bbox.width,bbox.y+bbox.height)];
        const xs=corners.map(c=>c.x), ys=corners.map(c=>c.y);
        const parsed=tag==='path'?parseEditablePath(d):null;
        if(tag==='path' && parsed.length===1 && !parsed[0].closed && parsed[0].commands.length===1 && parsed[0].commands[0].type==='line'){
          const p1=applyMatrix(m,parsed[0].start.x,parsed[0].start.y);
          const p2=applyMatrix(m,parsed[0].commands[0].end.x,parsed[0].commands[0].end.y);
          nodes.push({type:'line',x:p1.x,y:p1.y,x2:p2.x,y2:p2.y,
            stroke:svgColorToHex(st.stroke),strokeWidth:parseFloat(st.strokeWidth)||1,
            dash:dashOf(st),arrow:arrowOf(st)});
          return;
        }
        nodes.push({type:tag==='path'?'path':'polyline',
          x:Math.min(...xs), y:Math.min(...ys),
          w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys),
          d:tag==='path'?transformedPath(d,m):null,
          points:tag==='path'?null:transformedPoints(pts,m),
          fill:svgColorToHex(st.fill), stroke:svgColorToHex(st.stroke),
          strokeWidth:parseFloat(st.strokeWidth)||1,
          dash:dashOf(st), arrow:arrowOf(st),
          closed: tag==='polygon'});
      } else warnings.push(tag+' element without measurable bounds was skipped');
      return;
    }

    if(tag==='image'){
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      const x=num('x',0), y=num('y',0), w=num('width',0), h=num('height',0);
      if(!href) return;
      const iw=w||vb[2], ih=h||vb[3];
      const corners=[applyMatrix(m,x,y),applyMatrix(m,x+iw,y),applyMatrix(m,x,y+ih),applyMatrix(m,x+iw,y+ih)];
      const xs=corners.map(p=>p.x), ys=corners.map(p=>p.y);
      if(Math.abs(m[1])>1e-6 || Math.abs(m[2])>1e-6)
        warnings.push('rotated or skewed image uses its transformed bounds');
      nodes.push({type:'image', x:Math.min(...xs), y:Math.min(...ys),
        w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys), href});
      return;
    }

    if(tag==='text'){
      // tspan children with their own x/y are separate lines; otherwise the whole
      // string is one label and the parent's position is authoritative.
      const kids = [...el.children].filter(c=>(c.tagName||'').toLowerCase()==='tspan');
      const positioned = kids.filter(k=>k.getAttribute('x')!=null || k.getAttribute('y')!=null);
      if(positioned.length && positioned.length===kids.length && kids.length>1){
        kids.forEach(k=>emitText(k, m, st, el));
        return;
      }
      emitText(el, m, st, el);
      return;
    }

    // Unknown element types: recurse so nothing nested is lost.
    if(el.children && el.children.length) [...el.children].forEach(child=>walk(child, m));
  }

  function emitText(el, matrix, inherited, styleSource){
    const text = (el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text) return;
    const st = Object.assign({}, inherited, styleOf(el));
    const base = styleSource || el;
    const xRaw = el.getAttribute('x')!=null ? parseFloat(el.getAttribute('x')) : parseFloat(base.getAttribute('x'));
    const yRaw = el.getAttribute('y')!=null ? parseFloat(el.getAttribute('y')) : parseFloat(base.getAttribute('y'));
    const x = Number.isFinite(xRaw) ? xRaw : 0;
    const y = Number.isFinite(yRaw) ? yRaw : 0;
    let fontSize = parseFloat(st.fontSize);
    if(!Number.isFinite(fontSize) || fontSize<=0) fontSize = 16;

    let box = null;
    try{ box = el.getBBox(); }catch(_){ box = null; }
    const anchor = (st.textAnchor||'start').toLowerCase();
    // getBBox includes text-anchor and the real ascender. SVG x/y is a
    // baseline point, while every editable exporter expects a box top-left.
    const fallbackWidth = text.length*fontSize*0.58;
    const sourceBox = box && box.width>0 && box.height>0 ? box : {
      x:x-(anchor==='middle'?fallbackWidth/2:anchor==='end'?fallbackWidth:0),
      y:y-fontSize*0.8, width:fallbackWidth, height:fontSize*1.25,
    };
    const center = applyMatrix(matrix, sourceBox.x+sourceBox.width/2, sourceBox.y+sourceBox.height/2);
    const scaleX = Math.hypot(matrix[0],matrix[1]) || 1;
    const scaleY = Math.hypot(matrix[2],matrix[3]) || 1;
    const width = sourceBox.width*scaleX, height = sourceBox.height*scaleY;
    const rotation = Math.atan2(matrix[1],matrix[0])*180/Math.PI;
    if(Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3])>1e-5)
      warnings.push('skewed text was approximated by a rotated editable text box');

    nodes.push({
      type:'text', text,
      x:center.x-width/2, y:center.y-height/2, w:width, h:height,
      fontSize: fontSize*scaleY,
      anchor:'start', svgAnchor:anchor,
      baselineRatio: (y-sourceBox.y)/Math.max(sourceBox.height,1),
      rotation: Math.abs(rotation)>0.01?rotation:0,
      fill: svgColorToHex(st.fill) || '000000',
      fontFamily: st.fontFamily || null,
      bold: String(st.fontWeight||'').match(/^(bold|[6-9]00)$/) ? true : false,
      italic: String(st.fontStyle||'')==='italic',
      role: el.getAttribute('data-role') || null,
    });
  }

  try{
    walk(live, [1,0,0,1,0,0]);
  } finally {
    if(host.parentNode) host.parentNode.removeChild(host);
  }

  return {
    schema:'figureforge.scene.v2',
    canvas:{x:vb[0], y:vb[1], width:vb[2], height:vb[3], viewBox:vb.join(' ')},
    nodes,
    counts:{total:nodes.length, text:nodes.filter(n=>n.type==='text').length,
            shapes:nodes.filter(n=>n.type!=='text'&&n.type!=='image').length,
            images:nodes.filter(n=>n.type==='image').length},
    warnings,
  };
}
