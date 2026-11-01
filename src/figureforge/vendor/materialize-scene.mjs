import { expandStructuredNodes } from './reconstruction-pipeline.mjs';
import { extractEditableNodes } from './reconstruction-core.mjs';
import { parseEditablePath } from './editable-native.mjs';

function sceneNumber(v, fallback){
  const n=Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function materializeEditableScene(raw,W,H){
  const rawNodes=expandStructuredNodes(extractEditableNodes(raw));
  if(rawNodes.length>5000) throw new Error('Too many editable objects.');
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,sceneNumber(v,lo)));
  const cleanColor=(v,fallback)=>{
    if(v&&typeof v==='object')v=v.color??v.value??v.stops?.[0]?.color;
    const value=String(v==null?'':v).trim();
    if(/^[a-f0-9]{6}$/i.test(value)) return '#'+value;
    if(!value || value==='none' || value==='transparent') return value||fallback;
    if(CSS.supports('color',value)){
      const c=document.createElement('canvas');c.width=c.height=1;
      const ctx=c.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
      if(ctx.getImageData(0,0,1,1).data[3]===0)return 'transparent';
      return '#'+Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
    }
    throw new Error('Invalid scene color: '+value.slice(0,80));
  };
  const pick=(o,keys,fallback)=>{
    for(const k of keys){
      if(o[k]!==undefined && o[k]!==null && o[k]!=='') return o[k];
    }
    return fallback;
  };
  const out=[];
  rawNodes.forEach(function(n,i){
    if(!n || typeof n!=='object') return;
    let type=String(pick(n,['type','kind','shape','nodeType'],'')).toLowerCase().replace(/[\s_-]+/g,'');
    const sourceType=type;
    if(!type && (n.text!=null || n.content!=null || n.label!=null)) type='text';
    const aliases={
      rectangle:'rect',roundedrectangle:'rect',roundrect:'rect',box:'rect',group:'rect',panel:'rect',container:'rect',
      circle:'ellipse',oval:'ellipse',polygon:'polyline',
      arrow:'line',connector:'line',segment:'line',
      label:'text',caption:'text',
      bitmap:'image',photo:'image',raster:'image'
    };
    type=aliases[type]||type;
    const lineStart=n.start||n.from||{};
    const lineEnd=n.end||n.to||{};
    let xRaw=type==='line' ? pick(n,['x','x1','startX','fromX'],pick(lineStart,['x'],null)) : pick(n,['x','left','cx'],null);
    let yRaw=type==='line' ? pick(n,['y','y1','startY','fromY'],pick(lineStart,['y'],null)) : pick(n,['y','top','cy'],null);
    // Vision APIs commonly describe circles by their centre and radius.
    // Convert that convention to the bounding box used by every exporter.
    const centreX=pick(n,['cx','centerX'],null), centreY=pick(n,['cy','centerY'],null);
    const radiusX=sourceType==='circle' ? pick(n,['r','radius'],null) : pick(n,['rx'],null);
    const radiusY=sourceType==='circle' ? radiusX : pick(n,['ry'],null);
    const centredEllipse=type==='ellipse' && centreX!==null && centreY!==null &&
      radiusX!==null && radiusY!==null &&
      pick(n,['x','left','w','width'],null)===null &&
      pick(n,['y','top','h','height'],null)===null;
    if(centredEllipse){
      xRaw=sceneNumber(centreX,0)-sceneNumber(radiusX,0);
      yRaw=sceneNumber(centreY,0)-sceneNumber(radiusY,0);
    }
    // A missing position must never silently become the tile origin. That
    // produced hundreds of spurious diagonals in real Ark vision output.
    if((xRaw===null || yRaw===null) && type!=='polyline' && type!=='path') return;
    const right=pick(n,['right'],null);
    const bottom=pick(n,['bottom'],null);
    const estimatedTextWidth=type==='text' ? Math.max(1,
      sceneNumber(pick(n,['fontSize','font_size','size'],18),18)*0.57*
      String(pick(n,['text','content','label','value'],'')).length) : 1;
    const wRaw=centredEllipse ? 2*sceneNumber(radiusX,0) : pick(n,['w','width'],right!=null?sceneNumber(right,0)-sceneNumber(xRaw,0):estimatedTextWidth);
    const hRaw=centredEllipse ? 2*sceneNumber(radiusY,0) : pick(n,['h','height'],bottom!=null?sceneNumber(bottom,0)-sceneNumber(yRaw,0):
      (type==='text'?sceneNumber(pick(n,['fontSize','font_size','size'],18),18)*1.2:1));
    // Text can legitimately start outside a tile and continue in the next.
    // Clamping it to zero changed both its anchor and seam-stitching geometry.
    const x=type==='text'?clamp(xRaw??0,-W,W):clamp(xRaw??0,0,W);
    const y=type==='text'?clamp(yRaw??0,-H,H):clamp(yRaw??0,0,H);
    const w=type==='text'?clamp(wRaw,1,2*W):clamp(wRaw,1,Math.max(1,W-x));
    const h=type==='text'?clamp(hRaw,1,2*H):clamp(hRaw,1,Math.max(1,H-y));
    const rawFill=pick(n,['fill','fillColor','background'],'');
    const rawGradient=n.gradient||(rawFill&&typeof rawFill==='object'&&Array.isArray(rawFill.stops)?rawFill:undefined);
    const gradient=rawGradient?{...rawGradient,stops:(rawGradient.stops||[]).map(s=>({...s,color:cleanColor(s.color,'#ffffff')}))}:undefined;
    const base={
      id:String(n.id||('v'+i)),
      x,y,w,h,version:Number(n.version)||0,parentId:n.parentId,owner:n.owner,sourceItemId:typeof n.sourceItemId==='string'?n.sourceItemId:undefined,gradient,cellBounds:n.cellBounds,
      fill:cleanColor(rawFill,'none'),
      stroke:cleanColor(pick(n,['stroke','strokeColor','borderColor'],''),type==='line'?'#334155':'none'),
      strokeWidth:clamp(pick(n,['strokeWidth','lineWidth','borderWidth'],1),0,12),
      rotation:clamp(pick(n,['rotation','angle','rotate'],0),-360,360),
      dash:Array.isArray(n.dash||n.dashed||n.strokeDasharray) ? [...(n.dash||n.dashed||n.strokeDasharray)] : (n.dash||n.dashed||n.strokeDasharray||false)
    };
    if(type==='rect') out.push(Object.assign(base,{
      type:'rect',
      radius:clamp(pick(n,['radius','cornerRadius','r','rx','ry'],0),0,Math.min(w,h)/2)
    }));
    else if(type==='ellipse') out.push(Object.assign(base,{type:'ellipse'}));
    else if(type==='line'){
      const endX=pick(n,['x2','endX','toX','right'],pick(lineEnd,['x'],
        n.w!=null||n.width!=null ? sceneNumber(xRaw,0)+sceneNumber(pick(n,['w','width'],0),0) : null));
      const endY=pick(n,['y2','endY','toY','bottom'],pick(lineEnd,['y'],
        n.h!=null||n.height!=null ? sceneNumber(yRaw,0)+sceneNumber(pick(n,['h','height'],0),0) : null));
      if(endX===null || endY===null) return;
      const x2=clamp(endX,0,W), y2=clamp(endY,0,H);
      if(Math.hypot(x2-x,y2-y)<0.5) return;
      out.push(Object.assign(base,{
        type:'line',x2,y2,
        arrow:!!(n.arrow||n.arrowEnd||n.markerEnd||n.arrowhead),arrowStart:!!(n.arrowStart||n.markerStart)
      }));
    }
    else if(type==='polyline' && pick(n,['points','vertices'],'')){
      const vertices=pick(n,['points','vertices'],[]);
      const points=Array.isArray(vertices) ? vertices.map(p=>Array.isArray(p)?p.join(','):(p&&typeof p==='object'?p.x+','+p.y:String(p))).join(' ') : String(vertices);
      out.push(Object.assign(base,{type:'polyline',points,arrow:!!(n.arrow||n.arrowEnd||n.markerEnd||n.arrowhead),arrowStart:!!(n.arrowStart||n.markerStart),closed:!!(n.closed||n.isClosed||String(n.type).toLowerCase()==='polygon')}));
    }
    else if(type==='path' && pick(n,['d','path'],'')){
      const d=String(pick(n,['d','path'],''));
      if(parseEditablePath(d).length) out.push(Object.assign(base,{type:'path',d,arrow:!!(n.arrow||n.arrowEnd||n.markerEnd||n.arrowhead),arrowStart:!!(n.arrowStart||n.markerStart)}));
    }
    else if(type==='text' && String(pick(n,['text','content','label','value'],'')).trim()){
      const label=String(pick(n,['text','content','label','value'],'')).replace(/\r\n?/g,'\n').trim().slice(0,5000);
      // Native-resolution recognition already reports the intended text size.
      // Glyph bounds can be narrower/shorter than the font em; do not shrink it.
      const fontSize=clamp(pick(n,['fontSize','font_size','size'],18),6,Math.max(W,H));
      out.push(Object.assign(base,{
        type:'text',
        text:label,
        fill:cleanColor(pick(n,['fill','fillColor','color','textColor'],'#111827'),'#111827'),
        fontSize,
        fontFamily:pick(n,['fontFamily','font','family'],'Arial, Helvetica, sans-serif'),
        bold:!!(n.bold||n.fontWeight==='bold'||Number(n.fontWeight)>=600),
        italic:!!(n.italic||n.fontStyle==='italic'),
        anchor:['middle','center'].includes(n.anchor||n.textAlign)?'middle':['end','right'].includes(n.anchor||n.textAlign)?'end':'start',
        baseline:n.baseline||'auto',
        rotation:clamp(pick(n,['rotation','angle','rotate'],0),-360,360),
        textPath:(()=>{const v=n.textPath;if(!v)return undefined;const spec=typeof v==='string'?{d:v}:v;
          return spec&&parseEditablePath(spec.d).length?{d:String(spec.d),...(spec.startOffset==null?{}:{startOffset:sceneNumber(spec.startOffset,0)})}:undefined;})()
      }));
    }
    else if(type==='image') out.push(Object.assign(base,{
      type:'image',
      href:''
    }));
  });
  return {
    schema:'figureforge.scene.v4',
    regions:Array.isArray(raw.regions)?raw.regions:[],
    canvas:{width:W,height:H,w:W,h:H},
    nodes:out,
    counts:{
      total:out.length,
      text:out.filter(n=>n.type==='text').length,
      shapes:out.filter(n=>n.type!=='text'&&n.type!=='image').length,
      images:out.filter(n=>n.type==='image').length
    }
  };
}
