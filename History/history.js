document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.querySelector("#historyTable tbody");
  const chart = document.querySelector("#historyChart");

  // เก็บข้อมูล log จำลอง
  let logs = [];

  // ฟังก์ชันเพิ่ม log
  function addLog() {
    const now = new Date().toLocaleTimeString();
    const temp = 25 + Math.random() * 5;
    const humi = 50 + Math.random() * 10;
    const oee = 70 + Math.random() * 10;
    const count = Math.floor(Math.random() * 1000);

    const record = { time: now, temp, humi, oee, count };
    logs.push(record);

    // เก็บล่าสุดไม่เกิน 20 records
    if (logs.length > 20) logs.shift();

    renderTable();
    renderChart();
  }

  // Render Table
  function renderTable() {
    tableBody.innerHTML = "";
    logs.forEach(r => {
      const row = `<tr>
        <td>${r.time}</td>
        <td>${r.temp.toFixed(1)}</td>
        <td>${r.humi.toFixed(1)}</td>
        <td>${r.oee.toFixed(1)}</td>
        <td>${r.count}</td>
      </tr>`;
      tableBody.insertAdjacentHTML("beforeend", row);
    });
  }

  // Render Chart (line chart ของ OEE)
  function renderChart() {
    chart.innerHTML = "";
    if (logs.length < 2) return;

    const w = 800, h = 300, pad = 30;
    const maxOEE = 100;
    const xStep = (w - pad * 2) / (logs.length - 1);

    let points = logs.map((r, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (r.oee / maxOEE) * (h - pad * 2);
      return `${x},${y}`;
    }).join(" ");

    // Draw Axis
    const axisX = `<line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#ccc"/>`;
    const axisY = `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="#ccc"/>`;

    // Draw Line
    const line = `<polyline points="${points}" fill="none" stroke="#7fb8ff" stroke-width="2"/>`;

    chart.innerHTML = axisX + axisY + line;
  }

  // เพิ่ม log ทุก 2 วิ
  setInterval(addLog, 2000);
});
