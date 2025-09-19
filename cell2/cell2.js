(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Donut 0..100
  function setDonut(pct){
    const C = 113.097; // circumference r=18
    const a = clamp(pct, 0, 100) / 100 * C;
    $("donutFill")?.setAttribute("stroke-dasharray", `${a.toFixed(1)} ${(C-a).toFixed(1)}`);
    if ($("donutText")) $("donutText").textContent = `${Math.round(pct)}%`;
  }

  // สัญลักษณ์แนวโน้ม ▲ ▼ –
  function trendSymbol(delta, eps=0.05){
    if (delta > eps)  return "▲";
    if (delta < -eps) return "▼";
    return "–";
  }

  /* ---------- model ---------- */
  const CELL = {
    id: 2,
    state: "RUNNING",

    patchDone: 0,
    patchTarget: 120,
    ratePerMin: 8,

    temp: 26,
    humi: 56,

    rpm: 900,
    tension: 14.0,
    speed: 18.4,
    torque: 29,

    alarms: [
      { t: Date.now(), msg: "พร้อมทำงาน", lvl: "ok" }
    ]
  };

  /* ---------- render ---------- */
  function renderAll(prev = {}){
    $("cellId").textContent = CELL.id;
    $("cellState").textContent = CELL.state;

    $("patchDone").textContent = `${Math.floor(CELL.patchDone).toLocaleString()} pcs`;
    $("patchTarget").textContent = CELL.patchTarget.toLocaleString();
    $("rate").textContent = `${CELL.ratePerMin.toFixed(0)} ชิ้น/นาที`;

    const remain = Math.max(0, CELL.patchTarget - CELL.patchDone);
    const etaMin = CELL.ratePerMin > 0 ? remain / CELL.ratePerMin : 0;
    const etaStr = remain === 0 ? "เสร็จแล้ว" : new Date(Date.now() + etaMin*60000).toLocaleTimeString();
    $("eta") && ($("eta").textContent = etaStr);

    const pct = CELL.patchTarget > 0 ? (CELL.patchDone / CELL.patchTarget) * 100 : 0;
    setDonut(pct);

    $("temp").textContent = `${Math.round(CELL.temp)}°C`;
    $("humi").textContent = `${Math.round(CELL.humi)}%`;

    $("rpm").textContent     = Math.round(CELL.rpm);
    $("tension").textContent = `${CELL.tension.toFixed(1)} N`;
    $("speed").textContent   = `${CELL.speed.toFixed(1)} m/min`;
    $("torque").textContent  = `${Math.round(CELL.torque)}%`;

    $("tr-rpm")     && ($("tr-rpm").textContent     = trendSymbol(CELL.rpm - (prev.rpm ?? CELL.rpm)));
    $("tr-tension") && ($("tr-tension").textContent = trendSymbol(CELL.tension - (prev.tension ?? CELL.tension)));
    $("tr-speed")   && ($("tr-speed").textContent   = trendSymbol(CELL.speed - (prev.speed ?? CELL.speed)));
    $("tr-torque")  && ($("tr-torque").textContent  = trendSymbol(CELL.torque - (prev.torque ?? CELL.torque)));

    const ul = $("alarmList");
    if (ul){
      ul.innerHTML = "";
      CELL.alarms.slice(-5).forEach(a=>{
        const li = document.createElement("li");
        li.innerHTML = `<span>${new Date(a.t).toLocaleTimeString()} — ${a.msg}</span><b class="${a.lvl}">${a.lvl.toUpperCase()}</b>`;
        ul.appendChild(li);
      });
    }
  }

  /* ---------- mini chart ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const chart = { w:900, h:260, pad:{t:16,r:10,b:26,l:48}, maxPts: 140 };
  const data = {
    speed:  Array(chart.maxPts).fill(CELL.speed),
    tens:   Array(chart.maxPts).fill(CELL.tension),
  };

  function ensureChart(){
    const svg = $("spark");
    if (!svg || svg.__built) return;

    const gGrid = document.createElementNS(NS,"g"); gGrid.id="grid";
    const gAxis = document.createElementNS(NS,"g"); gAxis.id="axis";
    const gData = document.createElementNS(NS,"g"); gData.id="lines";
    svg.append(gGrid, gAxis, gData);

    for(let r=0;r<=5;r++){
      const ln = document.createElementNS(NS,"line");
      ln.setAttribute("class","grid");
      gGrid.appendChild(ln);
    }

    [["speed","#23c0ff"],["tens","#fb7185"]].forEach(([id,color])=>{
      const pl = document.createElementNS(NS,"polyline");
      pl.id = `pl-${id}`;
      pl.setAttribute("stroke-width","2.2");
      pl.setAttribute("stroke", color);
      pl.setAttribute("fill","none");
      gData.appendChild(pl);
    });

    svg.__built = true;
  }

  function drawChart(){
    ensureChart();
    const svg = $("spark"); if (!svg) return;
    const {w,h,pad} = chart;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const yMax = Math.max(25, Math.max(...data.speed, ...data.tens) * 1.25);
    const xMap = (i,N) => pad.l + (i/(N-1))*innerW;
    const yMap = (v)   => pad.t + innerH - (v/yMax)*innerH;

    const gGrid = svg.querySelector("#grid");
    const gAxis = svg.querySelector("#axis");
    if (gAxis) gAxis.innerHTML = "";
    if (gGrid){
      gGrid.querySelectorAll("line").forEach((ln, r)=>{
        const y = pad.t + (innerH/5)*r;
        ln.setAttribute("x1", pad.l); ln.setAttribute("x2", pad.l+innerW);
        ln.setAttribute("y1", y); ln.setAttribute("y2", y);

        const tx = document.createElementNS(NS,"text");
        tx.setAttribute("x", pad.l-6); tx.setAttribute("y", y);
        tx.setAttribute("text-anchor","end");
        tx.setAttribute("dominant-baseline","middle");
        tx.textContent = Math.round(yMax - (yMax/5)*r).toString();
        gAxis.appendChild(tx);
      });
    }

    const N = data.speed.length;
    const toPts = arr => arr.map((v,i)=>`${xMap(i,N).toFixed(1)},${yMap(v).toFixed(1)}`).join(" ");
    $("pl-speed")?.setAttribute("points", toPts(data.speed));
    $("pl-tens") ?.setAttribute("points", toPts(data.tens));

    const min = a => Math.min(...a).toFixed(1);
    const max = a => Math.max(...a).toFixed(1);
    const avg = a => (a.reduce((s,v)=>s+v,0)/a.length).toFixed(1);

    $("minSpeed").textContent = min(data.speed);
    $("avgSpeed").textContent = avg(data.speed);
    $("maxSpeed").textContent = max(data.speed);

    $("minTension").textContent = min(data.tens);
    $("avgTension").textContent = avg(data.tens);
    $("maxTension").textContent = max(data.tens);
  }

  /* ---------- simulation ---------- */
  let running = true;
  function tick(){
    const prev = { rpm:CELL.rpm, tension:CELL.tension, speed:CELL.speed, torque:CELL.torque };

    if (running){
      CELL.patchDone = Math.min(CELL.patchTarget, CELL.patchDone + CELL.ratePerMin/60);

      CELL.temp += (Math.random()*0.2 - 0.1);
      CELL.humi += (Math.random()*0.2 - 0.1);

      CELL.rpm     += (Math.random()*10  - 5);
      CELL.tension += (Math.random()*0.10 - 0.05);
      CELL.speed   += (Math.random()*0.10 - 0.05);
      CELL.torque  += (Math.random()*0.6  - 0.3);

      data.speed.push(Math.max(0, CELL.speed));  if (data.speed.length > chart.maxPts) data.speed.shift();
      data.tens .push(Math.max(0, CELL.tension));if (data.tens .length > chart.maxPts) data.tens .shift();

      if (Math.random() < 0.02){
        CELL.alarms.push({t:Date.now(), msg:"ความผิดปกติของเครื่องจักร", lvl:"err"});
      }
    }

    renderAll(prev);
    drawChart();
  }

  /* ---------- boot ---------- */
  window.addEventListener("DOMContentLoaded", () => {
    $("btnStart")?.addEventListener("click", () => {
      running = true; CELL.state = "RUNNING";
      CELL.alarms.push({t:Date.now(), msg:"เริ่มเดินเครื่อง", lvl:"ok"});
      renderAll();
    });
    $("btnStop")?.addEventListener("click", () => {
      running = false; CELL.state = "STOPPED";
      CELL.alarms.push({t:Date.now(), msg:"หยุดเครื่องชั่วคราว", lvl:"warn"});
      renderAll();
    });

    renderAll();
    drawChart();
    setInterval(tick, 500);
  });

})();

