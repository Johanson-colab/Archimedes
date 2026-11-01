import { expandEditableTextPaths, editableShapeFrame } from './editable-native.mjs';
import { layoutEditableText } from './editable-text-layout.mjs';
const EXPORT_CANVAS = { w: 1600, h: 900 };
const escapeSvgAttr = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const xmlEscape = escapeSvgAttr;
function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Image decode failed.')); img.src = src; }); }
export function sceneToSvgString(scene){
  scene=expandEditableTextPaths(scene);
  const raw = scene.canvas || {};
  const W = Number(raw.width || raw.w || EXPORT_CANVAS.w), H = Number(raw.height || raw.h || EXPORT_CANVAS.h);
  const color = function(v, fallback){
    const s = String(v == null ? '' : v).trim();
    if(/^[a-f0-9]{6}$/i.test(s)) return '#'+s;
    if(!s || s === 'none' || s === 'transparent') return s || (fallback || 'none');
    return (/^#[a-f0-9]{3,8}$/i.test(s) || /^[a-z]+$/i.test(s)) ? s : (fallback || 'none');
  };
  const num = function(v, d){ const n = Number(v); return Number.isFinite(n) ? n : (d || 0); };
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">',
    '<defs><marker id="ff-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#334155"/></marker></defs>',
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>'];
  (scene.nodes || []).forEach(function(n, i){
    if(n.export === false) return;
    const id = escapeSvgAttr(n.id || ('n' + i));
    const x=num(n.x), y=num(n.y), w=Math.max(0,num(n.w)), h=Math.max(0,num(n.h));
    const stroke = color(n.stroke, 'none');let fill = color(n.fill, 'none');
    if(n.gradient?.stops?.length>=2){const a=Number(n.gradient.angle||0)*Math.PI/180,dx=Math.cos(a)*50,dy=Math.sin(a)*50;
      parts.push('<defs><linearGradient id="grad'+i+'" x1="'+(50-dx)+'%" y1="'+(50-dy)+'%" x2="'+(50+dx)+'%" y2="'+(50+dy)+'%">'+n.gradient.stops.map(s=>'<stop offset="'+Math.max(0,Math.min(1,Number(s.offset)))*100+'%" stop-color="'+escapeSvgAttr(s.color)+'"/>').join('')+'</linearGradient></defs>');fill='url(#grad'+i+')';}
    if(n.arrow)parts.push('<defs><marker id="arrow'+i+'" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="'+stroke+'"/></marker></defs>');
    if(n.arrowStart)parts.push('<defs><marker id="arrowStart'+i+'" markerWidth="8" markerHeight="8" refX="0" refY="4" orient="auto"><path d="M8 0L0 4L8 8Z" fill="'+stroke+'"/></marker></defs>');
    const markers=(n.arrow?' marker-end="url(#arrow'+i+')"':'')+(n.arrowStart?' marker-start="url(#arrowStart'+i+')"':'');
    const sw = Math.max(0,num(n.strokeWidth,1));
    const rawDash = n.dash || n.dashed || n.strokeDasharray;
    const dashValues = Array.isArray(rawDash) ? rawDash : typeof rawDash === 'string' ? rawDash.trim().split(/[\s,]+/).map(Number) : null;
    const dash = dashValues?.length && dashValues.every(v=>typeof v==='number' && Number.isFinite(v) && v>=0) && dashValues.some(v=>v>0)
      ? ' stroke-dasharray="'+dashValues.join(' ')+'"' : rawDash===true ? ' stroke-dasharray="8 6"' : '';
    const frame=n.type!=='text'&&num(n.rotation)?editableShapeFrame(n):null;
    if(frame)parts.push('<g transform="rotate('+num(n.rotation)+' '+(frame.x+frame.w/2)+' '+(frame.y+frame.h/2)+')">');
    if(n.type === 'image'){
      parts.push('<image id="'+id+'" data-role="image" data-editable="true" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none" href="'+escapeSvgAttr(n.href||'')+'" xlink:href="'+escapeSvgAttr(n.href||'')+'"/>');
    } else if(n.type === 'text'){
      const anchor = n.anchor==='middle' ? 'middle' : (n.anchor==='end' ? 'end' : 'start');
      const tx = anchor==='middle' ? x+w/2 : anchor==='end' ? x+w : x;
      const fitted=scene.svgSource ? {text:String(n.text||''),fontSize:Math.max(1,num(n.fontSize,16))} : layoutEditableText(n.text,{...n,fontSize:num(n.fontSize,16)});
      const fs=fitted.fontSize, lines=fitted.text.split(/\r?\n/), lineH=fs*1.14;
      const measuredBaseline=scene.svgSource&&Number.isFinite(Number(n.baselineRatio));
      const ty=measuredBaseline ? y+Number(n.baselineRatio)*h :
        (n.verticalAlign==='middle' ? y+(h-lines.length*lineH)/2+fs*.86 : y+fs*.84);
      const rotation=Number.isFinite(Number(n.rotation))&&Number(n.rotation)!==0?' transform="rotate('+num(n.rotation)+' '+(x+w/2)+' '+(y+h/2)+')"':'';
      parts.push('<text id="'+id+'" data-role="label" data-editable="true" x="'+tx+'" y="'+ty+'" text-anchor="'+anchor+'"'+rotation+' font-family="'+escapeSvgAttr(n.fontFamily||'Arial, Helvetica, sans-serif')+'" font-size="'+fs+'" fill="'+color(n.fill,'#111827')+'"'+(n.bold?' font-weight="bold"':'')+(n.italic?' font-style="italic"':'')+'>'+lines.map((line,j)=>'<tspan x="'+tx+'" dy="'+(j?lineH:0)+'">'+xmlEscape(line)+'</tspan>').join('')+'</text>');
    } else if(n.type === 'rect'){
      parts.push('<rect id="'+id+'" data-editable="true" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+Math.max(0,num(n.radius))+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+dash+'/>');
    } else if(n.type === 'ellipse'){
      parts.push('<ellipse id="'+id+'" data-editable="true" cx="'+(x+w/2)+'" cy="'+(y+h/2)+'" rx="'+(w/2)+'" ry="'+(h/2)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+dash+'/>');
    } else if(n.type === 'line'){
      parts.push('<line id="'+id+'" data-editable="true" x1="'+x+'" y1="'+y+'" x2="'+num(n.x2,x+w)+'" y2="'+num(n.y2,y+h)+'" stroke="'+color(n.stroke,'#334155')+'" stroke-width="'+sw+'" fill="none"'+markers+dash+'/>');
    } else if(n.type === 'polyline'){
      parts.push('<'+(n.closed?'polygon':'polyline')+' id="'+id+'" data-editable="true" points="'+escapeSvgAttr(n.points||'')+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+markers+dash+'/>');
    } else if(n.type === 'path'){
      parts.push('<path id="'+id+'" data-editable="true" d="'+escapeSvgAttr(n.d||'')+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"'+markers+dash+'/>');
    }
    if(frame)parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('\n');
}

// Render the actual editable SVG before accepting it. This measures visible
// error against the bitmap, not merely whether the JSON has valid geometry.
export async function compareEditableRender(sourceCanvas,scene,region){
  const view=region||{x:0,y:0,w:sourceCanvas.width,h:sourceCanvas.height};
  const scale=Math.min(1,(region?1600:720)/Math.max(view.w,view.h));
  const renderW=Math.max(1,Math.round(view.w*scale));
  const renderH=Math.max(1,Math.round(view.h*scale));
  const ref=document.createElement('canvas'),out=document.createElement('canvas');
  ref.width=out.width=renderW; ref.height=out.height=renderH;
  const rc=ref.getContext('2d',{willReadFrequently:true});
  const oc=out.getContext('2d',{willReadFrequently:true});
  rc.fillStyle=oc.fillStyle='#ffffff';
  rc.fillRect(0,0,renderW,renderH); oc.fillRect(0,0,renderW,renderH);
  rc.drawImage(sourceCanvas,view.x,view.y,view.w,view.h,0,0,renderW,renderH);
  const raster=typeof scene==='string'&&/^data:image\/(png|jpeg|webp);/i.test(scene);
  const url=raster?scene:URL.createObjectURL(new Blob([typeof scene==='string'?scene:sceneToSvgString(scene)],{type:'image/svg+xml'}));
  try{oc.drawImage(await loadImage(url),-view.x*scale,-view.y*scale,sourceCanvas.width*scale,sourceCanvas.height*scale);}
  finally{if(!raster)URL.revokeObjectURL(url);}
  // Overlapping model crops are trimmed to their non-overlapping cores during
  // export. Score only that retained area when ranking repair candidates.
  const x0=0,y0=0,x1=renderW,y1=renderH;
  const w=x1-x0,h=y1-y0;
  const a=rc.getImageData(x0,y0,w,h).data,b=oc.getImageData(x0,y0,w,h).data;
  const pixels=w*h,sourceMask=new Uint8Array(pixels),renderMask=new Uint8Array(pixels);
  const sourceDark=new Uint8Array(pixels),renderDark=new Uint8Array(pixels);
  const sourceEdge=new Uint8Array(pixels),renderEdge=new Uint8Array(pixels);
  const sourceGray=new Uint8Array(pixels),renderGray=new Uint8Array(pixels);
  let sourceInkPixels=0,sourceDarkPixels=0,unionPixels=0,colorError=0;
  for(let p=0;p<pixels;p++){
    const i=p*4;
    sourceGray[p]=Math.round(.299*a[i]+.587*a[i+1]+.114*a[i+2]);
    renderGray[p]=Math.round(.299*b[i]+.587*b[i+1]+.114*b[i+2]);
    sourceMask[p]=Math.min(a[i],a[i+1],a[i+2])<242?1:0;
    renderMask[p]=Math.min(b[i],b[i+1],b[i+2])<242?1:0;
    // Pale panel fills must not count as evidence that labels and fine strokes survived.
    sourceDark[p]=sourceGray[p]<185?1:0;
    renderDark[p]=renderGray[p]<185?1:0;
    sourceInkPixels+=sourceMask[p];
    sourceDarkPixels+=sourceDark[p];
    if(sourceMask[p]||renderMask[p]){
      unionPixels++;
      colorError+=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/(3*255);
    }
  }
  // A white page used to dominate the score. Compare ink coverage and line
  // placement instead; allow a two-pixel rasterization tolerance for fonts.
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){
    const p=y*w+x;
    sourceEdge[p]=(Math.abs(sourceGray[p-1]-sourceGray[p+1])>36||
      Math.abs(sourceGray[p-w]-sourceGray[p+w])>36)?1:0;
    renderEdge[p]=(Math.abs(renderGray[p-1]-renderGray[p+1])>36||
      Math.abs(renderGray[p-w]-renderGray[p+w])>36)?1:0;
  }
  const near=(mask,p,radius)=>{
    const x=p%w,y=Math.floor(p/w);
    for(let dy=-radius;dy<=radius;dy++){
      const yy=y+dy;if(yy<0||yy>=h) continue;
      for(let dx=-radius;dx<=radius;dx++){
        const xx=x+dx;if(xx>=0&&xx<w&&mask[yy*w+xx]) return true;
      }
    }
    return false;
  };
  const overlap=(left,right,radius)=>{
    let count=0,matched=0;
    for(let p=0;p<pixels;p++) if(left[p]){count++;if(near(right,p,radius)) matched++;}
    return count?matched/count:1;
  };
  const harmonic=(a,b)=>a+b?2*a*b/(a+b):0;
  const inkF1=harmonic(overlap(sourceMask,renderMask,1),overlap(renderMask,sourceMask,1));
  const edgeF1=harmonic(overlap(sourceEdge,renderEdge,2),overlap(renderEdge,sourceEdge,2));
  const darkRecall=overlap(sourceDark,renderDark,1);
  const darkF1=harmonic(darkRecall,overlap(renderDark,sourceDark,1));
  // Inspect spatial coverage as well as global averages. A missing caption or
  // panel cannot be hidden by a large, correctly colored background elsewhere.
  // Finer cells expose a missed small icon or arrow that a whole panel can hide.
  const columns=10,rows=8,cellSource=new Uint32Array(columns*rows),cellMatched=new Uint32Array(columns*rows);
  for(let p=0;p<pixels;p++) if(sourceDark[p]){
    const x=p%w,y=Math.floor(p/w);
    const cell=Math.min(rows-1,Math.floor(y*rows/h))*columns+
      Math.min(columns-1,Math.floor(x*columns/w));
    cellSource[cell]++;
    if(near(renderDark,p,1)) cellMatched[cell]++;
  }
  const cellRecalls=[],weakRegions=[];
  for(let cell=0;cell<cellSource.length;cell++){
    if(cellSource[cell]>=Math.max(12,Math.round(pixels/(columns*rows)*.002))){
      const recall=cellMatched[cell]/cellSource[cell];
      cellRecalls.push(recall);
      weakRegions.push({x:Math.round(view.x+(cell%columns)*w/columns/scale),
        y:Math.round(view.y+Math.floor(cell/columns)*h/rows/scale),
        w:Math.round(w/columns/scale),h:Math.round(h/rows/scale),
        recall:Math.round(recall*1000)/1000});
    }
  }
  cellRecalls.sort((a,b)=>a-b);
  weakRegions.sort((a,b)=>a.recall-b.recall);
  const localRecall=cellRecalls.length
    ? cellRecalls[Math.min(cellRecalls.length-1,Math.floor(cellRecalls.length*.2))]
    : darkRecall;
  const colorSimilarity=1-colorError/Math.max(1,unionPixels);
  const rawScore=.15*inkF1+.25*edgeF1+.45*darkF1+.15*colorSimilarity;
  const score=Math.max(0,Math.min(1,rawScore,.3+.7*localRecall));
  return {score,inkF1,edgeF1,darkF1,darkRecall,localRecall,colorSimilarity,
    inkFraction:sourceInkPixels/pixels,darkFraction:sourceDarkPixels/pixels,
    weakRegions:weakRegions.slice(0,5),preview:out.toDataURL('image/png')};
}
