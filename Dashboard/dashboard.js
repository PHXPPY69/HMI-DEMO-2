(function(){
  'use strict';
  const $ = s => document.querySelector(s);

  const CONFIG = {
    MODE: "AUTO",
    WS_URL:  "ws://localhost:8000/ws",
    POLL_URL:"http://localhost:8000/api/tags",
    POLL_MS: 1000
  };

  const TAGS = {
    temp: 26, humi: 56, oee: 74, count: 0,
    orderNo:"—", sizeSpool:"—", yarnType:"—", yarnSize:"—", state:"—",
    motors:[0,0,0,0,0,0], cells:[0,0,0,0,0,0]
  };

  const SERIES = { oee:[], count:[], temp:[], humi:[], rpmAvg:[], countTrend:[] };

  // ===== CPM (Count per Minute) =====
  const histCount = [];               // [{t, c}]
  const CPM_SERIES = [];              // เก็บค่า cpm ล่าสุด 10 จุดไว้ทำกราฟแท่ง
  const keep = (a,v,n=60)=>{ a.push(v); if(a.length>n)a.shift(); };

  const fmt0 = n => Math.round(n).toString();
  const fmtn = n => n.toLocaleString();

  function drawSpark(elId, values){
    const el = $("#"+elId); if(!el) return;
    const w = el.clientWidth||110, h = el.clientHeight||28, ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox",`0 0 ${w} ${h}`);
    const max=Math.max(...values,1), min=Math.min(...values,0);
    const x=i=>(i/(values.length-1))*w, y=v=>h-((v-min)/(max-min+1e-6))*h;
    const pl=document.createElementNS(ns,"polyline");
    pl.setAttribute("points", values.map((v,i)=>`${x(i)},${y(v)}`).join(" "));
    pl.setAttribute("fill","none"); pl.setAttribute("stroke", getComputedStyle(document.documentElement)
  .getPropertyValue("--dot-a") || "#4dabf7"); pl.setAttribute("stroke-width","2");
    el.innerHTML=""; svg.appendChild(pl); el.appendChild(svg);
  }

  function drawMiniBarFromValues(id, vals){
    const svg = document.getElementById(id);
    if(!svg) return;
    svg.innerHTML = "";

    // ใช้ขนาดให้ match viewBox ใหม่ 320x160 (ถ้าอยากปรับต่อก็แก้สองค่านี้)
    const W = 320, H = 160;

    // ลด padding รอบๆ เพื่อให้แท่งสูง/ใหญ่ขึ้น
    const padX = 12, padY = 10;
    const innerW = W - padX * 2;
    const innerH = H - padY * 2;

    const n = Math.max(1, vals.length);
    const max = Math.max(1, ...vals);

    // ทำแท่ง "อ้วน" ขึ้น: ลดช่องว่าง เหลือ 10% ต่อช่อง
    const slotW = innerW / n;
    const bw = slotW * 0.9;         // bar width = 90% ของช่อง
    const gap = slotW * 0.1;        // เว้นช่อง 10%
    const rx = 8;                   // มุมโค้งมากขึ้น

    for(let i=0;i<n;i++){
      const v = vals[i];
      const h = (v / max) * innerH;            // ใช้ความสูงเต็ม innerH
      const x = padX + i * slotW + (gap/2);    // จัดให้อยู่กลางช่อง
      const y = H - padY - h;

      const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", bw);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", rx);
      rect.setAttribute("fill", getComputedStyle(document.documentElement)
        .getPropertyValue("--bar-a").trim() || "#7fb8ff");
      svg.appendChild(rect);
    }
  }


  function drawDonut(id,val,max=100){
    const svg=$("#"+id); if(!svg) return; svg.innerHTML=""; const c=60,r=50,C=2*Math.PI*r,ns=svg.namespaceURI;
    const mk=(n,a)=>{const e=document.createElementNS(ns,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e;};
    svg.append(mk("circle",{cx:c,cy:c,r,fill:"none",stroke:"#2a3e5c","stroke-width":"12"}));
    const p=Math.max(0,Math.min(1,val/max));
    svg.append(mk("circle",{cx:c,cy:c,r,fill:"none",stroke:"#ffd54a","stroke-width":"12","stroke-linecap":"round",
                             transform:`rotate(-90 ${c} ${c})`,"stroke-dasharray":`${C*p} ${C*(1-p)}`}));
    $("#donutVal").textContent = Math.round(val);
  }

  function drawGroupedBar(id, labels, a, b){
    const svg=$("#"+id); svg.innerHTML="";
    const W=520,H=220,pad=28, innerW=W-pad*2, innerH=H-pad*2, max=Math.max(...a,...b,1)*1.2;
    const bw=innerW/labels.length, ns=svg.namespaceURI;
    const mk=(n,o)=>{const e=document.createElementNS(ns,n);Object.entries(o).forEach(([k,v])=>e.setAttribute(k,v));return e;};
    svg.append(mk("line",{x1:pad,y1:H-pad,x2:W-pad,y2:H-pad,stroke:"#2a3e5c"}));
    svg.append(mk("line",{x1:pad,y1:pad,x2:pad,y2:H-pad,stroke:"#2a3e5c"}));
    labels.forEach((lb,i)=>{
      const x0=pad+bw*i+8, w=(bw-24)/2, h1=(a[i]/max)*innerH, h2=(b[i]/max)*innerH;
      svg.append(mk("rect",{x:x0,y:H-pad-h1,width:w,height:h1,rx:4,fill:"#7fb8ff"}));
      svg.append(mk("rect",{x:x0+w+8,y:H-pad-h2,width:w,height:h2,rx:4,fill:"#ffd54a"}));
      const t=mk("text",{x:pad+bw*i+bw/2,y:H-8,"text-anchor":"middle",fill:"#c2d2ee","font-size":"12"}); t.textContent=lb; svg.append(t);
    });
  }

  function drawArea(id, a, b){
    const svg=$("#"+id); svg.innerHTML="";
    const W=520,H=220,pad=28, innerW=W-pad*2, innerH=H-pad*2, max=Math.max(...a,...b,1)*1.2,min=0, ns=svg.namespaceURI;
    const x=i=>pad+(i/(a.length-1))*innerW, y=v=>H-pad-((v-min)/(max-min))*innerH;
    const mk=(n,o)=>{const e=document.createElementNS(ns,n);Object.entries(o).forEach(([k,v])=>e.setAttribute(k,v));return e;};
    svg.append(mk("line",{x1:pad,y1:H-pad,x2:W-pad,y2:H-pad,stroke:"#2a3e5c"}));
    svg.append(mk("line",{x1:pad,y1:pad,x2:pad,y2:H-pad,stroke:"#2a3e5c"}));
    const pth=v=>v.map((val,i)=>`${i?"L":"M"}${x(i)},${y(val)}`).join(" ");
    svg.append(mk("path",{d:`M${x(0)},${y(0)} ${pth(a)} L${x(a.length-1)},${y(0)} Z`,fill:"#7fb8ff",opacity:.15}));
    svg.append(mk("path",{d:`M${x(0)},${y(0)} ${pth(b)} L${x(b.length-1)},${y(0)} Z`,fill:"#ffd54a",opacity:.15}));
    svg.append(mk("path",{d:pth(a),fill:"none",stroke:"#7fb8ff","stroke-width":"3"}));
    svg.append(mk("path",{d:pth(b),fill:"none",stroke:"#ffd54a","stroke-width":"3"}));
  }

  function drawRadar(valsABC){
    const svg=$("#radar"); svg.innerHTML=""; const W=260,H=220,cx=W/2,cy=H/2+10,R=80,axes=6, ns=svg.namespaceURI;
    const labels=["Risk","Resolve","Expand","Account","Proactive","Target"];
    const colors=["#7fb8ff","#ffd54a","#8b5cf6"];
    const mk=(n,o)=>{const e=document.createElementNS(ns,n);Object.entries(o).forEach(([k,v])=>e.setAttribute(k,v));return e;};
    for(let ring=1; ring<=4; ring++){
      const r=R*ring/4, poly=[]; for(let i=0;i<axes;i++){ const a=-Math.PI/2+i*(2*Math.PI/axes); poly.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); }
      svg.append(mk("polygon",{points:poly.map(p=>p.join(",")).join(" "),fill:"none",stroke:"#2a3e5c"}));
    }
    for(let i=0;i<axes;i++){
      const a=-Math.PI/2+i*(2*Math.PI/axes); svg.append(mk("line",{x1:cx,y1:cy,x2:cx+R*Math.cos(a),y2:cy+R*Math.sin(a),stroke:"#2a3e5c"}));
      const tx=cx+(R+14)*Math.cos(a), ty=cy+(R+14)*Math.sin(a);
      const t=mk("text",{x:tx,y:ty,"text-anchor":"middle","font-size":"10",fill:"#c2d2ee"}); t.textContent=labels[i]; svg.append(t);
    }
    valsABC.forEach((vals,i)=>{
      const pts = vals.map((v,ix)=>{const a=-Math.PI/2+ix*(2*Math.PI/axes); const r=(v/100)*R; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]});
      svg.append(mk("polygon",{points:pts.map(p=>p.join(",")).join(" "),fill:colors[i],stroke:colors[i],opacity:.18}));
    });
  }

  function drawGauge(score){
    const svg=$("#gauge"); svg.innerHTML=""; const W=260,H=160,cx=W/2,cy=H*0.95,R=100, ns=svg.namespaceURI;
    const mk=(n,o)=>{const e=document.createElementNS(ns,n);Object.entries(o).forEach(([k,v])=>e.setAttribute(k,v));return e;};
    const pol=a=>({x:cx+R*Math.cos(a), y:cy+R*Math.sin(a)}), arc=(s,e,c)=>{const S=pol(s),E=pol(e);svg.append(mk("path",{d:`M ${S.x} ${S.y} A ${R} ${R} 0 ${e-s<=Math.PI?0:1} 1 ${E.x} ${E.y}`,stroke:c,"stroke-width":14,fill:"none","stroke-linecap":"round"}));};
    arc(Math.PI,Math.PI*1.5,"#e25c62"); arc(Math.PI*1.5,Math.PI*1.8,"#ffd54a"); arc(Math.PI*1.8,Math.PI*2,"#19c36e");
    const a=Math.PI+(score/100)*Math.PI, p=pol(a); svg.append(mk("line",{x1:cx,y1:cy,x2:p.x,y2:p.y,stroke:"#7fb8ff","stroke-width":"4"}));
    $("#npsVal").textContent = score.toFixed(1);
  }

  function render(){
    $("#kpiOEE").textContent   = fmt0(TAGS.oee) + "%";
    $("#kpiCount").textContent = fmtn(TAGS.count);
    $("#kpiTemp").textContent  = fmt0(TAGS.temp) + "°C";
    $("#kpiHumi").textContent  = fmt0(TAGS.humi) + "%";

    drawSpark("sparkOEE", SERIES.oee);
    drawSpark("sparkCount", SERIES.count);
    drawSpark("sparkTemp", SERIES.temp);
    drawSpark("sparkHumi", SERIES.humi);

    drawDonut("donut", TAGS.oee, 100);

    const labels=["M1","M2","M3","M4","M5","M6"];
    const rpm=TAGS.motors.map(v=>Math.max(0,v));
    const cell=TAGS.cells.map(v=>Math.max(0,v));
    drawGroupedBar("barMC", labels, rpm, cell);

    const rpmAvg = rpm.reduce((s,v)=>s+v,0)/Math.max(1,rpm.length);
    keep(SERIES.rpmAvg, rpmAvg, 60);
    keep(SERIES.countTrend, TAGS.count, 60);
    drawArea("areaDeals", SERIES.rpmAvg, SERIES.countTrend);

    const a=[TAGS.cells[0],65,60,70,75,55].map(v=>Math.max(10,Math.min(100,v||10)));
    const b=[TAGS.cells[1],50,72,66,60,68].map(v=>Math.max(10,Math.min(100,v||10)));
    const c=[TAGS.cells[2],58,64,62,61,73].map(v=>Math.max(10,Math.min(100,v||10)));
    drawRadar([a,b,c]);

    const score = TAGS.state?.toLowerCase()==="running" ? 85 : (TAGS.state?.toLowerCase()==="stopped" ? 40 : 60);
    drawGauge(score);
    $("#npsTable").innerHTML = `
      <tr><td>Order</td><td>${TAGS.orderNo}</td></tr>
      <tr><td>Yarn</td><td>${TAGS.yarnType} ${TAGS.yarnSize}</td></tr>
      <tr><td>Spool</td><td>${TAGS.sizeSpool}</td></tr>
      <tr><td>State</td><td>${TAGS.state}</td></tr>
    `;

    // ----- CPM chart + Order Snapshot -----
    drawMiniBarFromValues("miniPerMin", CPM_SERIES);
    $("#sumOrder").textContent = TAGS.orderNo;
    $("#sumYarn").textContent  = `${TAGS.yarnType} ${TAGS.yarnSize}`;
    $("#sumSpool").textContent = TAGS.sizeSpool;
    $("#sumState").textContent = TAGS.state;
    $("#sumCPM").textContent   = CPM_SERIES.length ? Math.round(CPM_SERIES[CPM_SERIES.length-1]) : "—";

    // Ranking
    const ranks = TAGS.motors.map((v,i)=>({i:i+1,rpm:v})).sort((a,b)=>b.rpm-a.rpm)
      .map((r,idx)=>`<div class="rank-item"><div class="rank-idx">${idx+1}</div><div class="rank-name">Motor ${r.i}</div><div class="rank-score">${fmt0(r.rpm)} RPM</div></div>`).join("");
    $("#rankList").innerHTML=ranks;
  }

  // ===== คำนวณ CPM จาก Count ล่าสุดเทียบกับ ~60 วินาทีก่อนหน้า =====
  function updateCPM(now, countNow){
    // เก็บประวัติไม่เกิน 3 นาที
    histCount.push({t: now, c: countNow});
    while(histCount.length && now - histCount[0].t > 180000) histCount.shift();

    // หา snapshot ~60s ก่อนหน้า
    let cpm = 0;
    const targetAgo = now - 60000;
    // หา entry ที่มีเวลาใกล้ที่สุดแต่ไม่เกิน targetAgo
    let older = null;
    for(let i=histCount.length-1; i>=0; i--){
      if(histCount[i].t <= targetAgo){ older = histCount[i]; break; }
    }
    if(!older && histCount.length){
      older = histCount[0]; // เผื่อข้อมูลยังไม่ครบ 60s ให้เทียบกับจุดแรก และสเกลตามเวลา
    }
    if(older){
      const dt = Math.max(1, (now - older.t)/1000); // วินาที
      const dc = countNow - older.c;
      cpm = dc * (60/dt);                            // สเกลให้เป็นต่อ 60s
    }
    keep(CPM_SERIES, Math.max(0,cpm), 10);
  }

  function onData(obj){
    Object.assign(TAGS, obj);
    const now = Date.now();

    keep(SERIES.oee,   TAGS.oee,   60);
    keep(SERIES.count, TAGS.count, 60);
    keep(SERIES.temp,  TAGS.temp,  60);
    keep(SERIES.humi,  TAGS.humi,  60);

    updateCPM(now, TAGS.count);      // ← อัปเดต CPM ทุกครั้งที่มีข้อมูลเข้า
    render();
  }

  /* Sources: Broadcast/WS/Poll/SIM (เดิม) */
  function startBroadcast(){
    try{ const bc = new BroadcastChannel('hmi-data'); bc.onmessage=e=>e?.data&&onData(e.data); return bc; }catch(_){ return null; }
  }
  function startWS(){ try{ const ws=new WebSocket(CONFIG.WS_URL); ws.onmessage=e=>{try{onData(JSON.parse(e.data));}catch{}}; return ws; }catch{ return null; } }
  function startPoll(){ return setInterval(async()=>{ try{ const r=await fetch(CONFIG.POLL_URL,{cache:"no-store"}); if(r.ok) onData(await r.json()); }catch{} }, CONFIG.POLL_MS); }
  function startSIM(){ return setInterval(()=>{ const motors=TAGS.motors.map((_,i)=>400+i*300+(Math.random()*70-35)); const cells=TAGS.cells.map(()=>70+Math.random()*20);
    onData({ temp:26+(Math.random()*2-1), humi:55+(Math.random()*4-2), oee:70+(Math.random()*12-6),
      count:TAGS.count+Math.floor(Math.random()*15), orderNo:"RGW2246422", sizeSpool:"Φ180", yarnType:"MONO", yarnSize:"0.22", state:"Running", motors, cells });
  }, 1000); }

  window.addEventListener("DOMContentLoaded", ()=>{
    startBroadcast();
    startWS(); startPoll();
    setTimeout(()=>{ if(SERIES.oee.length===0) startSIM(); }, 1500);
    render();
  });
})();
