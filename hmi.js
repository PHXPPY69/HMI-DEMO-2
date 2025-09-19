(() => {
  'use strict';

  /* =========================================================
   * CONFIG — สวิตช์ 2 โหมด + จุดต่อ Python backend
   *  MODE: "SIM" = สุ่ม; "PLC" = รับค่าจาก Python (FastAPI)
   *  ถ้าใช้ WS ให้ใส่ WS_URL; ถ้า Polling ให้ใส่ POLL_URL/POLL_MS
   * ========================================================= */
  const CONFIG = {
    MODE: "SIM",                                  // ← เปลี่ยนเป็น "PLC" เมื่อต่อจริง
    WS_URL:  "ws://localhost:8000/ws",            // ← server.py เปิดไว้ที่ /ws
    POLL_URL:"http://localhost:8000/api/tags",    // ← polling REST
    POLL_MS: 500,

    // 👉 หน้าที่จะไปเมื่อคลิกการ์ดเซลล์ (เปลี่ยนชื่อไฟล์ได้)
    CELL_PAGE: "cell-detail.html"
  };

  /* ==================== TAGS (MODEL) ==================== */
  const TAGS = {
    temp: 26, humi: 56, oee: 74, count: 0,
    orderNo: "RGW2246422",
    sizeSpool: "Φ180",
    yarnType: "MONO",
    yarnSize: "0.22",
    state: "Running",
    motors: [324,324,324,324,324,324],   // 6 series for chart
    cells:   [79,79,79,79,79,79]
  };

  // สถานะโหมด + ตัวจับเวลา
  let running = true;        // ใช้ควบคุม simulator start/stop ปุ่ม
  let livePLC = false;       // มีข้อมูลจริงเข้ามาแล้ว → หยุดสุ่ม
  let simTimer = null;       // id ของ setInterval(sim)

  /* ==================== HELPERS (render พื้นที่อื่น) ==================== */
  const $ = (id)=>document.getElementById(id);
  function setDonut(p){
    const C=113.097, a=(p/100)*C;
    $("donutFill")?.setAttribute("stroke-dasharray", a.toFixed(1)+" "+(C-a).toFixed(1));
    $("donutText") && ($("donutText").textContent = p.toFixed(0)+"%");
  }
  function renderLeft(){
    $("temp") && ($("temp").textContent = TAGS.temp.toFixed(0)+"°C");
    $("humi") && ($("humi").textContent = TAGS.humi.toFixed(0)+"%");
    setDonut(TAGS.oee);
    $("count") && ($("count").textContent = Math.floor(TAGS.count).toLocaleString()+" pcs");
  }
  function renderOrder(){
    $("orderNo")   && ($("orderNo").textContent   = TAGS.orderNo);
    $("sizeSpool") && ($("sizeSpool").textContent = TAGS.sizeSpool);
    $("yarnType")  && ($("yarnType").textContent  = TAGS.yarnType);
    $("yarnSize")  && ($("yarnSize").textContent  = TAGS.yarnSize);
    $("state")     && ($("state").textContent     = TAGS.state);
    $("badge")     && ($("badge").textContent     = TAGS.state.toUpperCase());
  }
  function renderMachine(){
    $("rpm1") && ($("rpm1").textContent = (TAGS.motors[0]??0).toFixed(0));
    $("rpm2") && ($("rpm2").textContent = (TAGS.motors[1]??0).toFixed(0));
    $("rpm3") && ($("rpm3").textContent = (TAGS.motors[2]??0).toFixed(0));
    $("rpm4") && ($("rpm4").textContent = (TAGS.motors[3]??0).toFixed(0));
  }

  /* ==================== CELLS ==================== */
  const STEP_COUNT = 16; // ← จำนวนขั้นบันไดต่อใบ (ปรับได้)
  function renderCells(){
    for(let i=1;i<=6;i++){
      const v = TAGS.cells[i-1];
      const pct = Math.max(0, Math.min(100, v));

      const fill  = $("cell"+i);
      const thumb = $("cell"+i+"th");
      const tank  = fill?.closest?.('.tank');
      if(!fill || !thumb || !tank) continue;

      const tankH  = tank.clientHeight;
      const top    = parseFloat(getComputedStyle(tank).paddingTop);
      const bottom = parseFloat(getComputedStyle(tank).paddingBottom);

      const fillH = (pct/100) * (tankH - (top + bottom));
      fill.style.height  = `${fillH}px`;
      fill.style.bottom  = `${bottom}px`;
      thumb.style.bottom = `${bottom + fillH}px`;

      $("cell"+i+"txt") && ($("cell"+i+"txt").textContent = `${pct.toFixed(0)}%`);

      // steps
      const s = $("steps"+i);
      if(s){
        if(s.children.length !== STEP_COUNT){
          s.innerHTML = "";
          for(let k=0;k<STEP_COUNT;k++) s.appendChild(document.createElement('span'));
        }
        const activeSteps = Math.round(pct/100*STEP_COUNT);
        [...s.children].forEach((el,idx)=>{
          el.className = idx<activeSteps-1 ? "on" : (idx===activeSteps-1 ? "active" : "");
        });
      }
    }
  }

  /* =========================================================
   * CHART: Line 6 เส้น + แกนซ้าย/แกนล่าง
   * ========================================================= */
  const CHART = {
    w: 900, h: 220,
    padT: 16, padR: 10, padB: 26, padL: 48,
    yMin: 0,
    yMax: 2500,     // ← ตั้งค่าตายตัวแบบตัวอย่าง
    yTicks: 6,      // 0..2500 แบ่ง 6 ระดับ
    xTicks: 10,     // tick เวลาแนวนอน
    autoMax: false  // true = ปรับอัตโนมัติ
  };
  const COLORS = ["#7fb8ff","#fb7185","#22c55e","#f59e0b","#8b5cf6","#06b6d4"];
  const maxPts = 140;
  const series = Array.from({length:6},()=> Array(maxPts).fill(0));

  function ensureChartDom(){
    const svg = $("spark");
    if (!svg || svg.__inited) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";

    const gGrid = document.createElementNS(NS,'g'); gGrid.setAttribute('class','grid'); gGrid.setAttribute('id','grid');
    const gAxis = document.createElementNS(NS,'g'); gAxis.setAttribute('id','axis');
    const gData = document.createElementNS(NS,'g'); gData.setAttribute('id','lines');
    svg.appendChild(gGrid); svg.appendChild(gAxis); svg.appendChild(gData);

    for(let i=0;i<6;i++){
      const pl = document.createElementNS(NS,'polyline');
      pl.setAttribute('id','line'+(i+1));
      pl.setAttribute('class','series');
      pl.setAttribute('stroke', COLORS[i]);
      gData.appendChild(pl);
    }
    svg.__inited = true;
  }

  function renderChart(){
    ensureChartDom();

    const w=CHART.w, h=CHART.h, {padT,padR,padB,padL} = CHART;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const N = series[0].length;

    let yMax = CHART.yMax;
    if (CHART.autoMax) {
      let m = 0;
      for(let i=0;i<6;i++) for(let k=0;k<N;k++) m = Math.max(m, series[i][k]||0);
      yMax = Math.max(500, Math.ceil(m*1.1/100)*100);
    }
    const xMap = i => padL + (i/(N-1))*innerW;
    const yMap = v => padT + innerH - ((v-CHART.yMin)/(yMax-CHART.yMin))*innerH;

    const gGrid = $("grid");
    if (gGrid && !gGrid.__built) {
      const NS = "http://www.w3.org/2000/svg";
      for(let r=0;r<=CHART.yTicks;r++){
        const y = padT + (innerH/CHART.yTicks)*r;
        const ln = document.createElementNS(NS,'line');
        ln.setAttribute('x1',padL); ln.setAttribute('x2',padL+innerW);
        ln.setAttribute('y1',y);    ln.setAttribute('y2',y);
        gGrid.appendChild(ln);
      }
      for(let c=0;c<=CHART.xTicks;c++){
        const x = padL + (innerW/CHART.xTicks)*c;
        const ln = document.createElementNS(NS,'line');
        ln.setAttribute('x1',x); ln.setAttribute('x2',x);
        ln.setAttribute('y1',padT+innerH); ln.setAttribute('y2',padT+innerH+4);
        ln.setAttribute('stroke','rgba(255,255,255,.15)');
        gGrid.appendChild(ln);
      }
      gGrid.__built = true;
    }

    const gAxis = $("axis");
    if (gAxis){
      while (gAxis.firstChild) gAxis.removeChild(gAxis.firstChild);
      const NS = "http://www.w3.org/2000/svg";
      for(let r=0;r<=CHART.yTicks;r++){
        const val = Math.round(yMax - (yMax/CHART.yTicks)*r);
        const y = padT + (innerH/CHART.yTicks)*r;
        const t = document.createElementNS(NS,'text');
        t.setAttribute('x', padL-6); t.setAttribute('y', y);
        t.setAttribute('class','axis');
        t.setAttribute('text-anchor','end');
        t.setAttribute('dominant-baseline','middle');
        t.textContent = val.toString();
        gAxis.appendChild(t);
      }
      const now = Date.now();
      for(let c=0;c<=CHART.xTicks;c++){
        const x = padL + (innerW/CHART.xTicks)*c;
        const t = document.createElementNS(NS,'text');
        t.setAttribute('x', x); t.setAttribute('y', padT+innerH+18);
        t.setAttribute('class','axis');
        t.setAttribute('text-anchor','middle');
        const dt = new Date(now - (CHART.xTicks-c)*(400));
        t.textContent = dt.toLocaleTimeString();
        gAxis.appendChild(t);
      }
    }

    for(let s=0;s<6;s++){
      const pts = series[s].map((v,i)=> `${xMap(i).toFixed(1)},${yMap(v).toFixed(1)}`).join(' ');
      $("line"+(s+1))?.setAttribute('points', pts);
    }

    $("xaxis") && ($("xaxis").textContent = new Date().toLocaleTimeString());
  }

  /* ==================== SIM (สุ่มค่า) ==================== */
  const MOTOR_BASE = [400, 700, 1000, 1300, 1700, 2200];
  const MOTOR_JIT  = 35;

  function step(){
    if (!running || livePLC) return;

    TAGS.temp = 26 + Math.sin(Date.now()/10000)*1.2;
    TAGS.humi = 56 + Math.cos(Date.now()/12000)*2;
    TAGS.oee  = 72 + Math.sin(Date.now()/8000)*4 + Math.random()*1.5;

    for(let i=0;i<6;i++){
      const wave = Math.sin(Date.now()/1800 + i)*40;
      const noise = (Math.random()*MOTOR_JIT - MOTOR_JIT/2);
      const v = Math.max(CHART.yMin, Math.min(CHART.yMax, MOTOR_BASE[i] + wave + noise));
      TAGS.motors[i] = v;
    }

    TAGS.cells = TAGS.cells.map((v,i)=> 75 + Math.sin(Date.now()/9000 + i)*4 + (Math.random()*2-1));

    for(let s=0;s<6;s++){
      series[s].push(TAGS.motors[s]);
      if(series[s].length>maxPts) series[s].shift();
    }
    renderLeft(); renderOrder(); renderMachine(); renderCells(); renderChart();
  }

  /* ==================== PLC BRIDGE ==================== */
  function applyFromPLC(payload){
    if(!payload || typeof payload!=='object') return;

    Object.assign(TAGS, payload);

    if (Array.isArray(payload.motors)) {
      for(let s=0;s<6;s++){
        series[s].push(payload.motors[s] ?? TAGS.motors[s]);
        if(series[s].length>maxPts) series[s].shift();
      }
    }

    renderLeft(); renderOrder(); renderMachine(); renderCells(); renderChart();

    livePLC = true;
    if (simTimer){ clearInterval(simTimer); simTimer = null; }
  }
  window.PLC_INGEST = applyFromPLC;

  function connectPLC_WebSocket(){
    try{
      const ws = new WebSocket(CONFIG.WS_URL);
      ws.onopen = ()=> console.log("[PLC] WS connected");
      ws.onmessage = (ev)=>{
        try{ const data = JSON.parse(ev.data); applyFromPLC(data); }
        catch(e){ console.warn("[PLC] bad payload", e); }
      };
      ws.onclose = ()=> console.log("[PLC] WS closed");
      ws.onerror = (e)=> console.warn("[PLC] WS error", e);
    }catch(err){
      console.warn("[PLC] WS init error", err);
    }
  }

  function connectPLC_HTTP(){
    async function tick(){
      try{
        const r = await fetch(CONFIG.POLL_URL, {cache:"no-store"});
        if(r.ok){ const data = await r.json(); applyFromPLC(data); }
      }catch(e){ /* เงียบไปก่อน */ }
    }
    tick();
    setInterval(tick, CONFIG.POLL_MS);
  }

  /* ==================== ทำให้การ์ด Cell คลิกไปหน้าใหม่ ==================== */
  function makeCellsNavigable(){
    const target = CONFIG.CELL_PAGE || "cell-detail.html";

    document.querySelectorAll(".cells .card.cell").forEach((card, idx) => {
      const id = card.dataset.cell || (idx + 1); // ถ้าไม่มี data-cell จะนับ 1..6 ให้

      // เพื่อการเข้าถึงด้วยคีย์บอร์ด
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `Open Cell ${id}`);

      const go = () => {
        // ไปหน้าเดียวกัน + query string เช่น ?cell=3
        window.location.href = `${target}?cell=${encodeURIComponent(id)}`;
        // หรือหากต้องการแยกไฟล์ตามเบอร์:
        // window.location.href = `cells/cell-${id}.html`;
      };

      card.addEventListener("click", go);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
    });
  }

  /* ==================== BOOT ==================== */
  window.addEventListener('DOMContentLoaded', () => {
    // ปุ่ม START/STOP คุมเฉพาะ simulator
    $("btnStart")?.addEventListener("click", ()=>{running=true;  TAGS.state="Running"; renderOrder();});
    $("btnStop") ?.addEventListener("click", ()=>{running=false; TAGS.state="Stopped"; renderOrder();});

    // init steps containers
    for(let i=1;i<=6;i++){
      const s=$("steps"+i);
      if(s){ s.innerHTML=''; for(let k=0;k<STEP_COUNT;k++) s.appendChild(document.createElement('span')); }
    }
    renderLeft(); renderOrder(); renderMachine(); renderCells(); renderChart();

    // 👉 ทำให้การ์ด Cell 1–6 คลิกได้
    makeCellsNavigable();

    // เลือกโหมดทำงาน
    if (CONFIG.MODE === "SIM"){
      simTimer = setInterval(step, 400);
    } else {
      connectPLC_WebSocket();   // แนะนำ WS
      // connectPLC_HTTP();     // หรือ polling
    }
  });

  /* HOW TO WIRE REAL TAGS:
     - ฝั่ง Python (server.py) มี WS ที่ /ws และ REST ที่ /api/tags, /api/ingest
     - ถ้าจะทดสอบจากหน้าเว็บ: PLC_INGEST({ temp:27.5, motors:[330,331,329,332,328,330], cells:[82,79,80,81,78,83] })
  */
})();