(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Donut 0..100
  function setDonut(pct){
    const C = 113.097; // circumference r=18
    const a = clamp(pct, 0, 100) / 100 * C;
    $("donutFill")?.setAttribute("stroke-dasharray", `${a.toFixed(1)} ${(C-a).toFixed(1)}`);
    if ($("donutText")) $("donutText").textContent = `${Math.round(pct)}%`;
  }

  // สัญลักษณ์แนวโน้ม ▲ ▼ –
  function trendSymbol(delta, eps=0.05){
    if (delta > eps)  return "▲";
    if (delta < -eps) return "▼";
    return "–";
  }

  /* ---------- model ---------- */
  const CELL = {
    id: 2,
    state: "RUNNING",

    patchDone: 0,
    patchTarget: 120,
    ratePerMin: 8,

    temp: 26,
    humi: 56,

    rpm: 900,
    tension: 14.0,
    speed: 18.4,
    torque: 29,

    alarms: [
      { t: Date.now(), msg: "พร้อมทำงาน", lvl: "ok" }
    ]
  };

  /* ---------- render ---------- */
  function renderAll(prev = {}){
    $("cellId").textContent = CELL.id;
    $("cellState").textContent = CELL.state;

    $("patchDone").textContent = `${Math.floor(CELL.patchDone).toLocaleString()} pcs`;
    $("patchTarget").textContent = CELL.patchTarget.toLocaleString();
    $("rate").textContent = `${CELL.ratePerMin.toFixed(0)} ชิ้น/นาที`;

    const remain = Math.max(0, CELL.patchTarget - CELL.patchDone);
    const etaMin = CELL.ratePerMin > 0 ? remain / CELL.ratePerMin : 0;
    const etaStr = remain === 0 ? "เสร็จแล้ว" : new Date(Date.now() + etaMin*60000).toLocaleTimeString();
    $("eta") && ($("eta").textContent = etaStr);

    const pct = CELL.patchTarget > 0 ? (CELL.patchDone / CELL.patchTarget) * 100 : 0;
    setDonut(pct);

    $("temp").textContent = `${Math.round(CELL.temp)}°C`;
    $("humi").textContent = `${Math.round(CELL.humi)}%`;

    $("rpm").textContent     = Math.round(CELL.rpm);
    $("tension").textContent = `${CELL.tension.toFixed(1)} N`;
    $("speed").textContent   = `${CELL.speed.toFixed(1)} m/min`;
    $("torque").textContent  = `${Math.round(CELL.torque)}%`;

    $("tr-rpm")     && ($("tr-rpm").textContent     = trendSymbol(CELL.rpm - (prev.rpm ?? CELL.rpm)));
    $("tr-tension") && ($("tr-tension").textContent = trendSymbol(CELL.tension - (prev.tension ?? CELL.tension)));
    $("tr-speed")   && ($("tr-speed").textContent   = trendSymbol(CELL.speed - (prev.speed ?? CELL.speed)));
    $("tr-torque")  && ($("tr-torque").textContent  = trendSymbol(CELL.torque - (prev.torque ?? CELL.torque)));

    const ul = $("alarmList");
    if (ul){
      ul.innerHTML = "";
      CELL.alarms.slice(-5).forEach(a=>{
        const li = document.createElement("li");
        li.innerHTML = `<span>${new Date(a.t).toLocaleTimeString()} — ${a.msg}</span><b class="${a.lvl}">${a.lvl.toUpperCase()}</b>`;
        ul.appendChild(li);
      });
    }
  }

  /* ---------- mini chart ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const chart = { w:900, h:260, pad:{t:16,r:10,b:26,l:48}, maxPts: 140 };
  const data = {
    speed:  Array(chart.maxPts).fill(CELL.speed),
    tens:   Array(chart.maxPts).fill(CELL.tension),
  };

  function ensureChart(){
    const svg = $("spark");
    if (!svg || svg.__built) return;

    const gGrid = document.createElementNS(NS,"g"); gGrid.id="grid";
    const gAxis = document.createElementNS(NS,"g"); gAxis.id="axis";
    const gData = document.createElementNS(NS,"g"); gData.id="lines";
    svg.append(gGrid, gAxis, gData);

    for(let r=0;r<=5;r++){
      const ln = document.createElementNS(NS,"line");
      ln.setAttribute("class","grid");
      gGrid.appendChild(ln);
    }

    [["speed","#23c0ff"],["tens","#fb7185"]].forEach(([id,color])=>{
      const pl = document.createElementNS(NS,"polyline");
      pl.id = `pl-${id}`;
      pl.setAttribute("stroke-width","2.2");
      pl.setAttribute("stroke", color);
      pl.setAttribute("fill","none");
      gData.appendChild(pl);
    });

    svg.__built = true;
  }

  function drawChart(){
    ensureChart();
    const svg = $("spark"); if (!svg) return;
    const {w,h,pad} = chart;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const yMax = Math.max(25, Math.max(...data.speed, ...data.tens) * 1.25);
    const xMap = (i,N) => pad.l + (i/(N-1))*innerW;
    const yMap = (v)   => pad.t + innerH - (v/yMax)*innerH;

    const gGrid = svg.querySelector("#grid");
    const gAxis = svg.querySelector("#axis");
    if (gAxis) gAxis.innerHTML = "";
    if (gGrid){
      gGrid.querySelectorAll("line").forEach((ln, r)=>{
        const y = pad.t + (innerH/5)*r;
        ln.setAttribute("x1", pad.l); ln.setAttribute("x2", pad.l+innerW);
        ln.setAttribute("y1", y); ln.setAttribute("y2", y);

        const tx = document.createElementNS(NS,"text");
        tx.setAttribute("x", pad.l-6); tx.setAttribute("y", y);
        tx.setAttribute("text-anchor","end");
        tx.setAttribute("dominant-baseline","middle");
        tx.textContent = Math.round(yMax - (yMax/5)*r).toString();
        gAxis.appendChild(tx);
      });
    }

    const N = data.speed.length;
    const toPts = arr => arr.map((v,i)=>`${xMap(i,N).toFixed(1)},${yMap(v).toFixed(1)}`).join(" ");
    $("pl-speed")?.setAttribute("points", toPts(data.speed));
    $("pl-tens") ?.setAttribute("points", toPts(data.tens));

    const min = a => Math.min(...a).toFixed(1);
    const max = a => Math.max(...a).toFixed(1);
    const avg = a => (a.reduce((s,v)=>s+v,0)/a.length).toFixed(1);

    $("minSpeed").textContent = min(data.speed);
    $("avgSpeed").textContent = avg(data.speed);
    $("maxSpeed").textContent = max(data.speed);

    $("minTension").textContent = min(data.tens);
    $("avgTension").textContent = avg(data.tens);
    $("maxTension").textContent = max(data.tens);
  }

  /* ---------- simulation ---------- */
  let running = true;
  function tick(){
    const prev = { rpm:CELL.rpm, tension:CELL.tension, speed:CELL.speed, torque:CELL.torque };

    if (running){
      CELL.patchDone = Math.min(CELL.patchTarget, CELL.patchDone + CELL.ratePerMin/60);

      CELL.temp += (Math.random()*0.2 - 0.1);
      CELL.humi += (Math.random()*0.2 - 0.1);

      CELL.rpm     += (Math.random()*10  - 5);
      CELL.tension += (Math.random()*0.10 - 0.05);
      CELL.speed   += (Math.random()*0.10 - 0.05);
      CELL.torque  += (Math.random()*0.6  - 0.3);

      data.speed.push(Math.max(0, CELL.speed));  if (data.speed.length > chart.maxPts) data.speed.shift();
      data.tens .push(Math.max(0, CELL.tension));if (data.tens .length > chart.maxPts) data.tens .shift();

      if (Math.random() < 0.02){
        CELL.alarms.push({t:Date.now(), msg:"ความผิดปกติของเครื่องจักร", lvl:"err"});
      }
    }

    renderAll(prev);
    drawChart();
  }

  /* ---------- boot ---------- */
  window.addEventListener("DOMContentLoaded", () => {
    $("btnStart")?.addEventListener("click", () => {
      running = true; CELL.state = "RUNNING";
      CELL.alarms.push({t:Date.now(), msg:"เริ่มเดินเครื่อง", lvl:"ok"});
      renderAll();
    });
    $("btnStop")?.addEventListener("click", () => {
      running = false; CELL.state = "STOPPED";
      CELL.alarms.push({t:Date.now(), msg:"หยุดเครื่องชั่วคราว", lvl:"warn"});
      renderAll();
    });

    renderAll();
    drawChart();
    setInterval(tick, 500);
  });

})();
