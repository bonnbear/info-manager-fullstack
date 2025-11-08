const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'db.json');

// 中介軟體
app.use(cors()); // 允許跨域
app.use(express.json({ limit: '10mb' })); // 解析 JSON 請求體，並增加圖片大小限制

// 輔助函式：讀取資料
const readData = async () => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // 如果檔案不存在或為空，返回預設結構
        if (error.code === 'ENOENT') {
            return { entries: [] };
        }
        throw error;
    }
};

// 輔助函式：寫入資料
const writeData = async (data) => {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
};

// --- API 路由 ---

// GET /api/entries - 獲取所有資料
app.get('/api/entries', async (req, res) => {
    const data = await readData();
    res.json(data.entries);
});

// POST /api/entries - 新增一筆資料
app.post('/api/entries', async (req, res) => {
    const data = await readData();
    const newEntry = {
        id: Date.now().toString(), // 使用時間戳作為唯一 ID
        ...req.body
    };
    data.entries.push(newEntry);
    await writeData(data);
    res.status(201).json(newEntry);
});

// PUT /api/entries/:id - 更新一筆資料
app.put('/api/entries/:id', async (req, res) => {
    const { id } = req.params;
    const data = await readData();
    const entryIndex = data.entries.findIndex(e => e.id === id);

    if (entryIndex === -1) {
        return res.status(404).json({ message: 'Entry not found' });
    }

    data.entries[entryIndex] = { ...data.entries[entryIndex], ...req.body };
    await writeData(data);
    res.json(data.entries[entryIndex]);
});

// DELETE /api/entries/:id - 刪除一筆資料
app.delete('/api/entries/:id', async (req, res) => {
    const { id } = req.params;
    const data = await readData();
    const updatedEntries = data.entries.filter(e => e.id !== id);

    if (data.entries.length === updatedEntries.length) {
        return res.status(404).json({ message: 'Entry not found' });
    }

    data.entries = updatedEntries;
    await writeData(data);
    res.status(204).send(); // 204 No Content
});

// 為了讓 Vercel 能將其作為 Serverless Function 運行
module.exports = app;

// 僅在本地開發時監聽端口
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
      console.log(`Backend server is running on http://localhost:${PORT}`);
  });
}