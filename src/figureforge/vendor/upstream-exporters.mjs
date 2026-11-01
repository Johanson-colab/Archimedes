// Extracted from Top-Conf FigureForge, commit 187901c. See LICENSE and NOTICE.md.
import {geometrySegments,expandEditableTextPaths} from "./editable-native.mjs";
const EXPORT_CANVAS={w:1200,h:675};
function xmlEscape(value){
  return String(value==null?'':value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
}
function exportColor(value, fallback){
  const s=String(value==null?'':value).trim();
  if(!s || s==='none' || s==='transparent') return fallback || 'none';
  return s.replace(/^#/,'');
}
function drawioColor(value, fallback){
  const c=exportColor(value,fallback);
  return c==='none' ? 'none' : '#'+c;
}
function encodeDrawioStencil(stencil){
  // draw.io's Graph.decompress expects URI-encoded XML in a raw DEFLATE
  // stream. Stored DEFLATE blocks keep this dependency-free in the browser.
  const source=new TextEncoder().encode(encodeURIComponent(stencil));
  const blocks=[];
  for(let offset=0;offset<source.length;){
    const count=Math.min(65535,source.length-offset);
    const block=new Uint8Array(5+count);
    block[0]=offset+count===source.length?1:0;
    block[1]=count&255; block[2]=count>>8;
    block[3]=~count&255; block[4]=(~count>>8)&255;
    block.set(source.subarray(offset,offset+count),5);
    blocks.push(block);
    offset+=count;
  }
  let binary='';
  for(const block of blocks){
    for(let offset=0;offset<block.length;offset+=8192)
      binary+=String.fromCharCode(...block.subarray(offset,offset+8192));
  }
  return btoa(binary);
}

/* ---------- draw.io ----------
   Emits real mxCell geometry, not an embedded picture, so every box and label is
   individually editable inside draw.io. This file can also be exported to VSDX
   from draw.io, which is the supported path to Visio. */
function sceneToDrawio(scene){
  scene=expandEditableTextPaths(scene);
  const rawCanvas = scene.canvas || {};
  const c = Object.assign({}, rawCanvas, {
    width: Number(rawCanvas.width || rawCanvas.w || EXPORT_CANVAS.w),
    height: Number(rawCanvas.height || rawCanvas.h || EXPORT_CANVAS.h),
  });
  const cells = [];
  let seq = 10;
  const nextId = ()=> 'ff' + (seq++);
  const xml = s => xmlEscape(s);

  scene.nodes.forEach(function(n){
    if(n.export===false) return;
    const id = nextId();
    if(n.type==='text'){
      const anchor = n.anchor==='middle' ? 'center' : (n.anchor==='end' ? 'right' : 'left');
      const style = 'text;html=1;strokeColor=none;fillColor=none;align='+anchor+';verticalAlign=top;spacing=0;'+
                    'fontSize='+Math.round(n.fontSize||16)+';fontColor='+drawioColor(n.fill,'000000')+
                    ';fontFamily='+xml(String(n.fontFamily||'Arial').replace(/[;=]/g,''))+
                    ';fontStyle='+((n.bold?1:0)+(n.italic?2:0))+
                    (Number.isFinite(Number(n.rotation))?';rotation='+Number(n.rotation).toFixed(3):'')+';whiteSpace=wrap;';
      const w = Math.max(n.w, 8), h = Math.max(n.h, (n.fontSize||16)*1.2, 8);
      const x = n.x;
      cells.push('<mxCell id="'+id+'" value="'+xml(n.text)+'" style="'+style+'" vertex="1" parent="1">'+
                 '<mxGeometry x="'+Math.round(x)+'" y="'+Math.round(n.y)+'" width="'+Math.round(w)+'" height="'+Math.round(h)+'" as="geometry"/></mxCell>');
      return;
    }
    if(n.type==='line'){
      const style = 'endArrow='+(n.arrow?'classic':'none')+';html=1;strokeColor='+drawioColor(n.stroke,scene.svgSource?'none':'000000')+';strokeWidth='+(n.strokeWidth||1)+';'+(n.dash?'dashed=1;':'');
      cells.push('<mxCell id="'+id+'" style="'+style+'" edge="1" parent="1">'+
                 '<mxGeometry relative="1" as="geometry"><mxPoint x="'+Math.round(n.x)+'" y="'+Math.round(n.y)+'" as="sourcePoint"/>'+
                 '<mxPoint x="'+Math.round(n.x2)+'" y="'+Math.round(n.y2)+'" as="targetPoint"/></mxGeometry></mxCell>');
      return;
    }
    if(n.type==='ellipse'){
      const style = 'ellipse;whiteSpace=wrap;html=1;fillColor='+drawioColor(n.fill,'none')+';strokeColor='+drawioColor(n.stroke,scene.svgSource?'none':'000000')+';strokeWidth='+(n.strokeWidth||1)+';'+(n.dash?'dashed=1;':'');
      cells.push('<mxCell id="'+id+'" style="'+style+'" vertex="1" parent="1">'+
                 '<mxGeometry x="'+Math.round(n.x)+'" y="'+Math.round(n.y)+'" width="'+Math.round(n.w)+'" height="'+Math.round(n.h)+'" as="geometry"/></mxCell>');
      return;
    }
    if(n.type==='rect'){
      // mxRectangleShape uses arcSize / 2 as the radius in absolute mode.
      // Preserve measured small/fractional corners instead of imposing a percentage floor.
      const radius=Math.max(0,Math.min(Number(n.radius)||0,n.w/2,n.h/2));
      const rounded = radius>0 ? 'rounded=1;absoluteArcSize=1;arcSize='+(radius*2)+';' : 'rounded=0;';
      const style = rounded+'whiteSpace=wrap;html=1;fillColor='+drawioColor(n.fill,'none')+';strokeColor='+drawioColor(n.stroke,'none')+';strokeWidth='+(n.strokeWidth||1)+';'+(n.dash?'dashed=1;':'');
      cells.push('<mxCell id="'+id+'" style="'+style+'" vertex="1" parent="1">'+
                 '<mxGeometry x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" as="geometry"/></mxCell>');
      return;
    }
    if(n.type==='path' || n.type==='polyline'){
      const segments=geometrySegments(n), points=segments.flatMap(s=>s.points);
      if(!points.length) return;
      const minX=Math.min(...points.map(p=>p.x)), minY=Math.min(...points.map(p=>p.y));
      const maxX=Math.max(...points.map(p=>p.x)), maxY=Math.max(...points.map(p=>p.y));
      const bw=Math.max(1,maxX-minX), bh=Math.max(1,maxY-minY);
      const pathXml=segments.map(s=>'<path><move x="'+((s.points[0].x-minX)/bw*100).toFixed(4)+'" y="'+((s.points[0].y-minY)/bh*100).toFixed(4)+'"/>'+s.points.slice(1).map(p=>'<line x="'+((p.x-minX)/bw*100).toFixed(4)+'" y="'+((p.y-minY)/bh*100).toFixed(4)+'"/>').join('')+(s.closed?'<close/>':'')+'</path>'+(s.closed&&n.fill&&n.fill!=='none'?'<fillstroke/>':'<stroke/>')).join('');
      const stencil='<shape name="FigureForge Path" w="100" h="100" aspect="variable" strokewidth="inherit"><foreground>'+pathXml+'</foreground></shape>';
      const style = 'shape=stencil('+encodeDrawioStencil(stencil)+');whiteSpace=wrap;html=1;fillColor='+drawioColor(n.fill,'none')+';strokeColor='+drawioColor(n.stroke,scene.svgSource?'none':'000000')+';strokeWidth='+(n.strokeWidth||1)+';'+(n.dash?'dashed=1;':'');
      cells.push('<mxCell id="'+id+'" value="" style="'+style+'" vertex="1" parent="1">'+
                 '<mxGeometry x="'+minX.toFixed(3)+'" y="'+minY.toFixed(3)+'" width="'+bw.toFixed(3)+'" height="'+bh.toFixed(3)+'" as="geometry"/></mxCell>');
      return;
    }
    if(n.type==='image'){
      const style = 'shape=image;imageAspect=0;aspect=fixed;image='+xmlEscape(n.href||'')+';';
      cells.push('<mxCell id="'+id+'" style="'+style+'" vertex="1" parent="1">'+
                 '<mxGeometry x="'+Math.round(n.x)+'" y="'+Math.round(n.y)+'" width="'+Math.round(n.w)+'" height="'+Math.round(n.h)+'" as="geometry"/></mxCell>');
      return;
    }
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<mxfile host="app.diagrams.net" agent="FigureForge" type="device">'+
    '<diagram id="figureforge" name="FigureForge">'+
    '<mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="'+c.width+'" pageHeight="'+c.height+'" math="0" shadow="0">'+
    '<root><mxCell id="0"/><mxCell id="1" parent="0"/>'+cells.join('')+'</root>'+
    '</mxGraphModel></diagram></mxfile>';
}

/* ---------- VSDX ----------
   Native Visio geometry, text and bitmap parts on a ten-inch page. Each visible
   face of a prism remains its own editable shape. */
function sceneToVsdxFiles(scene, font){
  scene=expandEditableTextPaths(scene);
  const imageNodes = (scene && Array.isArray(scene.nodes)) ? scene.nodes.filter(n=>n && n.type==='image') : [];
  const canvasAudit = (scene && scene.canvas) || {};
  const canvasAreaAudit = Math.max(1, Number(canvasAudit.width||canvasAudit.w||EXPORT_CANVAS.w) * Number(canvasAudit.height||canvasAudit.h||EXPORT_CANVAS.h));
  if(imageNodes.some(n=>!/^data:image\//i.test(String(n.href||'')))) throw new Error('VSDX export requires cropped image parts; reconstruct again');
  if(imageNodes.some(n=>Number(n.w||0)*Number(n.h||0) > canvasAreaAudit*0.55)) throw new Error('VSDX export blocked: reconstruction still contains a dominant full-canvas bitmap');
  const rawCanvas = scene.canvas || {};
  const c = Object.assign({}, rawCanvas, {
    width: Number(rawCanvas.width || rawCanvas.w || EXPORT_CANVAS.w),
    height: Number(rawCanvas.height || rawCanvas.h || EXPORT_CANVAS.h),
  });
  const PX_PER_IN = c.width/10;                    // keep the same 10in width as PPTX
  const inches = v => (v/PX_PER_IN);
  const shapes = [];
  const media = [];                                // {name, bytes, contentType, ext}
  const mediaRels = [];                            // relationship entries for page1
  let mediaSeq = 0;

  function geometrySection(points, closed, filled){
    const rows = points.map((p,i)=>'<Row T="'+(i?'RelLineTo':'RelMoveTo')+'" IX="'+(i+1)+'"><Cell N="X" V="'+p[0].toFixed(6)+'"/><Cell N="Y" V="'+p[1].toFixed(6)+'"/></Row>');
    if(closed) rows.push('<Row T="RelLineTo" IX="'+(points.length+1)+'"><Cell N="X" V="'+points[0][0].toFixed(6)+'"/><Cell N="Y" V="'+points[0][1].toFixed(6)+'"/></Row>');
    return '<Section N="Geometry" IX="0"><Cell N="NoFill" V="'+(filled?0:1)+'"/><Cell N="NoLine" V="0"/>'+rows.join('')+'</Section>';
  }

  function boxGeometry(type, radius, w, h){
    if(type==='ellipse') return geometrySection(Array.from({length:48},(_,i)=>{
      const a=2*Math.PI*i/48; return [0.5+0.5*Math.cos(a),0.5+0.5*Math.sin(a)];
    }), true, true);
    const r=Math.max(0,Math.min(Number(radius)||0,w/2,h/2));
    if(!r) return geometrySection([[0,0],[1,0],[1,1],[0,1]],true,true);
    const rx=r/w, ry=r/h, points=[];
    for(const [cx,cy,a0] of [[1-rx,ry,-Math.PI/2],[1-rx,1-ry,0],[rx,1-ry,Math.PI/2],[rx,ry,Math.PI]]){
      for(let j=0;j<=6;j++){
        const a=a0+j*Math.PI/12; points.push([cx+rx*Math.cos(a),cy+ry*Math.sin(a)]);
      }
    }
    return geometrySection(points,true,true);
  }

  function dataUriParts(uri){
    const m = /^data:(image\/(png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(uri||'').trim());
    if(!m) return null;
    const mime = m[1].toLowerCase();
    const ext = mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpeg' : mime.split('/')[1];
    let bin;
    try{ bin = atob(m[3].replace(/\s+/g,'')); }
    catch(_){ return null; }
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType:mime, ext };
  }

  /* Visio stores a bitmap shape as Type="Foreign" with a rectangle geometry, the
     Img* cells, and a <ForeignData> that points at a media part through a page
     relationship. This mirrors the structure Visio itself writes. */
  function imageShape(n, ID, parts, relId){
    const w = Math.max(n.w, 1), h = Math.max(n.h, 1);
    const iw = inches(w), ih = inches(h);
    return '<Shape ID="'+ID+'" Type="Foreign" LineStyle="0" FillStyle="0" TextStyle="0">'+
      '<Cell N="PinX" V="'+inches(n.x + w/2).toFixed(4)+'"/>'+
      '<Cell N="PinY" V="'+inches(c.height - (n.y + h/2)).toFixed(4)+'"/>'+
      '<Cell N="Width" V="'+iw.toFixed(4)+'" U="IN"/><Cell N="Height" V="'+ih.toFixed(4)+'" U="IN"/>'+
      '<Cell N="LocPinX" V="'+(iw/2).toFixed(4)+'" U="IN" F="Width*0.5"/>'+
      '<Cell N="LocPinY" V="'+(ih/2).toFixed(4)+'" U="IN" F="Height*0.5"/>'+
      '<Cell N="Angle" V="0"/><Cell N="FlipX" V="0"/><Cell N="FlipY" V="0"/><Cell N="ResizeMode" V="0"/>'+
      '<Cell N="LinePattern" V="0"/><Cell N="LineWeight" V="0"/><Cell N="FillPattern" V="0"/>'+
      '<Cell N="ImgOffsetX" V="0" U="IN" F="ImgWidth*0"/><Cell N="ImgOffsetY" V="0" U="IN" F="ImgHeight*0"/>'+
      '<Cell N="ImgWidth" V="'+iw.toFixed(4)+'" U="IN" F="Width*1"/>'+
      '<Cell N="ImgHeight" V="'+ih.toFixed(4)+'" U="IN" F="Height*1"/>'+
      '<Cell N="ClippingPath" V="" F="&quot;&quot;" E="#N/A"/>'+
      '<Cell N="TxtPinX" V="'+(iw/2).toFixed(4)+'" U="IN" F="Width*0.5"/>'+
      '<Cell N="TxtPinY" V="0" U="IN" F="Height*0"/>'+
      '<Cell N="TxtWidth" V="'+iw.toFixed(4)+'" U="IN" F="Width*1"/>'+
      '<Cell N="TxtHeight" V="0" U="IN" F="Height*0"/>'+
      '<Cell N="TxtLocPinX" V="'+(iw/2).toFixed(4)+'" U="IN" F="TxtWidth*0.5"/>'+
      '<Cell N="TxtLocPinY" V="0" U="IN" F="TxtHeight*0.5"/>'+
      '<Cell N="TxtAngle" V="0"/><Cell N="VerticalAlign" V="0"/><Cell N="ShdwPattern" V="0"/>'+
      '<Section N="Geometry" IX="0">'+
        '<Cell N="NoFill" V="0"/><Cell N="NoLine" V="1"/><Cell N="NoShow" V="0"/>'+
        '<Cell N="NoSnap" V="0"/><Cell N="NoQuickDrag" V="0"/>'+
        '<Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>'+
        '<Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>'+
        '<Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>'+
        '<Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>'+
        '<Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>'+
      '</Section>'+
      '<ForeignData ForeignType="Bitmap" CompressionType="'+parts.ext.toUpperCase()+'"><Rel r:id="'+relId+'"/></ForeignData>'+
      '</Shape>';
  }

  scene.nodes.forEach(function(n, idx){
    if(n.export === false) return;
    const ID = idx+1;
    const st = { fill:(n.fill||'none'), line:(n.stroke||'none'), weight:(n.strokeWidth||0), dash:!!(n.dash) };
    let xml = '';
    if(n.type==='image'){
      const parts = dataUriParts(n.href);
      if(parts){
        mediaSeq++;
        const name = 'image' + mediaSeq + '.' + parts.ext;
        const relId = 'rIdImg' + mediaSeq;
        media.push({ name:'visio/media/'+name, bytes:parts.bytes });
        mediaRels.push({ id:relId, target:'../media/'+name });
        xml = imageShape(n, ID, parts, relId);
      } else {
        // A reference we cannot inline (a remote URL or a path the page cannot read):
        // keep the rectangle correct instead of pretending an image is there.
        xml = '<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
              '<Cell N="PinX" V="'+inches(n.x+n.w/2).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-(n.y+n.h/2)).toFixed(4)+'"/>'+
              '<Cell N="Width" V="'+inches(Math.max(n.w,4)).toFixed(4)+'"/><Cell N="Height" V="'+inches(Math.max(n.h,4)).toFixed(4)+'"/>'+
              '<Cell N="FillForegnd" V="#F3F4F6"/><Cell N="FillPattern" V="1"/>'+
              '<Cell N="LineColor" V="#9CA3AF"/><Cell N="LinePattern" V="2"/><Cell N="LineWeight" V="0.5"/>'+
              '<Cell N="ShapeType" V="Rectangle"/></Shape>';
      }
    } else if(n.type==='rect' || n.type==='ellipse'){
      const master = n.type==='ellipse' ? 'Ellipse' : 'Rectangle';
      xml = '<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
            '<Cell N="PinX" V="'+inches(n.x+n.w/2).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-(n.y+n.h/2)).toFixed(4)+'"/>'+
            '<Cell N="Width" V="'+inches(Math.max(n.w,1)).toFixed(4)+'"/><Cell N="Height" V="'+inches(Math.max(n.h,1)).toFixed(4)+'"/>'+
            '<Cell N="LocPinX" V="'+inches(Math.max(n.w,1)/2).toFixed(4)+'"/><Cell N="LocPinY" V="'+inches(Math.max(n.h,1)/2).toFixed(4)+'"/>'+
            fillCells(st)+
            // The geometry already contains the measured corners; do not round it twice.
            '<Cell N="Rounding" V="0"/>'+
            '<Cell N="ShapeType" V="'+master+'"/>'+boxGeometry(n.type,n.radius,n.w,n.h)+
            '</Shape>';
    } else if(n.type==='line'){
      const x1=n.x, y1=n.y, x2=n.x2, y2=n.y2;
      const len = Math.hypot(x2-x1, y2-y1);
      // Visio ShapeSheet Angle values are radians, including when serialized
      // without an explicit unit. Degrees rotate lines to the wrong positions.
      const ang = Math.atan2(-(y2-y1), x2-x1);
      xml = '<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
            '<Cell N="PinX" V="'+inches((x1+x2)/2).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-(y1+y2)/2).toFixed(4)+'"/>'+
            '<Cell N="Width" V="'+inches(Math.max(len,0.5)).toFixed(4)+'"/><Cell N="Height" V="0"/>'+
            '<Cell N="LocPinX" V="'+inches(Math.max(len,0.5)/2).toFixed(4)+'"/><Cell N="LocPinY" V="0"/>'+
            '<Cell N="Angle" V="'+ang.toFixed(4)+'"/>'+
            '<Cell N="EndArrow" V="'+(n.arrow?4:0)+'"/>'+
            '<Cell N="LineColor" V="#'+exportColor(n.stroke,'000000')+'"/>'+
            '<Cell N="LinePattern" V="'+(n.dash?2:1)+'"/>'+
            '<Cell N="LineWeight" V="'+inches(Math.max(n.strokeWidth||1,1)).toFixed(5)+'"/>'+
            '<Cell N="ShapeType" V="Line"/>'+
            geometrySection([[0,0],[1,0]],false,false)+
            '</Shape>';
    } else if(n.type==='path' || n.type==='polyline'){
      const segments=geometrySegments(n), points=segments.flatMap(s=>s.points);
      if(!points.length) return;
      const minX=Math.min(...points.map(p=>p.x)), minY=Math.min(...points.map(p=>p.y));
      const maxX=Math.max(...points.map(p=>p.x)), maxY=Math.max(...points.map(p=>p.y));
      const bw=Math.max(1,maxX-minX), bh=Math.max(1,maxY-minY);
      let row=1;
      const geometry=segments.map(s=>{
        const rel=p=>'<Cell N="X" V="'+((p.x-minX)/bw).toFixed(6)+'"/><Cell N="Y" V="'+(1-(p.y-minY)/bh).toFixed(6)+'"/>';
        let rows='<Row T="RelMoveTo" IX="'+row+++'">'+rel(s.points[0])+'</Row>';
        for(const p of s.points.slice(1)) rows+='<Row T="RelLineTo" IX="'+row+++'">'+rel(p)+'</Row>';
        if(s.closed) rows+='<Row T="RelLineTo" IX="'+row+++'">'+rel(s.points[0])+'</Row>';
        return rows;
      }).join('');
      xml='<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
        '<Cell N="PinX" V="'+inches(minX+bw/2).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-(minY+bh/2)).toFixed(4)+'"/>'+
        '<Cell N="Width" V="'+inches(bw).toFixed(4)+'"/><Cell N="Height" V="'+inches(bh).toFixed(4)+'"/>'+
        '<Cell N="LocPinX" V="'+inches(bw/2).toFixed(4)+'"/><Cell N="LocPinY" V="'+inches(bh/2).toFixed(4)+'"/>'+
        fillCells(st)+(scene.svgSource&&n.arrow?'<Cell N="EndArrow" V="4"/>':'')+'<Section N="Geometry" IX="0"><Cell N="NoFill" V="'+(segments.some(s=>s.closed)?0:1)+'"/><Cell N="NoLine" V="0"/>'+geometry+'</Section></Shape>';
    } else if(n.type==='text'){
      const text = String(n.text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      // The Visio page is ten inches wide. SVG font sizes are canvas pixels,
      // so convert through that page scale instead of the PPTX point heuristic.
      // The old multiplier enlarged text by ~1.8x in Visio.
      const fontPx = Math.max(1, Number(n.fontSize)||16);
      const sizePt = fontPx*72/PX_PER_IN;
      // Visio wraps text to the shape's Width even when the SVG/PPTX text is
      // allowed to overhang its measured crop box. Size the native text box
      // from the font metrics as well, while preserving its original anchor.
      const lines = String(n.text).split(/\r?\n/);
      const glyphUnits = Math.max(...lines.map(line => Array.from(line).reduce((sum, ch) =>
        sum + (/[^\x00-\xff]/.test(ch) ? 1 : /[ilI.,:;!| ']/.test(ch) ? 0.3 : /[MW@#%]/.test(ch) ? 0.85 : 0.57), 0)));
      const pxPerPt = PX_PER_IN/72;
      const measuredW = Number.isFinite(Number(n.w)) ? Math.max(0,Number(n.w))*1.04 : 0;
      const boxW = Math.max(measuredW, (glyphUnits+1.2)*sizePt*pxPerPt, 20);
      const boxH = Math.max(fontPx*1.4, lines.length*sizePt*pxPerPt*1.35);
      const anchorX = n.anchor==='middle' ? n.x+Number(n.w||0)/2 :
        n.anchor==='end' ? n.x+Number(n.w||0)-boxW/2 : n.x+boxW/2;
      const anchorY = n.verticalAlign==='middle' ? n.y+Number(n.h||0)/2 : n.y+boxH/2;
      const textAngle=Number.isFinite(Number(n.rotation)) ? -Number(n.rotation)*Math.PI/180 : 0;
      xml = '<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
            '<Cell N="PinX" V="'+inches(anchorX).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-anchorY).toFixed(4)+'"/>'+
            '<Cell N="Width" V="'+inches(boxW).toFixed(4)+'"/><Cell N="Height" V="'+inches(boxH).toFixed(4)+'"/>'+
            '<Cell N="LocPinX" V="'+inches(boxW/2).toFixed(4)+'"/><Cell N="LocPinY" V="'+inches(boxH/2).toFixed(4)+'"/>'+
            '<Cell N="Angle" V="'+textAngle.toFixed(6)+'"/>'+
            '<Cell N="FillForegnd" V="#FFFFFF"/><Cell N="FillPattern" V="0"/>'+
            '<Cell N="LinePattern" V="0"/>'+
            '<Cell N="VerticalAlign" V="'+(n.verticalAlign==='middle'?1:0)+'"/><Cell N="HorzAlign" V="'+(n.anchor==='middle'?1:(n.anchor==='end'?2:0))+'"/>'+
            '<Cell N="ShapeType" V="Text"/>'+
            '<Section N="Character"><Row IX="0"><Cell N="Size" V="'+(sizePt/72).toFixed(5)+'"/>'+
              '<Cell N="Color" V="#'+exportColor(n.fill,'000000')+'"/><Cell N="Style" V="'+(n.bold?1:0)+'"/>'+
              '<Cell N="Font" V="'+xmlEscape(font||n.fontFamily||'Arial')+'"/></Row></Section>'+
            '<Text>'+text+'</Text>'+
            '</Shape>';
    } else {
      // Unsupported primitive: keep a dashed placeholder so nothing silently vanishes.
      xml = '<Shape ID="'+ID+'" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">'+
            '<Cell N="PinX" V="'+inches(n.x+n.w/2).toFixed(4)+'"/><Cell N="PinY" V="'+inches(c.height-(n.y+n.h/2)).toFixed(4)+'"/>'+
            '<Cell N="Width" V="'+inches(Math.max(n.w,4)).toFixed(4)+'"/><Cell N="Height" V="'+inches(Math.max(n.h,4)).toFixed(4)+'"/>'+
            '<Cell N="FillPattern" V="0"/><Cell N="LinePattern" V="2"/>'+
            '<Cell N="LineColor" V="#BFBFBF"/>'+
            '<Cell N="ShapeType" V="Rectangle"/></Shape>';
    }
    shapes.push(xml);
  });

  function fillCells(st){
    const parts = [];
    parts.push('<Cell N="FillForegnd" V="#'+exportColor(st.fill,'FFFFFF')+'"/>');
    parts.push('<Cell N="FillPattern" V="'+(st.fill && st.fill!=='none' ? 1 : 0)+'"/>');
    parts.push('<Cell N="LineColor" V="#'+exportColor(st.line,'000000')+'"/>');
    parts.push('<Cell N="LinePattern" V="'+(st.line && st.line!=='none' ? (st.dash?2:1) : 0)+'"/>');
    parts.push('<Cell N="LineWeight" V="'+inches(Math.max(st.weight,1)).toFixed(5)+'"/>');
    return parts.join('');
  }

  const pageWidth = inches(c.width).toFixed(4), pageHeight = inches(c.height).toFixed(4);

  // The page part is a PageContents document holding the shapes. The drawing-level
  // VisioDocument, its page list and the page properties live in the other parts.
  const pageXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">'+
    '<Shapes>'+shapes.join('')+'</Shapes>'+
    '</PageContents>';

  const pageRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    mediaRels.map(r=>'<Relationship Id="'+r.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="'+r.target+'"/>').join('')+
    '</Relationships>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    (media.some(m=>/\.png$/i.test(m.name)) ? '<Default Extension="png" ContentType="image/png"/>' : '')+
    (media.some(m=>/\.jpe?g$/i.test(m.name)) ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '')+
    (media.some(m=>/\.gif$/i.test(m.name)) ? '<Default Extension="gif" ContentType="image/gif"/>' : '')+
    (media.some(m=>/\.webp$/i.test(m.name)) ? '<Default Extension="webp" ContentType="image/webp"/>' : '')+
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'+
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'+
    '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>'+
    '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>'+
    '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>'+
    '<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>'+
    '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'+
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'+
    '</Relationships>';

  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>'+
    '</Relationships>';

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" xml:space="preserve">'+
    '<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0"/>'+
    '<Colors/><FaceNames/><StyleSheets/>'+
    '</VisioDocument>';

  const pagesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve">'+
    '<Page ID="0" NameU="FigureForge" Name="FigureForge" ViewScale="-1" ViewCenterX="'+(c.width/2/PX_PER_IN).toFixed(4)+'" ViewCenterY="'+(c.height/2/PX_PER_IN).toFixed(4)+'">'+
    '<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">'+
      '<Cell N="PageWidth" V="'+pageWidth+'" U="IN"/><Cell N="PageHeight" V="'+pageHeight+'" U="IN"/>'+
      '<Cell N="PageScale" V="1"/><Cell N="DrawingScale" V="1"/>'+
    '</PageSheet>'+
    '<Rel r:id="rId1"/>'+
    '</Page></Pages>';

  const pagesRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>'+
    '</Relationships>';

  const windowsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Windows xmlns="http://schemas.microsoft.com/office/visio/2012/main" ClientWidth="1600" ClientHeight="900"/>';

  const appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'+
    '<Application>FigureForge</Application><Company></Company></Properties>';

  const coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '+
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'+
    '<dc:title>FigureForge editable figure</dc:title><dc:creator>FigureForge</dc:creator>'+
    '<cp:lastModifiedBy>FigureForge</cp:lastModifiedBy>'+
    '<dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString()+'</dcterms:created>'+
    '</cp:coreProperties>';

  return [
    { name:'[Content_Types].xml', data:contentTypes },
    { name:'_rels/.rels', data:rootRels },
    { name:'docProps/app.xml', data:appXml },
    { name:'docProps/core.xml', data:coreXml },
    { name:'visio/document.xml', data:documentXml },
    { name:'visio/_rels/document.xml.rels', data:docRels },
    { name:'visio/pages/pages.xml', data:pagesXml },
    { name:'visio/pages/_rels/pages.xml.rels', data:pagesRels },
    { name:'visio/pages/page1.xml', data:pageXml },
    { name:'visio/pages/_rels/page1.xml.rels', data:pageRels },
    { name:'visio/windows.xml', data:windowsXml },
  ].concat(media.map(m=>({ name:m.name, data:m.bytes })));
}

/* ---------- zip (stored, no compression) ----------
   VSDX is an OOXML package, so a minimal store-only zip writer is enough and
   keeps this dependency-free. CRC32 is required by the format. */
function crc32(bytes){
  let table = crc32.table;
  if(!table){
    table = crc32.table = new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c = n;
      for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files){
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours()<<11) | (now.getMinutes()<<5) | Math.floor(now.getSeconds()/2)) & 0xFFFF;
  const dosDate = (((now.getFullYear()-1980)<<9) | ((now.getMonth()+1)<<5) | now.getDate()) & 0xFFFF;

  files.forEach(function(f){
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);            // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, dataBytes);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + dataBytes.length;
  });

  const centralSize = central.reduce((a,c)=>a+c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob(chunks.concat(central, [end]), { type:'application/vnd.ms-visio.drawing' });
}


export {sceneToDrawio,sceneToVsdxFiles,zipStore};
