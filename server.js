// npm i express socket.io modbus-serial
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ModbusRTU = require('modbus-serial');

const PLC = { ip: '192.168.1.10', port: 502, unitId: 1 }; // <-- แก้เป็นของคุณ
const POLL_MS = 300;                                      // รอบดึงค่า (ms)
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static('public')); // โฮสต์ไฟล์หน้าเว็บ (โฟลเดอร์ public)

const mb = new ModbusRTU();
(async () => {
  await mb.connectTCP(PLC.ip, { port: PLC.port });
  mb.setID(PLC.unitId);
  console.log('Modbus connected');
})().catch(console.error);

// ช่วยลดซ้ำ: อ่าน holding regs
async function H(addr, len) {
  const { data } = await mb.readHoldingRegisters(addr, len);
  return data;
}

// ตัวอย่าง mapping (แก้ตามจริง)
// address ที่ใส่เป็นตัวอย่างสมมติ (เริ่มนับ 0). ถ้า PLC คุณนับแบบ 40001 ให้ลบ 40001 ออก
async function readSnapshot() {
  try {
    const t = await H(0, 2);      // 0: temp*10, 1: humi*10
    const motors = await H(10, 6); // 10..15: rpm
    const cells  = await H(20, 6); // 20..25: %

    return {
      temp:  t[0] / 10,               // °C
      humi:  t[1] / 10,               // %
      oee:   74,                      // ใส่จริงภายหลัง
      count: 25,                      // ใส่จริงภายหลัง
      orderNo: "RGW2246422",
      sizeSpool: "Φ180",
      yarnType: "MONO",
      yarnSize: "0.22",
      state: "Running",
      motors: motors.map(v => v),     // rpm
      cells:  cells.map(v => v/1)     // %
    };
  } catch (e) {
    console.error('readSnapshot', e.message);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('client connected');
  socket.emit('mode', 'live'); // แจ้งฝั่งเว็บให้ปิด simulation

  // ส่ง snapshot ครั้งแรก
  readSnapshot().then(snap => snap && socket.emit('snapshot', snap));
});

// loop ดึงค่าจาก PLC แล้วกระจายให้ทุก client
setInterval(async () => {
  const snap = await readSnapshot();
  if (snap) io.emit('snapshot', snap);
}, POLL_MS);

const PORT = 3000;
server.listen(PORT, () => console.log('Server on http://localhost:'+PORT));

// npm i express socket.io modbus-serial
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ModbusRTU = require('modbus-serial');

const PLC = { ip: '192.168.1.10', port: 502, unitId: 1 }; // <-- แก้เป็นของคุณ
const POLL_MS = 300;                                      // รอบดึงค่า (ms)
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static('public')); // โฮสต์ไฟล์หน้าเว็บ (โฟลเดอร์ public)

const mb = new ModbusRTU();
(async () => {
  await mb.connectTCP(PLC.ip, { port: PLC.port });
  mb.setID(PLC.unitId);
  console.log('Modbus connected');
})().catch(console.error);

// ช่วยลดซ้ำ: อ่าน holding regs
async function H(addr, len) {
  const { data } = await mb.readHoldingRegisters(addr, len);
  return data;
}

// ตัวอย่าง mapping (แก้ตามจริง)
// address ที่ใส่เป็นตัวอย่างสมมติ (เริ่มนับ 0). ถ้า PLC คุณนับแบบ 40001 ให้ลบ 40001 ออก
async function readSnapshot() {
  try {
    const t = await H(0, 2);      // 0: temp*10, 1: humi*10
    const motors = await H(10, 6); // 10..15: rpm
    const cells  = await H(20, 6); // 20..25: %

    return {
      temp:  t[0] / 10,               // °C
      humi:  t[1] / 10,               // %
      oee:   74,                      // ใส่จริงภายหลัง
      count: 25,                      // ใส่จริงภายหลัง
      orderNo: "RGW2246422",
      sizeSpool: "Φ180",
      yarnType: "MONO",
      yarnSize: "0.22",
      state: "Running",
      motors: motors.map(v => v),     // rpm
      cells:  cells.map(v => v/1)     // %
    };
  } catch (e) {
    console.error('readSnapshot', e.message);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('client connected');
  socket.emit('mode', 'live'); // แจ้งฝั่งเว็บให้ปิด simulation

  // ส่ง snapshot ครั้งแรก
  readSnapshot().then(snap => snap && socket.emit('snapshot', snap));
});

// loop ดึงค่าจาก PLC แล้วกระจายให้ทุก client
setInterval(async () => {
  const snap = await readSnapshot();
  if (snap) io.emit('snapshot', snap);
}, POLL_MS);

const PORT = 3000;
server.listen(PORT, () => console.log('Server on http://localhost:'+PORT));

